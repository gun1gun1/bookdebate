"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  updateSessionAction,
  deleteSessionAction,
  countUnrepliedDifficultAnswersAction,
} from "./actions";
import { DeleteButton } from "@/components/DeleteButton";
import type { SessionStatus } from "@/lib/supabase/types";

type Option = { id: string; label: string };

type Session = {
  id: string;
  bookTitle: string;
  meets_at: string;
  deadline_at: string | null;
  selector_member_id: string | null;
  host_member_id: string | null;
  status: SessionStatus;
};

export function SessionRow({ session, members }: { session: Session; members: Option[] }) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (editing) {
    return (
      <tr className="border-b border-gray-200">
        <td colSpan={5} className="py-2">
          <form
            action={(formData) => {
              startTransition(async () => {
                const nextStatus = String(formData.get("status") ?? "");
                if (nextStatus === "closed" && session.status !== "closed") {
                  const unrepliedCount = await countUnrepliedDifficultAnswersAction(session.id);
                  if (unrepliedCount > 0) {
                    const proceed = window.confirm(
                      `힘든 구절 답변 중 아직 댓글이 없는 것이 ${unrepliedCount}개 있습니다.\n지금 닫으면 더 이상 댓글을 달 수 없습니다. 계속하시겠습니까?`
                    );
                    if (!proceed) return;
                  }
                }
                await updateSessionAction(session.id, formData);
                setEditing(false);
              });
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input type="date" name="meets_at" defaultValue={session.meets_at} required className="rounded border border-gray-300 px-2 py-1" />
            <input type="date" name="deadline_at" defaultValue={session.deadline_at ?? ""} className="rounded border border-gray-300 px-2 py-1" />
            <select name="selector_member_id" defaultValue={session.selector_member_id ?? ""} className="rounded border border-gray-300 px-2 py-1">
              <option value="">선정자 없음</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <select name="host_member_id" defaultValue={session.host_member_id ?? ""} className="rounded border border-gray-300 px-2 py-1">
              <option value="">진행자 없음</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <select name="status" defaultValue={session.status} className="rounded border border-gray-300 px-2 py-1">
              <option value="draft">draft</option>
              <option value="open">open</option>
              <option value="closed">closed</option>
            </select>
            <button type="submit" disabled={isPending} className="rounded bg-gray-900 px-3 py-1 text-white disabled:opacity-50">
              저장
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-gray-500 hover:underline">
              취소
            </button>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-gray-200">
      <td className="py-2 pr-4">{session.bookTitle}</td>
      <td className="py-2 pr-4">{session.meets_at}</td>
      <td className="py-2 pr-4">{session.status}</td>
      <td className="py-2 pr-4">
        <Link href={`/admin/sessions/${session.id}/topics`} className="text-gray-700 hover:underline">
          논제 관리
        </Link>
        {" · "}
        <Link href={`/admin/sessions/${session.id}/import`} className="text-gray-700 hover:underline">
          이관
        </Link>
      </td>
      <td className="py-2 flex gap-3">
        <button type="button" onClick={() => setEditing(true)} className="text-gray-700 hover:underline">
          수정
        </button>
        <DeleteButton action={() => deleteSessionAction(session.id)} />
      </td>
    </tr>
  );
}
