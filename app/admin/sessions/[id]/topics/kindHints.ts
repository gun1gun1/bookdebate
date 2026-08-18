import type { TopicKind } from "@/lib/supabase/types";

// REFACTOR_PLAN.md 4.5절: kind 선택 시 참여 방식을 한 줄로 안내.
export const KIND_HINTS: Record<TopicKind, string> = {
  free: "전원 참여 전제입니다",
  excerpt: "전원 참여 전제입니다",
  difficult: "선택 참여 논제입니다",
  choice: "선택 참여 논제입니다",
  appendix: "누구나 여러 개를 올릴 수 있습니다",
};
