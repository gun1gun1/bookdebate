import Image from "next/image";
import Link from "next/link";
import { BookCover } from "@/components/BookCover";
import { requireSession } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isAnswerComplete, isMandatoryKind } from "@/lib/topics";

export const dynamic = "force-dynamic";

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default async function HomePage() {
  const session = await requireSession();
  const supabase = getSupabaseServerClient();

  const [{ data: members }, { data: sessions }] = await Promise.all([
    supabase.from("members").select("id").eq("is_active", true),
    supabase
      .from("sessions")
      .select(
        "id, meets_at, deadline_at, status, book:books(title, author, cover_url), topics(id, kind, answers(member_id, body, quote_text, choice))"
      )
      .in("status", ["open", "closed"])
      .order("meets_at", { ascending: false }),
  ]);

  const totalMembers = members?.length ?? 0;
  const openSessions = (sessions ?? []).filter((s) => s.status === "open");
  const closedSessions = (sessions ?? []).filter((s) => s.status === "closed");

  const closedByYear = new Map<string, typeof closedSessions>();
  for (const s of closedSessions) {
    const year = s.meets_at.slice(0, 4);
    const list = closedByYear.get(year) ?? [];
    list.push(s);
    closedByYear.set(year, list);
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-8 flex justify-center">
        <Image
          src="/brand/naedamri-hero.png"
          alt="내담리"
          width={682}
          height={510}
          priority
          className="h-auto w-full max-w-[560px]"
        />
      </div>

      <div className="flex flex-col gap-4">
        {openSessions.map((s) => {
          const topics = s.topics ?? [];
          const mandatoryTopics = topics.filter((t) => isMandatoryKind(t.kind));
          const completedMemberIds = new Set<string>();
          if (mandatoryTopics.length > 0) {
            for (const memberId of new Set(topics.flatMap((t) => t.answers.map((a) => a.member_id)))) {
              const allDone = mandatoryTopics.every((t) =>
                isAnswerComplete(t.kind, t.answers.find((a) => a.member_id === memberId) ?? null)
              );
              if (allDone) completedMemberIds.add(memberId);
            }
          }
          const myDone = mandatoryTopics.filter((t) =>
            isAnswerComplete(t.kind, t.answers.find((a) => a.member_id === session.memberId) ?? null)
          ).length;
          const d = daysUntil(s.meets_at);

          return (
            <Link
              key={s.id}
              href={`/s/${s.id}`}
              className="flex gap-4 rounded-lg border border-gray-200 p-5 hover:border-gray-400"
            >
              <BookCover coverUrl={s.book?.cover_url ?? null} title={s.book?.title ?? ""} size={56} />
              <div className="min-w-0">
                <p className="text-xs text-gray-500">
                  {d > 0 ? `모임까지 D-${d}` : d === 0 ? "오늘 모임" : "모임 지남"}
                </p>
                <h2 className="mt-1 text-lg font-semibold">『{s.book?.title}』</h2>
                <p className="mt-2 text-sm text-gray-600">
                  작성: {completedMemberIds.size}/{totalMembers}명 완료 · 내 답변 {myDone}/{mandatoryTopics.length}{" "}
                  작성
                </p>
              </div>
            </Link>
          );
        })}

        {openSessions.length === 0 && (
          <p className="text-sm text-gray-500">진행 중인 회차가 없습니다.</p>
        )}
      </div>

      {closedByYear.size > 0 && (
        <div className="mt-10 flex flex-col gap-6">
          {Array.from(closedByYear.entries()).map(([year, list]) => (
            <div key={year}>
              <h3 className="mb-2 text-sm font-semibold text-gray-500">{year}</h3>
              <ul className="flex flex-col gap-1">
                {list.map((s) => (
                  <li key={s.id}>
                    <Link href={`/s/${s.id}`} className="text-sm hover:underline">
                      『{s.book?.title}』 — {s.meets_at}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
