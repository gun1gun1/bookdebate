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

// free/excerpt/difficult/choice 전용 — 이 네 kind는 항상 slot=0 하나만 쓰므로
// (topic_id, member_id, slot) 3컬럼 유니크 제약을 그대로 upsert의 충돌 대상으로
// 쓸 수 있다(존재 여부를 먼저 조회할 필요 없음, DB가 원자적으로 처리).
// choice 컬럼은 이 함수의 payload에 포함하지 않는다 — upsertChoiceAction이
// 별도로 책임지며, 여기서 키 자체를 생략해야 그 값이 보존된다(appendix의
// title/slot도 이 함수 대상이 아니다 — upsertAppendixAction 참고).
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

// choice 전용 — "나는 {선택지}" 버튼이 즉시 호출한다(StarRating과 같은 패턴,
// 별도 저장 버튼 없음). body/quote_text/quote_reason 키를 생략해 upsertAnswerAction이
// 이미 저장해 둔 근거(body)를 건드리지 않는다.
export async function upsertChoiceAction(topicId: string, choiceValue: string): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = getSupabaseServerClient();

  const topic = await loadTopicWithSession(supabase, topicId);
  if (!topic || !topic.session) return { ok: false, error: "논제를 찾을 수 없습니다." };
  if (topic.session.status !== "open") {
    return { ok: false, error: "지금은 이 회차에 입장을 밝힐 수 없습니다." };
  }

  const { error } = await supabase.from("answers").upsert(
    {
      topic_id: topicId,
      member_id: session.memberId,
      slot: 0,
      choice: choiceValue,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "topic_id,member_id,slot" }
  );

  if (error) return { ok: false, error: "저장하지 못했습니다." };

  revalidatePath(`/s/${topic.session_id}`);
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
  // (docs/SCHEMA_R1_DRAFT.md "difficult 댓글 게이팅" 절 — session.status==='open'과
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
