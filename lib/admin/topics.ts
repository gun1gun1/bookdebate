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

/**
 * 새 회차의 기본 논제 구성. 실제로 쓰인 「허삼관매혈기」 회차(2026-08-22)의
 * 5논제 구조를 그대로 옮겼다. 그 회차를 그냥 복제하면 "희진님께", "『허삼관매혈기』"
 * 같은 회차 고유 문구가 따라오므로, 책 제목과 선정자 이름은 대상 회차에서 읽어
 * 채운다. 선정자가 아직 없으면 "선정하신 분께"로 둔다 — 관리자가 논제 화면에서
 * 고치면 된다. docs/DECISIONS.md "새 회차 기본 논제 자동 생성" 참고.
 */
export async function defaultTopicSpecs(sessionId: string): Promise<TopicSpec[]> {
  const supabase = getSupabaseServerClient();
  const { data: session } = await supabase
    .from("sessions")
    .select("book:books(title), selector:members!sessions_selector_member_id_fkey(name)")
    .eq("id", sessionId)
    .maybeSingle();

  const bookTitle = session?.book?.title ?? "이 책";
  const selector = session?.selector?.name ? `${session.selector.name}님` : "분";

  return [
    {
      orderNo: 1,
      kind: "free",
      title: `책을 소개하는 한 문장 요약. 책을 선정하신 ${selector}께 부탁드립니다.`,
      body: `『${bookTitle}』, 어떻게 보셨나요? 별점과 소감을 나눠주세요.`,
      assignedRole: "selector",
      hasRating: true,
    },
    {
      orderNo: 2,
      kind: "excerpt",
      title: "인상 깊게 읽은 부분이나 발췌가 있다면 이유와 함께 소개해 주세요.",
      body: "다른 분들은 거기에 자신의 사유를 더해 봅니다.",
      assignedRole: null,
      hasRating: false,
    },
    {
      orderNo: 3,
      kind: "difficult",
      title: "책에서 이해가 힘든 구절이 있었다면 함께 공유해서 이야기 나눠보려고 합니다.",
      body: null,
      assignedRole: null,
      hasRating: false,
    },
    {
      orderNo: 4,
      kind: "choice",
      title:
        "책 속에서 누군가가 어떤 결정을 내리고 행동하는 부분에서 ‘나라도 그렇게 하겠다.’, ‘나라면 그렇게 하지 않겠다.’ 하는 부분을 찾아서 함께 이야기 나눠 보려고 합니다.",
      body: null,
      assignedRole: null,
      hasRating: false,
    },
    {
      orderNo: 5,
      kind: "appendix",
      title: "부록논제",
      body: null,
      assignedRole: null,
      hasRating: false,
    },
  ];
}

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
