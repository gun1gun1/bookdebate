"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { SessionStatus } from "@/lib/supabase/types";
import {
  applyTopicSpecs,
  topicSpecsFromSession,
  topicSpecsFromTemplate,
} from "@/lib/admin/topics";

export type TopicSource =
  | { type: "none" }
  | { type: "template"; templateId: string }
  | { type: "clone"; sourceSessionId: string };

export async function createSessionAction(input: {
  bookId: string;
  meetsAt: string;
  deadlineAt: string;
  selectorMemberId: string;
  hostMemberId: string;
  topicSource: TopicSource;
}) {
  await requireAdmin();

  if (!input.bookId || !input.meetsAt) {
    return { ok: false, error: "책과 모임일은 필수입니다." };
  }

  const supabase = getSupabaseServerClient();

  const { data: session, error } = await supabase
    .from("sessions")
    .insert({
      book_id: input.bookId,
      meets_at: input.meetsAt,
      deadline_at: input.deadlineAt || null,
      selector_member_id: input.selectorMemberId || null,
      host_member_id: input.hostMemberId || null,
    })
    .select("id")
    .single();

  if (error || !session) {
    return { ok: false, error: "회차를 만들지 못했습니다." };
  }

  if (input.topicSource.type === "template") {
    const specs = await topicSpecsFromTemplate(input.topicSource.templateId);
    await applyTopicSpecs(session.id, specs);
  } else if (input.topicSource.type === "clone") {
    const specs = await topicSpecsFromSession(input.topicSource.sourceSessionId);
    await applyTopicSpecs(session.id, specs);
  }

  revalidatePath("/admin/sessions");
  redirect(`/admin/sessions/${session.id}/topics`);
}

export async function updateSessionAction(id: string, formData: FormData) {
  await requireAdmin();

  const meetsAt = String(formData.get("meets_at") ?? "");
  const deadlineAt = String(formData.get("deadline_at") ?? "") || null;
  const selectorMemberId = String(formData.get("selector_member_id") ?? "") || null;
  const hostMemberId = String(formData.get("host_member_id") ?? "") || null;
  const status = String(formData.get("status") ?? "draft") as SessionStatus;

  if (!meetsAt) return;

  const supabase = getSupabaseServerClient();
  await supabase
    .from("sessions")
    .update({
      meets_at: meetsAt,
      deadline_at: deadlineAt,
      selector_member_id: selectorMemberId,
      host_member_id: hostMemberId,
      status,
    })
    .eq("id", id);

  revalidatePath("/admin/sessions");
}

export async function deleteSessionAction(id: string) {
  await requireAdmin();

  const supabase = getSupabaseServerClient();

  const { count } = await supabase
    .from("topics")
    .select("id", { count: "exact", head: true })
    .eq("session_id", id);

  if ((count ?? 0) > 0) {
    return { ok: false, error: "이 회차에 논제가 있어 삭제할 수 없습니다." };
  }

  await supabase.from("sessions").delete().eq("id", id);
  revalidatePath("/admin/sessions");
  return { ok: true };
}
