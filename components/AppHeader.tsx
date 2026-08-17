import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { logoutAction } from "@/app/login/actions";

export async function AppHeader() {
  const session = await getSession();
  if (!session) return null;

  const supabase = getSupabaseServerClient();
  const { data: member } = await supabase
    .from("members")
    .select("name")
    .eq("id", session.memberId)
    .maybeSingle();

  return (
    <header className="flex items-center justify-between gap-3 border-b border-gray-200 px-6 py-3 text-sm">
      <nav className="flex items-center gap-4">
        <Link href="/" className="font-semibold">
          내담리
        </Link>
        <Link href="/" className="hover:underline">
          회차 목록
        </Link>
        <Link href="/me" className="hover:underline">
          내 글
        </Link>
        {session.role === "admin" && (
          <Link href="/admin/sessions" className="hover:underline">
            관리자
          </Link>
        )}
      </nav>
      <div className="flex items-center gap-3">
        <span>{member?.name ?? "알 수 없음"}님</span>
        <form action={logoutAction}>
          <button type="submit" className="text-gray-500 hover:text-gray-900">
            로그아웃
          </button>
        </form>
      </div>
    </header>
  );
}
