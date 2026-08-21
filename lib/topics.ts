import type { TopicKind } from "@/lib/supabase/types";

// docs/SCHEMA.md: "미작성 판정 로직을 코드 여러 곳에 중복하지 말고
// 한 곳에 모아둘 것" — 이 함수가 그 한 곳이다. excerpt/difficult는
// quote_text, appendix는 "미작성" 개념이 없어 항상 false, 나머지(free/choice)는
// body가 비어있으면 미작성으로 본다. choice의 answers 행은 R1-e부터 "발제
// 게시물"(body) 하나뿐이다 — 찬반 입장은 더 이상 이 행에 없고 replies.choice에
// 있다(docs/DECISIONS.md "R1-e" 참고, answers.choice 컬럼 자체는 R1-d에서 drop).
export function isAnswerComplete(
  kind: TopicKind,
  answer:
    | { body: string | null; quote_text: string | null }
    | null
    | undefined
): boolean {
  if (!answer) return false;
  if (kind === "excerpt" || kind === "difficult") return Boolean(answer.quote_text?.trim());
  if (kind === "appendix") return false;
  return Boolean(answer.body?.trim());
}

// "참여 현황"(N명 중 M명 작성) 집계는 전원 참여가 전제인 kind만 분모로 삼는다
// — difficult/choice/appendix는 선택 참여라 제외한다(REFACTOR_PLAN.md 6절).
export function isMandatoryKind(kind: TopicKind): boolean {
  return kind === "free" || kind === "excerpt";
}

// difficult 논제의 "같이 생각해 보니" 댓글(reply)은 모임 당일 0시(Asia/Seoul)
// 이후에만 쓸 수 있다 — 클라이언트(안내 문구)와 서버(upsertReplyAction의 실제
// 거부) 양쪽이 이 함수를 공유한다. Vercel 런타임은 UTC로 동작하므로 9시간을
// 더해 "지금의 KST 날짜"를 구한 뒤 meets_at(date)과 비교한다.
export function isPostMeetingOpen(meetsAt: string): boolean {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const kstToday = kstNow.toISOString().slice(0, 10);
  return kstToday >= meetsAt;
}
