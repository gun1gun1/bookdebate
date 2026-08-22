"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isPostMeetingOpen } from "@/lib/topics";

type ActionResult = { ok: true } | { ok: false; error: string };

async function loadTopicWithSession(supabase: ReturnType<typeof getSupabaseServerClient>, topicId: string) {
  const { data } = await supabase
    .from("topics")
    .select("id, session_id, kind, session:sessions(id, status)")
    .eq("id", topicId)
    .maybeSingle();
  return data;
}

// free/difficult 전용 — 이 두 kind는 항상 slot=0 하나만 쓰므로 (topic_id,
// member_id, slot) 3컬럼 유니크 제약을 그대로 upsert의 충돌 대상으로 쓸 수
// 있다(존재 여부를 먼저 조회할 필요 없음, DB가 원자적으로 처리). excerpt는
// R1-f(발췌 다건 허용)부터 upsertExcerptAction을 따로 쓴다(1인 다건이라
// slot이 0 고정이 아니게 됐다). choice 컬럼은 이 함수의 payload에 포함하지
// 않는다 — upsertChoiceAction이 별도로 책임지며, 여기서 키 자체를 생략해야
// 그 값이 보존된다(appendix의 title/slot도 이 함수 대상이 아니다 —
// upsertAppendixAction 참고).
export async function upsertAnswerAction(
  topicId: string,
  input: { body?: string; quoteText?: string; quoteReason?: string }
): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = getSupabaseServerClient();

  const topic = await loadTopicWithSession(supabase, topicId);
  if (!topic || !topic.session) return { ok: false, error: "논제를 찾을 수 없습니다." };
  if (topic.session.status !== "open") {
    return { ok: false, error: "지금은 이 회차에 답변을 작성할 수 없습니다." };
  }

  const { error } = await supabase.from("answers").upsert(
    {
      topic_id: topicId,
      member_id: session.memberId,
      slot: 0,
      body: input.body ?? null,
      quote_text: input.quoteText ?? null,
      quote_reason: input.quoteReason ?? null,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "topic_id,member_id,slot" }
  );

  if (error) return { ok: false, error: "저장하지 못했습니다." };

  revalidatePath(`/s/${topic.session_id}`);
  revalidatePath("/");
  revalidatePath("/me");
  return { ok: true };
}

// excerpt 전용, R1-f(발췌 다건 허용) — 1인 다건이라 (topic_id, member_id)만으로
// 특정 발췌를 고를 수 없다. appendix(upsertAppendixAction)와 같은 패턴:
// answerId가 없으면 새 발췌(slot = 기존 최대값+1), 있으면 그 발췌의 소유자
// 본인인지 확인한 뒤 update한다.
export async function upsertExcerptAction(
  topicId: string,
  answerId: string | null,
  input: { quoteText: string; quoteReason: string }
): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = getSupabaseServerClient();

  const topic = await loadTopicWithSession(supabase, topicId);
  if (!topic || !topic.session || topic.kind !== "excerpt") {
    return { ok: false, error: "논제를 찾을 수 없습니다." };
  }
  if (topic.session.status !== "open") {
    return { ok: false, error: "지금은 이 회차에 답변을 작성할 수 없습니다." };
  }

  if (answerId) {
    const { data: existing } = await supabase
      .from("answers")
      .select("id, member_id")
      .eq("id", answerId)
      .maybeSingle();

    if (!existing) return { ok: false, error: "발췌를 찾을 수 없습니다." };
    if (existing.member_id !== session.memberId) {
      return { ok: false, error: "본인 발췌만 수정할 수 있습니다." };
    }

    const { error } = await supabase
      .from("answers")
      .update({
        quote_text: input.quoteText,
        quote_reason: input.quoteReason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", answerId)
      .eq("member_id", session.memberId);

    if (error) return { ok: false, error: "저장하지 못했습니다." };
  } else {
    const nextSlot = async () => {
      const { data: rows } = await supabase
        .from("answers")
        .select("slot")
        .eq("topic_id", topicId)
        .eq("member_id", session.memberId)
        .order("slot", { ascending: false })
        .limit(1);
      return rows && rows.length > 0 ? rows[0].slot + 1 : 0;
    };

    const insertRow = async (slot: number) =>
      supabase.from("answers").insert({
        topic_id: topicId,
        member_id: session.memberId,
        slot,
        quote_text: input.quoteText,
        quote_reason: input.quoteReason,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    let { error } = await insertRow(await nextSlot());
    if (error) {
      // 동시 제출 경합으로 slot이 겹쳤을 가능성 — 1회만 재계산해 재시도.
      ({ error } = await insertRow(await nextSlot()));
    }
    if (error) return { ok: false, error: "저장하지 못했습니다." };
  }

  revalidatePath(`/s/${topic.session_id}`);
  revalidatePath("/");
  revalidatePath("/me");
  return { ok: true };
}

// choice 전용 — 이 논제의 "발제 게시물"(구체적인 논제/장면)을 올리거나 수정한다.
// R1-f(사전 작성 허용)부터는 게시물이 없어도 누구든 먼저 입장(찬반)만 미리
// 적을 수 있고, 그 순간 answers 행이 body=null인 "앵커"로 생긴다(replies가
// 붙을 자리가 필요해서 — upsertChoiceStanceAction 참고). 그래서 여기서
// "게시물이 없다"는 더 이상 "answers 행이 없다"가 아니라 "있어도 body가
// 비어 있다"로 판정한다: body가 비어 있으면 아직 아무도 실제 게시물(장면
// 소개)을 쓰지 않은 것이므로, 그 앵커를 처음 채우는 사람이 누구든(앵커를
// 만든 사람과 달라도) 게시물 작성자가 된다(member_id를 그 사람으로 갱신).
// body가 이미 채워져 있으면 원래대로 그 작성자만 수정할 수 있다.
// answerId가 없는 "새로 올리기" 호출도 같은 규칙을 따른다 — 이미 앵커가
// 있으면 insert 대신 update로 그 행을 채운다(같은 topic에 answers 행이
// 두 개 생기지 않도록).
//
// 빈 앵커를 채우는 update는 반드시 `.is("body", null)`로 원자적으로 조건을
// 걸어야 한다 — "body가 비었는지 확인하는 SELECT"와 "채우는 UPDATE" 사이에
// 짧은 창이 있어, 이 조건 없이는 두 사람이 거의 동시에 "논제 올리기"를
// 눌렀을 때 둘 다 "아직 비어 있다"고 읽고 둘 다 무조건 update를 실행해
// 나중에 커밋되는 쪽이 먼저 쓴 사람의 글을 조용히 덮어쓸 수 있다(순수
// 안전망 없는 lost-update). `.is("body", null)`을 건 update가 실제로 몇 행을
// 바꿨는지 확인해, 이미 다른 사람이 그 사이 채워 넣었다면(0행 갱신) 이
// 호출은 "이미 다른 참여자가 논제를 올렸습니다"로 실패 처리한다 — 늦게
// 도착한 쪽의 글은 버려지고, 먼저 커밋된 쪽만 유지된다.
// 앵커 자체가 하나도 없어 새로 insert하는 경합(두 사람이 각각 다른
// member_id로 새 행을 만드는 경우)은 이 함수 범위 밖의 별개 문제로, 참여자
// 5~8명 규모의 저빈도 사용에서 받아들이기로 한 기존 위험이다
// (upsertAppendixAction의 slot 계산과 같은 수준).
export async function upsertChoiceTopicAction(
  topicId: string,
  answerId: string | null,
  body: string
): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = getSupabaseServerClient();

  const topic = await loadTopicWithSession(supabase, topicId);
  if (!topic || !topic.session || topic.kind !== "choice") {
    return { ok: false, error: "논제를 찾을 수 없습니다." };
  }
  if (topic.session.status !== "open") {
    return { ok: false, error: "지금은 이 회차에 논제를 올릴 수 없습니다." };
  }

  let target: { id: string; member_id: string; body: string | null } | null = null;
  if (answerId) {
    const { data } = await supabase
      .from("answers")
      .select("id, member_id, topic_id, body")
      .eq("id", answerId)
      .maybeSingle();
    if (!data || data.topic_id !== topicId) {
      return { ok: false, error: "게시물을 찾을 수 없습니다." };
    }
    target = data;
  } else {
    const { data } = await supabase
      .from("answers")
      .select("id, member_id, body")
      .eq("topic_id", topicId)
      .maybeSingle();
    target = data;
  }

  if (!target) {
    const { error } = await supabase.from("answers").insert({
      topic_id: topicId,
      member_id: session.memberId,
      slot: 0,
      body,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) return { ok: false, error: "저장하지 못했습니다." };

    revalidatePath(`/s/${topic.session_id}`);
    revalidatePath("/");
    revalidatePath("/me");
    return { ok: true };
  }

  const alreadyPosted = Boolean(target.body?.trim());
  if (alreadyPosted && target.member_id !== session.memberId) {
    return { ok: false, error: "본인 게시물만 수정할 수 있습니다." };
  }

  if (!alreadyPosted) {
    const { data: updated, error } = await supabase
      .from("answers")
      .update({
        body,
        member_id: session.memberId,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", target.id)
      .is("body", null)
      .select("id");

    if (error) return { ok: false, error: "저장하지 못했습니다." };
    if (!updated || updated.length === 0) {
      return { ok: false, error: "이미 다른 참여자가 논제를 올렸습니다." };
    }
  } else {
    const { error } = await supabase
      .from("answers")
      .update({ body, updated_at: new Date().toISOString() })
      .eq("id", target.id)
      .eq("member_id", session.memberId);

    if (error) return { ok: false, error: "저장하지 못했습니다." };
  }

  revalidatePath(`/s/${topic.session_id}`);
  revalidatePath("/");
  revalidatePath("/me");
  return { ok: true };
}

// choice 전용, R1-f(사전 작성 허용) — 아직 게시물(장면 소개)이 없어도 각자
// 입장(찬반)과 이유를 미리 적을 수 있게 한다. answers는 (topic_id,
// member_id, slot) 유니크라 topic당 한 행뿐인 이 kind의 전제상 이 topic에
// 아직 아무 answers 행도 없을 때만 호출된다 — 있으면 그 행(진짜 게시물이든
// 다른 사람의 사전 작성으로 생긴 앵커든)을 그대로 재사용해 반응만 얹는다.
// body는 null로 둬(비어 있음 = "아직 게시물 없음"의 판정 기준, 위
// upsertChoiceTopicAction 주석 참고) 나중에 누구든 실제 게시물을 쓸 수 있게
// 비워 둔다.
export async function upsertChoiceStanceAction(
  topicId: string,
  choiceValue: string,
  body: string
): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = getSupabaseServerClient();

  const { data: topic } = await supabase
    .from("topics")
    .select("id, session_id, kind, choice_options, session:sessions(status)")
    .eq("id", topicId)
    .maybeSingle();

  if (!topic || !topic.session || topic.kind !== "choice") {
    return { ok: false, error: "논제를 찾을 수 없습니다." };
  }
  if (topic.session.status !== "open") {
    return { ok: false, error: "지금은 입장을 밝힐 수 없습니다." };
  }
  if (!topic.choice_options.includes(choiceValue)) {
    return { ok: false, error: "선택지가 올바르지 않습니다." };
  }

  const { data: existingAnswer } = await supabase
    .from("answers")
    .select("id")
    .eq("topic_id", topicId)
    .maybeSingle();

  let answerId = existingAnswer?.id ?? null;
  if (!answerId) {
    const { data: inserted, error: insertError } = await supabase
      .from("answers")
      .insert({ topic_id: topicId, member_id: session.memberId, slot: 0, body: null })
      .select("id")
      .single();
    if (insertError || !inserted) return { ok: false, error: "저장하지 못했습니다." };
    answerId = inserted.id;
  }

  const error = await upsertChoiceReplyRow(supabase, answerId, session.memberId, choiceValue, body);
  if (error) return { ok: false, error: "저장하지 못했습니다." };

  revalidatePath(`/s/${topic.session_id}`);
  revalidatePath("/");
  return { ok: true };
}

// choice 찬반 reply upsert의 공통 본체 — upsertChoiceReplyAction(게시물이
// 이미 있는 상태)과 upsertChoiceStanceAction(사전 작성, 앵커를 막 만든
// 직후) 양쪽이 공유한다. 한 사람당 한 게시물에는 reply가 하나뿐이어야
// 하므로 member_id로 기존 reply를 먼저 찾아 있으면 update, 없으면 insert한다
// — 별도 유니크 제약을 두는 대신(찬반 reply와 일반 reply를 같은 replies
// 테이블이 공유하므로 answer_id+member_id 유니크를 강제하면 다른 kind의
// "여러 번 의견 남기기"를 막아버린다) 이 함수 안에서만 "한 명당 하나"를
// 지킨다. 성공하면 null, 실패하면 에러 메시지를 반환한다.
async function upsertChoiceReplyRow(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  answerId: string,
  memberId: string,
  choiceValue: string,
  body: string
): Promise<string | null> {
  const { data: existingReply } = await supabase
    .from("replies")
    .select("id")
    .eq("answer_id", answerId)
    .eq("member_id", memberId)
    .maybeSingle();

  const reasonBody = body.trim() || "";

  if (existingReply) {
    const { error } = await supabase
      .from("replies")
      .update({ choice: choiceValue, body: reasonBody })
      .eq("id", existingReply.id);
    return error ? "저장하지 못했습니다." : null;
  }

  const { error } = await supabase.from("replies").insert({
    answer_id: answerId,
    member_id: memberId,
    choice: choiceValue,
    body: reasonBody,
  });
  return error ? "저장하지 못했습니다." : null;
}

// choice 전용 — 발제 게시물 하나에 대한 찬반 반응. choice는 topics.choice_options
// 안의 값이어야 한다(서버에서 검증).
export async function upsertChoiceReplyAction(
  answerId: string,
  choiceValue: string,
  body: string
): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = getSupabaseServerClient();

  const { data: answer } = await supabase
    .from("answers")
    .select("id, topic:topics(kind, choice_options, session_id, session:sessions(status))")
    .eq("id", answerId)
    .maybeSingle();

  if (!answer || !answer.topic || !answer.topic.session) {
    return { ok: false, error: "게시물을 찾을 수 없습니다." };
  }
  if (answer.topic.kind !== "choice") {
    return { ok: false, error: "찬반 논제가 아닙니다." };
  }
  if (answer.topic.session.status !== "open") {
    return { ok: false, error: "지금은 입장을 밝힐 수 없습니다." };
  }
  if (!answer.topic.choice_options.includes(choiceValue)) {
    return { ok: false, error: "선택지가 올바르지 않습니다." };
  }

  const error = await upsertChoiceReplyRow(supabase, answerId, session.memberId, choiceValue, body);
  if (error) return { ok: false, error };

  revalidatePath(`/s/${answer.topic.session_id}`);
  revalidatePath("/");
  return { ok: true };
}

// appendix 전용 — 1인 다건이라 (topic_id, member_id)만으로 특정 글을 고를 수
// 없다. answerId가 없으면 새 글(slot = 기존 최대값+1), 있으면 그 글의 소유자
// 본인인지 확인한 뒤 update한다.
export async function upsertAppendixAction(
  topicId: string,
  answerId: string | null,
  input: { title?: string; body: string }
): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = getSupabaseServerClient();

  const topic = await loadTopicWithSession(supabase, topicId);
  if (!topic || !topic.session) return { ok: false, error: "논제를 찾을 수 없습니다." };
  if (topic.session.status !== "open") {
    return { ok: false, error: "지금은 이 회차에 글을 쓸 수 없습니다." };
  }

  if (answerId) {
    const { data: existing } = await supabase
      .from("answers")
      .select("id, member_id")
      .eq("id", answerId)
      .maybeSingle();

    if (!existing) return { ok: false, error: "글을 찾을 수 없습니다." };
    if (existing.member_id !== session.memberId) {
      return { ok: false, error: "본인 글만 수정할 수 있습니다." };
    }

    const { error } = await supabase
      .from("answers")
      .update({
        title: input.title ?? null,
        body: input.body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", answerId)
      .eq("member_id", session.memberId);

    if (error) return { ok: false, error: "저장하지 못했습니다." };
  } else {
    const nextSlot = async () => {
      const { data: rows } = await supabase
        .from("answers")
        .select("slot")
        .eq("topic_id", topicId)
        .eq("member_id", session.memberId)
        .order("slot", { ascending: false })
        .limit(1);
      return rows && rows.length > 0 ? rows[0].slot + 1 : 0;
    };

    const insertRow = async (slot: number) =>
      supabase.from("answers").insert({
        topic_id: topicId,
        member_id: session.memberId,
        slot,
        title: input.title ?? null,
        body: input.body,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    let { error } = await insertRow(await nextSlot());
    if (error) {
      // 동시 제출 경합으로 slot이 겹쳤을 가능성 — 1회만 재계산해 재시도.
      ({ error } = await insertRow(await nextSlot()));
    }
    if (error) return { ok: false, error: "저장하지 못했습니다." };
  }

  revalidatePath(`/s/${topic.session_id}`);
  revalidatePath("/");
  revalidatePath("/me");
  return { ok: true };
}

export async function deleteAnswerAction(
  answerId: string
): Promise<{ ok: true; deletedReplyCount: number } | { ok: false; error: string }> {
  const session = await requireSession();
  const supabase = getSupabaseServerClient();

  const { data: answer } = await supabase
    .from("answers")
    .select("id, member_id, topic:topics(session_id, session:sessions(status))")
    .eq("id", answerId)
    .maybeSingle();

  if (!answer || !answer.topic || !answer.topic.session) {
    return { ok: false, error: "답변을 찾을 수 없습니다." };
  }
  if (answer.member_id !== session.memberId && session.role !== "admin") {
    return { ok: false, error: "본인 답변만 삭제할 수 있습니다." };
  }
  if (answer.topic.session.status !== "open") {
    return { ok: false, error: "지금은 이 회차에서 삭제할 수 없습니다." };
  }

  const { count } = await supabase
    .from("replies")
    .select("id", { count: "exact", head: true })
    .eq("answer_id", answerId);

  const { error } = await supabase.from("answers").delete().eq("id", answerId);
  if (error) return { ok: false, error: "삭제하지 못했습니다." };

  revalidatePath(`/s/${answer.topic.session_id}`);
  revalidatePath("/");
  revalidatePath("/me");
  return { ok: true, deletedReplyCount: count ?? 0 };
}

export async function upsertReplyAction(
  answerId: string,
  replyId: string | null,
  body: string
): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = getSupabaseServerClient();

  if (!body.trim()) return { ok: false, error: "내용을 입력해 주세요." };

  const { data: answer } = await supabase
    .from("answers")
    .select("id, topic:topics(kind, session_id, session:sessions(status, meets_at))")
    .eq("id", answerId)
    .maybeSingle();

  if (!answer || !answer.topic || !answer.topic.session) {
    return { ok: false, error: "답변을 찾을 수 없습니다." };
  }
  if (answer.topic.session.status !== "open") {
    return { ok: false, error: "지금은 의견을 작성할 수 없습니다." };
  }
  // difficult의 "같이 생각해 보니" 댓글만 모임 당일(KST) 이후로 추가 제한한다
  // (docs/SCHEMA.md "difficult 댓글 게이팅" 절 — session.status==='open'과
  // AND로 결합, 클라이언트 표시만으로 막지 않는다).
  if (answer.topic.kind === "difficult" && !isPostMeetingOpen(answer.topic.session.meets_at)) {
    return { ok: false, error: "모임 당일부터 남길 수 있습니다." };
  }

  if (replyId) {
    const { data: reply } = await supabase
      .from("replies")
      .select("id, member_id")
      .eq("id", replyId)
      .maybeSingle();

    if (!reply) return { ok: false, error: "댓글을 찾을 수 없습니다." };
    if (reply.member_id !== session.memberId && session.role !== "admin") {
      return { ok: false, error: "본인이 쓴 것만 수정할 수 있습니다." };
    }

    const { error } = await supabase.from("replies").update({ body }).eq("id", replyId);
    if (error) return { ok: false, error: "저장하지 못했습니다." };
  } else {
    const { error } = await supabase
      .from("replies")
      .insert({ answer_id: answerId, member_id: session.memberId, body });
    if (error) return { ok: false, error: "저장하지 못했습니다." };
  }

  revalidatePath(`/s/${answer.topic.session_id}`);
  return { ok: true };
}

export async function deleteReplyAction(replyId: string): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = getSupabaseServerClient();

  const { data: reply } = await supabase
    .from("replies")
    .select("id, member_id, answer:answers(topic:topics(session_id, session:sessions(status)))")
    .eq("id", replyId)
    .maybeSingle();

  if (!reply || !reply.answer || !reply.answer.topic || !reply.answer.topic.session) {
    return { ok: false, error: "댓글을 찾을 수 없습니다." };
  }
  if (reply.member_id !== session.memberId && session.role !== "admin") {
    return { ok: false, error: "본인이 쓴 것만 삭제할 수 있습니다." };
  }
  if (reply.answer.topic.session.status !== "open") {
    return { ok: false, error: "지금은 이 회차에서 삭제할 수 없습니다." };
  }

  const { error } = await supabase.from("replies").delete().eq("id", replyId);
  if (error) return { ok: false, error: "삭제하지 못했습니다." };

  revalidatePath(`/s/${reply.answer.topic.session_id}`);
  return { ok: true };
}

export async function upsertRatingAction(sessionId: string, stars: number): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = getSupabaseServerClient();

  const { data: sessionRow } = await supabase
    .from("sessions")
    .select("status")
    .eq("id", sessionId)
    .maybeSingle();

  if (!sessionRow) return { ok: false, error: "회차를 찾을 수 없습니다." };
  if (sessionRow.status !== "open") {
    return { ok: false, error: "지금은 별점을 남길 수 없습니다." };
  }

  const { error } = await supabase
    .from("ratings")
    .upsert(
      { session_id: sessionId, member_id: session.memberId, stars },
      { onConflict: "session_id,member_id" }
    );

  if (error) return { ok: false, error: "저장하지 못했습니다." };

  revalidatePath(`/s/${sessionId}`);
  return { ok: true };
}
