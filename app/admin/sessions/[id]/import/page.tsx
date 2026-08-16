import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ImportForm } from "./ImportForm";

export const dynamic = "force-dynamic";

export default async function AdminSessionImportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = await params;
  const supabase = getSupabaseServerClient();

  const [{ data: session }, { data: members }] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, meets_at, book:books(title)")
      .eq("id", sessionId)
      .maybeSingle(),
    supabase.from("members").select("id, name").eq("is_active", true).order("name"),
  ]);

  return (
    <div className="max-w-3xl">
      <Link href="/admin/sessions" className="text-sm text-gray-500 hover:underline">
        ← 회차 목록
      </Link>
      <h1 className="mb-4 mt-1 text-lg font-semibold">
        붙여넣기 이관 — {session?.book?.title} ({session?.meets_at})
      </h1>

      <ImportForm
        sessionId={sessionId}
        members={(members ?? []).map((m) => ({ id: m.id, label: m.name }))}
      />
    </div>
  );
}
