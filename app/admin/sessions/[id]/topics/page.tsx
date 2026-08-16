import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createTopicAction } from "./actions";
import { TopicRow } from "./TopicRow";

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
      .select("id, order_no, kind, title, body, assigned_member_id, has_rating")
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
      <form action={createTopicWithSessionId} className="flex flex-wrap items-center gap-2">
        <input type="number" name="order_no" defaultValue={nextOrder} className="w-16 rounded border border-gray-300 px-2 py-1" />
        <select name="kind" defaultValue="free" className="rounded border border-gray-300 px-2 py-1">
          <option value="free">free</option>
          <option value="excerpt">excerpt</option>
          <option value="choice">choice</option>
        </select>
        <input name="title" placeholder="논제 제목" required className="min-w-[220px] flex-1 rounded border border-gray-300 px-2 py-1" />
        <input name="body" placeholder="안내문" className="min-w-[180px] flex-1 rounded border border-gray-300 px-2 py-1" />
        <select name="assigned_member_id" defaultValue="" className="rounded border border-gray-300 px-2 py-1">
          <option value="">담당자 없음</option>
          {memberOptions.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="has_rating" />
          별점
        </label>
        <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-white">
          추가
        </button>
      </form>
    </div>
  );
}
