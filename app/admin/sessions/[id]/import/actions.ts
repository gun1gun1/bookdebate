"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { parseImportText, type ParseResult } from "@/lib/admin/importParser";
import { nextOrderNo } from "@/lib/admin/topics";

async function loadActiveMembers() {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("members")
    .select("id, name, aliases")
    .eq("is_active", true);
  return data ?? [];
}

export async function previewImportAction(text: string): Promise<ParseResult> {
  await requireAdmin();
  const members = await loadActiveMembers();
  return parseImportText(text, members);
}

export type NameResolution =
  | { type: "existing"; memberId: string }
  | { type: "new" };

export async function confirmImportAction(
  sessionId: string,
  text: string,
  resolutions: Record<string, NameResolution>
): Promise<{ ok: true; counts: ParseResult["counts"] } | { ok: false; error: string }> {
  await requireAdmin();

  const supabase = getSupabaseServerClient();
  const members = await loadActiveMembers();
  const result = parseImportText(text, members);

  // 매칭 실패한 이름을 관리자의 선택대로 해석한다: 기존 멤버로 연결하거나
  // 새 멤버를 만든다. 자동 생성은 하지 않는다(docs/SECURITY.md 참고).
  const resolvedIds = new Map<string, string>();
  for (const rawName of result.unmatchedNames) {
    const resolution = resolutions[rawName];
    if (!resolution) {
      return { ok: false, error: `"${rawName}"의 연결 방법을 선택하지 않았습니다.` };
    }
    if (resolution.type === "existing") {
      resolvedIds.set(rawName, resolution.memberId);
    } else {
      const { data: newMember, error } = await supabase
        .from("members")
        .insert({ name: rawName })
        .select("id")
        .single();
      if (error || !newMember) {
        return { ok: false, error: `"${rawName}" 멤버를 만들지 못했습니다.` };
      }
      resolvedIds.set(rawName, newMember.id);
    }
  }

  function resolveMemberId(memberId: string | null, rawName: string): string | null {
    return memberId ?? resolvedIds.get(rawName) ?? null;
  }

  const startOrderNo = await nextOrderNo(sessionId);

  for (const [index, topic] of result.topics.entries()) {
    const { data: topicRow, error: topicError } = await supabase
      .from("topics")
      .insert({
        session_id: sessionId,
        order_no: startOrderNo + index,
        kind: topic.kind,
        title: topic.title,
        has_rating: topic.hasRating,
      })
      .select("id")
      .single();

    if (topicError || !topicRow) {
      return { ok: false, error: `"${topic.title}" 논제를 저장하지 못했습니다.` };
    }

    for (const answer of topic.answers) {
      const memberId = resolveMemberId(answer.memberId, answer.rawName);
      if (!memberId) continue;

      const { data: answerRow, error: answerError } = await supabase
        .from("answers")
        .insert({
          topic_id: topicRow.id,
          member_id: memberId,
          body: answer.body,
          excerpt_text: answer.excerptText,
          excerpt_reason: answer.excerptReason,
          submitted_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (answerError || !answerRow) continue;

      for (const reply of answer.replies) {
        const replyMemberId = resolveMemberId(reply.memberId, reply.rawName);
        if (!replyMemberId) continue;
        await supabase.from("replies").insert({
          answer_id: answerRow.id,
          member_id: replyMemberId,
          body: reply.body,
        });
      }
    }
  }

  revalidatePath(`/admin/sessions/${sessionId}/topics`);
  return { ok: true, counts: result.counts };
}
