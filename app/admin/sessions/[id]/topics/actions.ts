"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { TopicKind } from "@/lib/supabase/types";

function parseTopicForm(formData: FormData) {
  return {
    orderNo: Number(formData.get("order_no") ?? 0),
    kind: String(formData.get("kind") ?? "free") as TopicKind,
    title: String(formData.get("title") ?? "").trim(),
    body: String(formData.get("body") ?? "").trim() || null,
    assignedMemberId: String(formData.get("assigned_member_id") ?? "") || null,
    hasRating: formData.get("has_rating") === "on",
  };
}

export async function createTopicAction(sessionId: string, formData: FormData) {
  await requireAdmin();

  const input = parseTopicForm(formData);
  if (!input.title) return;

  const supabase = getSupabaseServerClient();
  await supabase.from("topics").insert({
    session_id: sessionId,
    order_no: input.orderNo,
    kind: input.kind,
    title: input.title,
    body: input.body,
    assigned_member_id: input.assignedMemberId,
    has_rating: input.hasRating,
  });

  revalidatePath(`/admin/sessions/${sessionId}/topics`);
}

export async function updateTopicAction(
  sessionId: string,
  topicId: string,
  formData: FormData
) {
  await requireAdmin();

  const input = parseTopicForm(formData);
  if (!input.title) return;

  const supabase = getSupabaseServerClient();
  await supabase
    .from("topics")
    .update({
      order_no: input.orderNo,
      kind: input.kind,
      title: input.title,
      body: input.body,
      assigned_member_id: input.assignedMemberId,
      has_rating: input.hasRating,
    })
    .eq("id", topicId);

  revalidatePath(`/admin/sessions/${sessionId}/topics`);
}

export async function deleteTopicAction(sessionId: string, topicId: string) {
  await requireAdmin();

  const supabase = getSupabaseServerClient();

  const { count } = await supabase
    .from("answers")
    .select("id", { count: "exact", head: true })
    .eq("topic_id", topicId);

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `이 논제에 답변 ${count}개가 이미 있어 삭제할 수 없습니다.`,
    };
  }

  await supabase.from("topics").delete().eq("id", topicId);
  revalidatePath(`/admin/sessions/${sessionId}/topics`);
  return { ok: true };
}
