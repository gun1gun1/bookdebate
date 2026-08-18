import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { SessionShell } from "./SessionShell";

export const dynamic = "force-dynamic";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id: sessionId } = await params;

  const supabase = getSupabaseServerClient();

  const [{ data: sessionRow }, { data: members }] = await Promise.all([
    supabase
      .from("sessions")
      .select(
        `
        id, meets_at, deadline_at, status,
        book:books(title, author, cover_url),
        topics(
          id, order_no, kind, title, body, has_rating, choice_options,
          answers(
            id, member_id, body, quote_text, quote_reason, title, choice, slot, submitted_at,
            member:members(name),
            replies(id, member_id, body, created_at, member:members(name))
          )
        ),
        ratings(member_id, stars)
      `
      )
      .eq("id", sessionId)
      .maybeSingle(),
    supabase.from("members").select("id, name").eq("is_active", true).order("name"),
  ]);

  if (!sessionRow) notFound();

  const topics = [...sessionRow.topics].sort((a, b) => a.order_no - b.order_no);

  return (
    <SessionShell
      sessionId={sessionRow.id}
      bookTitle={sessionRow.book?.title ?? ""}
      bookAuthor={sessionRow.book?.author ?? null}
      bookCoverUrl={sessionRow.book?.cover_url ?? null}
      meetsAt={sessionRow.meets_at}
      deadlineAt={sessionRow.deadline_at}
      status={sessionRow.status}
      topics={topics}
      members={members ?? []}
      ratings={sessionRow.ratings}
      currentMemberId={session.memberId}
      isAdmin={session.role === "admin"}
    />
  );
}
