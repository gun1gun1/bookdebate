import type { TopicKind } from "@/lib/supabase/types";

type Answer = {
  body: string | null;
  excerpt_text: string | null;
  excerpt_reason: string | null;
} | null;

// free/excerpt 답변을 읽기 전용으로 렌더링하는 presentational 컴포넌트.
// TopicPanel(남의 카드), /me가 공유한다.
export function AnswerContent({ kind, answer }: { kind: TopicKind; answer: Answer }) {
  const isEmpty =
    !answer || (kind === "excerpt" ? !answer.excerpt_text?.trim() : !answer.body?.trim());

  if (isEmpty) {
    return <p className="text-sm text-gray-400">아직 작성하지 않음</p>;
  }

  if (kind === "excerpt") {
    return (
      <div className="max-w-[68ch]">
        <blockquote className="border-l-2 border-gray-300 pl-3 font-serif text-[17px] leading-[1.7] whitespace-pre-wrap">
          {answer!.excerpt_text}
        </blockquote>
        {answer!.excerpt_reason && (
          <p className="mt-2 whitespace-pre-wrap text-[16px] leading-[1.7] text-gray-700">
            {answer!.excerpt_reason}
          </p>
        )}
      </div>
    );
  }

  return (
    <p className="max-w-[68ch] whitespace-pre-wrap text-[16px] leading-[1.7]">{answer!.body}</p>
  );
}
