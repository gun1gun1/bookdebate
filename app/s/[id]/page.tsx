import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { SessionShell } from "./SessionShell";

export const dynamic = "force-dynamic";

export default async function SessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; topic?: string }>;
}) {
  const session = await requireSession();
  const { id: sessionId } = await params;
  const search = await searchParams;

  const supabase = getSupabaseServerClient();

  const [{ data: sessionRow }, { data: members }] = await Promise.all([
    supabase
      .from("sessions")
      .select(
        `
        id, meets_at, deadline_at, status,
        book:books(title, author),
        topics(
          id, order_no, kind, title, body, has_rating,
          answers(
            id, member_id, body, excerpt_text, excerpt_reason, submitted_at,
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

  const view =
    search.view === "member" || search.view === "matrix" ? search.view : "topic";
  const initialTopicId =
    search.topic && topics.some((t) => t.id === search.topic)
      ? search.topic
      : (topics[0]?.id ?? null);

  return (
    <SessionShell
      sessionId={sessionRow.id}
      bookTitle={sessionRow.book?.title ?? ""}
      meetsAt={sessionRow.meets_at}
      deadlineAt={sessionRow.deadline_at}
      status={sessionRow.status}
      topics={topics}
      members={members ?? []}
      ratings={sessionRow.ratings}
      currentMemberId={session.memberId}
      isAdmin={session.role === "admin"}
      initialView={view}
      initialTopicId={initialTopicId}
    />
  );
}
