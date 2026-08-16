import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { TemplateAssignedRole, TopicKind } from "@/lib/supabase/types";

// "템플릿에서 시작"과 "이전 회차 구조 복제"가 공유하는 파이프라인.
// 둘 다 TopicSpec[] 로 바뀐 뒤 applyTopicSpecs()로 새 회차에 적용된다.
// docs/DECISIONS.md "Phase 3" 참고.

export type TopicSpec = {
  orderNo: number;
  kind: TopicKind;
  title: string;
  body: string | null;
  assignedRole: TemplateAssignedRole | null;
  hasRating: boolean;
};

export async function topicSpecsFromTemplate(
  templateId: string
): Promise<TopicSpec[]> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("topic_template_items")
    .select("order_no, kind, title, body, assigned_role, has_rating")
    .eq("template_id", templateId)
    .order("order_no");

  return (data ?? []).map((item) => ({
    orderNo: item.order_no,
    kind: item.kind,
    title: item.title,
    body: item.body,
    assignedRole: item.assigned_role,
    hasRating: item.has_rating,
  }));
}

/**
 * 이전 회차의 논제 구조를 읽어온다. assigned_member_id가 그 회차의
 * selector_member_id/host_member_id와 같으면 역할로 되돌리고, 아니면
 * 담당자 없음으로 취급한다 — 다른 회차에 그대로 옮기면 의미가 없는 특정
 * 멤버 지정이기 때문이다.
 */
export async function topicSpecsFromSession(
  sessionId: string
): Promise<TopicSpec[]> {
  const supabase = getSupabaseServerClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("selector_member_id, host_member_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) return [];

  const { data: topics } = await supabase
    .from("topics")
    .select("order_no, kind, title, body, assigned_member_id, has_rating")
    .eq("session_id", sessionId)
    .order("order_no");

  return (topics ?? []).map((topic) => {
    let assignedRole: TemplateAssignedRole | null = null;
    if (topic.assigned_member_id && topic.assigned_member_id === session.selector_member_id) {
      assignedRole = "selector";
    } else if (topic.assigned_member_id && topic.assigned_member_id === session.host_member_id) {
      assignedRole = "host";
    }

    return {
      orderNo: topic.order_no,
      kind: topic.kind,
      title: topic.title,
      body: topic.body,
      assignedRole,
      hasRating: topic.has_rating,
    };
  });
}

export async function applyTopicSpecs(
  sessionId: string,
  specs: TopicSpec[]
): Promise<void> {
  if (specs.length === 0) return;

  const supabase = getSupabaseServerClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("selector_member_id, host_member_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) throw new Error("세션을 찾을 수 없다.");

  const resolveRole = (role: TemplateAssignedRole | null) => {
    if (role === "selector") return session.selector_member_id;
    if (role === "host") return session.host_member_id;
    return null;
  };

  const rows = specs.map((spec) => ({
    session_id: sessionId,
    order_no: spec.orderNo,
    kind: spec.kind,
    title: spec.title,
    body: spec.body,
    assigned_member_id: resolveRole(spec.assignedRole),
    has_rating: spec.hasRating,
  }));

  const { error } = await supabase.from("topics").insert(rows);
  if (error) throw new Error(error.message);
}

export async function nextOrderNo(sessionId: string): Promise<number> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("topics")
    .select("order_no")
    .eq("session_id", sessionId)
    .order("order_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data?.order_no ?? 0) + 1;
}
