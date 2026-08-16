import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createMemberAction } from "./actions";
import { MemberRow } from "./MemberRow";

export const dynamic = "force-dynamic";

export default async function AdminMembersPage() {
  const supabase = getSupabaseServerClient();
  const { data: members } = await supabase
    .from("members")
    .select("id, name, aliases, role, is_active")
    .order("name");

  return (
    <div className="max-w-3xl">
      <h1 className="mb-4 text-lg font-semibold">회원</h1>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-300 text-gray-500">
            <th className="py-2 pr-4">이름</th>
            <th className="py-2 pr-4">별칭</th>
            <th className="py-2 pr-4">역할</th>
            <th className="py-2 pr-4">상태</th>
            <th className="py-2">동작</th>
          </tr>
        </thead>
        <tbody>
          {(members ?? []).map((member) => (
            <MemberRow key={member.id} member={member} />
          ))}
        </tbody>
      </table>

      <h2 className="mt-8 mb-2 text-sm font-semibold">회원 추가</h2>
      <form action={createMemberAction} className="flex flex-wrap items-center gap-2">
        <input
          name="name"
          placeholder="이름"
          required
          className="rounded border border-gray-300 px-2 py-1"
        />
        <input
          name="aliases"
          placeholder="별칭(쉼표 구분, 예: 선, 선희)"
          className="rounded border border-gray-300 px-2 py-1"
        />
        <select name="role" defaultValue="member" className="rounded border border-gray-300 px-2 py-1">
          <option value="member">member</option>
          <option value="admin">admin</option>
        </select>
        <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-white">
          추가
        </button>
      </form>
    </div>
  );
}
