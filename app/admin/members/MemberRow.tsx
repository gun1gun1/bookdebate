"use client";

import { useState, useTransition } from "react";
import { updateMemberAction, setMemberActiveAction } from "./actions";
import type { MemberRole } from "@/lib/supabase/types";

type Member = {
  id: string;
  name: string;
  aliases: string[];
  role: MemberRole;
  is_active: boolean;
};

export function MemberRow({ member }: { member: Member }) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (editing) {
    return (
      <tr className="border-b border-gray-200">
        <td colSpan={5} className="py-2">
          <form
            action={(formData) => {
              startTransition(async () => {
                await updateMemberAction(member.id, formData);
                setEditing(false);
              });
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              name="name"
              defaultValue={member.name}
              required
              className="rounded border border-gray-300 px-2 py-1"
            />
            <input
              name="aliases"
              defaultValue={member.aliases.join(", ")}
              placeholder="별칭(쉼표 구분)"
              className="rounded border border-gray-300 px-2 py-1"
            />
            <select
              name="role"
              defaultValue={member.role}
              className="rounded border border-gray-300 px-2 py-1"
            >
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
            <button
              type="submit"
              disabled={isPending}
              className="rounded bg-gray-900 px-3 py-1 text-white disabled:opacity-50"
            >
              저장
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-gray-500 hover:underline"
            >
              취소
            </button>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-gray-200">
      <td className="py-2 pr-4">{member.name}</td>
      <td className="py-2 pr-4 text-gray-600">{member.aliases.join(", ")}</td>
      <td className="py-2 pr-4">{member.role}</td>
      <td className="py-2 pr-4">{member.is_active ? "활성" : "비활성"}</td>
      <td className="py-2 flex gap-3">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-gray-700 hover:underline"
        >
          수정
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(() => setMemberActiveAction(member.id, !member.is_active))
          }
          className="text-gray-700 hover:underline disabled:opacity-50"
        >
          {member.is_active ? "비활성화" : "활성화"}
        </button>
      </td>
    </tr>
  );
}
