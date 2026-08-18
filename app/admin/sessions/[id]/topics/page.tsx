import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createTopicAction } from "./actions";
import { TopicRow } from "./TopicRow";
import { NewTopicForm } from "./NewTopicForm";

export const dynamic = "force-dynamic";

export default async function AdminSessionTopicsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = await params;
  const supabase = getSupabaseServerClient();

  const [{ data: session }, { data: topics }, { data: members }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, meets_at, book:books(title)")
      .eq("id", sessionId)
      .maybeSingle(),
    supabase
      .from("topics")
      .select("id, order_no, kind, title, body, assigned_member_id, has_rating, choice_options")
      .eq("session_id", sessionId)
      .order("order_no"),
    supabase.from("members").select("id, name").eq("is_active", true).order("name"),
  ]);

  const memberOptions = (members ?? []).map((m) => ({ id: m.id, label: m.name }));
  const nextOrder = (topics ?? []).reduce((max, t) => Math.max(max, t.order_no), 0) + 1;
  const createTopicWithSessionId = createTopicAction.bind(null, sessionId);

  return (
    <div className="max-w-3xl">
      <Link href="/admin/sessions" className="text-sm text-gray-500 hover:underline">
        ← 회차 목록
      </Link>
      <h1 className="mb-4 mt-1 text-lg font-semibold">
        논제 관리 — {session?.book?.title} ({session?.meets_at})
      </h1>

      <ul className="mb-8 flex flex-col gap-2">
        {(topics ?? []).map((topic) => (
          <TopicRow key={topic.id} sessionId={sessionId} topic={topic} members={memberOptions} />
        ))}
      </ul>

      <h2 className="mb-2 text-sm font-semibold">논제 추가</h2>
      <NewTopicForm action={createTopicWithSessionId} nextOrder={nextOrder} memberOptions={memberOptions} />
    </div>
  );
}
