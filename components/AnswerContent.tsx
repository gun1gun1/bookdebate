import type { TopicKind } from "@/lib/supabase/types";
import { isAnswerComplete } from "@/lib/topics";

type ReplyItem = { id: string; body: string; member: { name: string } | null };

type Answer = {
  body: string | null;
  quote_text: string | null;
  quote_reason: string | null;
  title: string | null;
  choice: string | null;
  replies?: ReplyItem[];
} | null;

function isEmptyAnswer(kind: TopicKind, answer: Answer): boolean {
  if (!answer) return true;
  // appendix는 "미작성" 개념이 없다(lib/topics.ts) — 행이 존재하면 곧 글이
  // 있다는 뜻이므로 별도로 취급한다.
  if (kind === "appendix") return false;
  return !isAnswerComplete(kind, {
    body: answer.body,
    quote_text: answer.quote_text,
    choice: answer.choice,
  });
}

// 5kind 답변을 읽기 전용으로 렌더링하는 presentational 컴포넌트(입력 폼 없음).
// TopicPanel(남의 카드), /me가 공유한다. 표현은 app/s/[id]의 각 View가 쓰는
// 것과 동일하게 맞춘다 — 여기서 새로 디자인하지 않는다.
export function AnswerContent({ kind, answer }: { kind: TopicKind; answer: Answer }) {
  if (isEmptyAnswer(kind, answer)) {
    return <p className="text-sm text-gray-400">아직 작성하지 않음</p>;
  }

  if (kind === "excerpt" || kind === "difficult") {
    return (
      <div className="max-w-[68ch]">
        <blockquote className="border-l-2 border-gray-300 pl-3 font-serif text-[17px] leading-[1.7] whitespace-pre-wrap">
          {answer!.quote_text}
        </blockquote>
        {answer!.quote_reason && (
          <p className="mt-2 whitespace-pre-wrap text-[16px] leading-[1.7] text-gray-700">
            {answer!.quote_reason}
          </p>
        )}
        {kind === "difficult" && answer!.replies && answer!.replies.length > 0 && (
          <div className="mt-3 ml-4 flex flex-col gap-1 border-l border-gray-100 pl-4">
            <p className="text-xs text-gray-400">같이 생각해 보니</p>
            {answer!.replies.map((reply) => (
              <div key={reply.id} className="text-sm">
                <span className="font-semibold">{reply.member?.name}: </span>
                <span className="whitespace-pre-wrap">{reply.body}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (kind === "choice") {
    return (
      <div className="max-w-[68ch]">
        <p className="text-[16px] leading-[1.7]">나는 {answer!.choice}</p>
        {answer!.body?.trim() ? (
          <p className="mt-1 whitespace-pre-wrap text-[16px] leading-[1.7] text-gray-700">
            {answer!.body}
          </p>
        ) : (
          <p className="mt-1 text-sm text-gray-400">근거를 남기지 않았습니다</p>
        )}
      </div>
    );
  }

  if (kind === "appendix") {
    return (
      <div className="max-w-[68ch]">
        {answer!.title && <p className="font-semibold">{answer!.title}</p>}
        <p className="mt-1 whitespace-pre-wrap text-[16px] leading-[1.7]">{answer!.body}</p>
      </div>
    );
  }

  return (
    <p className="max-w-[68ch] whitespace-pre-wrap text-[16px] leading-[1.7]">{answer!.body}</p>
  );
}
