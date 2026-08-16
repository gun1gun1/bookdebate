"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; error: string };

async function loadTopicWithSession(supabase: ReturnType<typeof getSupabaseServerClient>, topicId: string) {
  const { data } = await supabase
    .from("topics")
    .select("id, session_id, kind, session:sessions(id, status)")
    .eq("id", topicId)
    .maybeSingle();
  return data;
}

export async function upsertAnswerAction(
  topicId: string,
  input: { body?: string; excerptText?: string; excerptReason?: string }
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
      body: input.body ?? null,
      excerpt_text: input.excerptText ?? null,
      excerpt_reason: input.excerptReason ?? null,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "topic_id,member_id" }
  );

  if (error) return { ok: false, error: "저장하지 못했습니다." };

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
    .select("id, topic:topics(kind, session_id, session:sessions(status))")
    .eq("id", answerId)
    .maybeSingle();

  if (!answer || !answer.topic || !answer.topic.session) {
    return { ok: false, error: "답변을 찾을 수 없습니다." };
  }
  if (answer.topic.kind !== "excerpt") {
    return { ok: false, error: "이 논제에는 사유 더하기를 달 수 없습니다." };
  }
  if (answer.topic.session.status !== "open") {
    return { ok: false, error: "지금은 사유 더하기를 작성할 수 없습니다." };
  }

  if (replyId) {
    const { data: reply } = await supabase
      .from("replies")
      .select("id, member_id")
      .eq("id", replyId)
      .maybeSingle();

    if (!reply) return { ok: false, error: "사유 더하기를 찾을 수 없습니다." };
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
    return { ok: false, error: "사유 더하기를 찾을 수 없습니다." };
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
