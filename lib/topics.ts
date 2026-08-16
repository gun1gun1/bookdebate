import type { TopicKind } from "@/lib/supabase/types";

// docs/SCHEMA.md: "미작성 판정 로직을 코드 여러 곳에 중복하지 말고 한 곳에
// 모아둘 것" — 이 함수가 그 한 곳이다. free는 body, excerpt는 excerpt_text가
// 비어있으면 미작성으로 본다.
export function isAnswerComplete(
  kind: TopicKind,
  answer: { body: string | null; excerpt_text: string | null } | null | undefined
): boolean {
  if (!answer) return false;
  if (kind === "excerpt") return Boolean(answer.excerpt_text?.trim());
  return Boolean(answer.body?.trim());
}
