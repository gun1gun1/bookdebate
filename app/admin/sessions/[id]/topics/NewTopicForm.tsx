"use client";

import { useState } from "react";
import type { TopicKind } from "@/lib/supabase/types";
import { KIND_HINTS } from "./kindHints";

export function NewTopicForm({
  action,
  nextOrder,
  memberOptions,
}: {
  action: (formData: FormData) => void;
  nextOrder: number;
  memberOptions: { id: string; label: string }[];
}) {
  const [kind, setKind] = useState<TopicKind>("free");

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input
        type="number"
        name="order_no"
        defaultValue={nextOrder}
        className="w-16 rounded border border-gray-300 px-2 py-1"
      />
      <select
        name="kind"
        value={kind}
        onChange={(e) => setKind(e.target.value as TopicKind)}
        className="rounded border border-gray-300 px-2 py-1"
      >
        <option value="free">free</option>
        <option value="excerpt">excerpt</option>
        <option value="difficult">difficult</option>
        <option value="choice">choice</option>
        <option value="appendix">appendix</option>
      </select>
      <input
        name="title"
        placeholder="논제 제목"
        required
        className="min-w-[220px] flex-1 rounded border border-gray-300 px-2 py-1"
      />
      <input
        name="body"
        placeholder="안내문"
        className="min-w-[180px] flex-1 rounded border border-gray-300 px-2 py-1"
      />
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
      {kind === "choice" && (
        <input
          name="choice_options"
          defaultValue="찬성,반대"
          placeholder="선택지(쉼표 구분)"
          className="min-w-[160px] rounded border border-gray-300 px-2 py-1"
        />
      )}
      <button type="submit" className="rounded bg-gray-900 px-3 py-1 text-white">
        추가
      </button>
      <p className="w-full text-xs text-gray-400">{KIND_HINTS[kind]}</p>
    </form>
  );
}
