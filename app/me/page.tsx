import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AnswerContent } from "@/components/AnswerContent";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const session = await requireSession();
  const supabase = getSupabaseServerClient();

  const { data: answers } = await supabase
    .from("answers")
    .select(
      `
      id, body, quote_text, quote_reason, title,
      replies(id, body, member:members(name)),
      topic:topics(id, order_no, title, kind, session:sessions(id, meets_at, book:books(title)))
    `
    )
    .eq("member_id", session.memberId);

  const { data: replies } = await supabase
    .from("replies")
    .select(
      `
      id, body, choice,
      answer:answers(
        member:members(name),
        topic:topics(id, order_no, title, kind, session:sessions(id, meets_at, book:books(title)))
      )
    `
    )
    .eq("member_id", session.memberId);

  type Item = {
    sessionId: string;
    bookTitle: string;
    meetsAt: string;
    kind: "answer" | "reply";
    topicOrder: number;
    topicTitle: string;
    node: React.ReactNode;
  };

  const items: Item[] = [];

  for (const a of answers ?? []) {
    if (!a.topic || !a.topic.session) continue;
    items.push({
      sessionId: a.topic.session.id,
      bookTitle: a.topic.session.book?.title ?? "",
      meetsAt: a.topic.session.meets_at,
      kind: "answer",
      topicOrder: a.topic.order_no,
      topicTitle: a.topic.title,
      node: <AnswerContent kind={a.topic.kind} answer={a} />,
    });
  }

  for (const r of replies ?? []) {
    if (!r.answer || !r.answer.topic || !r.answer.topic.session) continue;
    items.push({
      sessionId: r.answer.topic.session.id,
      bookTitle: r.answer.topic.session.book?.title ?? "",
      meetsAt: r.answer.topic.session.meets_at,
      kind: "reply",
      topicOrder: r.answer.topic.order_no,
      topicTitle: r.answer.topic.title,
      node: (
        <p className="text-sm text-gray-700">
          <span className="text-gray-400">
            {r.answer.topic.kind === "excerpt"
              ? `→ ${r.answer.member?.name}의 발췌에 사유 더하기: `
              : r.answer.topic.kind === "difficult"
                ? `→ ${r.answer.member?.name}의 힘든 구절에 같이 생각해 보니: `
                : r.answer.topic.kind === "choice"
                  ? `→ 나는 ${r.choice}: `
                  : `→ ${r.answer.member?.name}의 글에 의견: `}
          </span>
          {r.body}
        </p>
      ),
    });
  }

  const bySession = new Map<string, { bookTitle: string; meetsAt: string; items: Item[] }>();
  for (const item of items) {
    const entry = bySession.get(item.sessionId) ?? {
      bookTitle: item.bookTitle,
      meetsAt: item.meetsAt,
      items: [],
    };
    entry.items.push(item);
    bySession.set(item.sessionId, entry);
  }

  const sessions = Array.from(bySession.entries()).sort(
    (a, b) => (a[1].meetsAt < b[1].meetsAt ? 1 : -1)
  );

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-lg font-semibold">내가 쓴 글</h1>

      <div className="flex flex-col gap-10">
        {sessions.map(([sessionId, entry]) => (
          <div key={sessionId}>
            <Link href={`/s/${sessionId}`} className="text-sm text-gray-500 hover:underline">
              『{entry.bookTitle}』 · {entry.meetsAt}
            </Link>
            <div className="mt-2 flex flex-col gap-4">
              {entry.items
                .sort((a, b) => a.topicOrder - b.topicOrder)
                .map((item, i) => (
                  <div key={i}>
                    <p className="mb-1 text-xs text-gray-400">
                      {item.topicOrder}. {item.topicTitle}
                    </p>
                    {item.node}
                  </div>
                ))}
            </div>
          </div>
        ))}

        {sessions.length === 0 && <p className="text-sm text-gray-500">아직 쓴 글이 없습니다.</p>}
      </div>
    </main>
  );
}
