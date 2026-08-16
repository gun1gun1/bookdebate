import { getSupabaseServerClient } from "@/lib/supabase/server";
import { NewSessionForm } from "./NewSessionForm";
import { SessionRow } from "./SessionRow";

export const dynamic = "force-dynamic";

export default async function AdminSessionsPage() {
  const supabase = getSupabaseServerClient();

  const [{ data: sessions }, { data: books }, { data: members }, { data: templates }] =
    await Promise.all([
      supabase
        .from("sessions")
        .select(
          "id, meets_at, deadline_at, selector_member_id, host_member_id, status, book:books(title)"
        )
        .order("meets_at", { ascending: false }),
      supabase.from("books").select("id, title").order("title"),
      supabase.from("members").select("id, name").eq("is_active", true).order("name"),
      supabase.from("topic_templates").select("id, name").order("created_at"),
    ]);

  const memberOptions = (members ?? []).map((m) => ({ id: m.id, label: m.name }));
  const sessionOptions = (sessions ?? []).map((s) => ({
    id: s.id,
    label: `${s.book?.title ?? "?"} (${s.meets_at})`,
  }));

  return (
    <div className="max-w-4xl">
      <h1 className="mb-4 text-lg font-semibold">회차</h1>

      <table className="mb-8 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-300 text-gray-500">
            <th className="py-2 pr-4">책</th>
            <th className="py-2 pr-4">모임일</th>
            <th className="py-2 pr-4">상태</th>
            <th className="py-2 pr-4">바로가기</th>
            <th className="py-2">동작</th>
          </tr>
        </thead>
        <tbody>
          {(sessions ?? []).map((session) => (
            <SessionRow
              key={session.id}
              session={{
                id: session.id,
                bookTitle: session.book?.title ?? "?",
                meets_at: session.meets_at,
                deadline_at: session.deadline_at,
                selector_member_id: session.selector_member_id,
                host_member_id: session.host_member_id,
                status: session.status,
              }}
              members={memberOptions}
            />
          ))}
        </tbody>
      </table>

      <h2 className="mb-2 text-sm font-semibold">새 회차</h2>
      <NewSessionForm
        books={(books ?? []).map((b) => ({ id: b.id, label: b.title }))}
        members={memberOptions}
        templates={(templates ?? []).map((t) => ({ id: t.id, label: t.name }))}
        sessions={sessionOptions}
      />
    </div>
  );
}
