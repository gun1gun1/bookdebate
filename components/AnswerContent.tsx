import type { TopicKind } from "@/lib/supabase/types";

type Answer = {
  body: string | null;
  excerpt_text: string | null;
  excerpt_reason: string | null;
} | null;

// free/excerpt 답변을 읽기 전용으로 렌더링하는 presentational 컴포넌트.
// TopicPanel(남의 카드), MemberPanel, MatrixPanel, /me가 공유한다.
export function AnswerContent({
  kind,
  answer,
  truncate,
}: {
  kind: TopicKind;
  answer: Answer;
  truncate?: number;
}) {
  const isEmpty =
    !answer || (kind === "excerpt" ? !answer.excerpt_text?.trim() : !answer.body?.trim());

  if (isEmpty) {
    return <p className="text-sm text-gray-400">아직 작성하지 않음</p>;
  }

  if (kind === "excerpt") {
    const text = truncate ? answer!.excerpt_text!.slice(0, truncate) : answer!.excerpt_text;
    if (truncate) {
      return <p className="text-sm text-gray-700">{text}</p>;
    }
    return (
      <div className="max-w-[68ch]">
        <blockquote className="border-l-2 border-gray-300 pl-3 font-serif text-[17px] leading-[1.7] whitespace-pre-wrap">
          {text}
        </blockquote>
        {answer!.excerpt_reason && (
          <p className="mt-2 whitespace-pre-wrap text-[16px] leading-[1.7] text-gray-700">
            {answer!.excerpt_reason}
          </p>
        )}
      </div>
    );
  }

  const text = truncate ? answer!.body!.slice(0, truncate) : answer!.body;
  if (truncate) {
    return <p className="text-sm text-gray-700">{text}</p>;
  }
  return (
    <p className="max-w-[68ch] whitespace-pre-wrap text-[16px] leading-[1.7]">{text}</p>
  );
}
