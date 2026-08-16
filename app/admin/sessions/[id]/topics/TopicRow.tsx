"use client";

import { useState, useTransition } from "react";
import { updateTopicAction, deleteTopicAction } from "./actions";
import { DeleteButton } from "@/components/DeleteButton";
import type { TopicKind } from "@/lib/supabase/types";

type Option = { id: string; label: string };

type Topic = {
  id: string;
  order_no: number;
  kind: TopicKind;
  title: string;
  body: string | null;
  assigned_member_id: string | null;
  has_rating: boolean;
};

export function TopicRow({
  sessionId,
  topic,
  members,
}: {
  sessionId: string;
  topic: Topic;
  members: Option[];
}) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (editing) {
    return (
      <li className="rounded border border-gray-200 p-3">
        <form
          action={(formData) => {
            startTransition(async () => {
              await updateTopicAction(sessionId, topic.id, formData);
              setEditing(false);
            });
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input type="number" name="order_no" defaultValue={topic.order_no} className="w-16 rounded border border-gray-300 px-2 py-1" />
          <select name="kind" defaultValue={topic.kind} className="rounded border border-gray-300 px-2 py-1">
            <option value="free">free</option>
            <option value="excerpt">excerpt</option>
            <option value="choice">choice</option>
          </select>
          <input name="title" defaultValue={topic.title} required className="min-w-[220px] flex-1 rounded border border-gray-300 px-2 py-1" />
          <input name="body" defaultValue={topic.body ?? ""} placeholder="안내문" className="min-w-[180px] flex-1 rounded border border-gray-300 px-2 py-1" />
          <select name="assigned_member_id" defaultValue={topic.assigned_member_id ?? ""} className="rounded border border-gray-300 px-2 py-1">
            <option value="">담당자 없음</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="has_rating" defaultChecked={topic.has_rating} />
            별점
          </label>
          <button type="submit" disabled={isPending} className="rounded bg-gray-900 px-3 py-1 text-white disabled:opacity-50">
            저장
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-gray-500 hover:underline">
            취소
          </button>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between rounded border border-gray-200 p-3">
      <div>
        <span className="text-gray-500">{topic.order_no}.</span> [{topic.kind}] {topic.title}
        {topic.has_rating ? " · 별점" : ""}
      </div>
      <div className="flex gap-3">
        <button type="button" onClick={() => setEditing(true)} className="text-gray-700 hover:underline">
          수정
        </button>
        <DeleteButton action={() => deleteTopicAction(sessionId, topic.id)} />
      </div>
    </li>
  );
}
