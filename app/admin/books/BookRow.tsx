"use client";

import { useState, useTransition } from "react";
import { updateBookAction, deleteBookAction } from "./actions";
import { DeleteButton } from "@/components/DeleteButton";

type Book = {
  id: string;
  title: string;
  author: string | null;
  cover_url: string | null;
  memo: string | null;
};

export function BookRow({ book }: { book: Book }) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (editing) {
    return (
      <tr className="border-b border-gray-200">
        <td colSpan={4} className="py-2">
          <form
            action={(formData) => {
              startTransition(async () => {
                await updateBookAction(book.id, formData);
                setEditing(false);
              });
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input name="title" defaultValue={book.title} required className="rounded border border-gray-300 px-2 py-1" />
            <input name="author" defaultValue={book.author ?? ""} placeholder="저자" className="rounded border border-gray-300 px-2 py-1" />
            <input name="cover_url" defaultValue={book.cover_url ?? ""} placeholder="표지 URL" className="rounded border border-gray-300 px-2 py-1" />
            <input name="memo" defaultValue={book.memo ?? ""} placeholder="메모" className="rounded border border-gray-300 px-2 py-1" />
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
      <td className="py-2 pr-4">{book.title}</td>
      <td className="py-2 pr-4 text-gray-600">{book.author}</td>
      <td className="py-2 pr-4 text-gray-600">{book.memo}</td>
      <td className="py-2 flex gap-3">
        <button type="button" onClick={() => setEditing(true)} className="text-gray-700 hover:underline">
          수정
        </button>
        <DeleteButton action={() => deleteBookAction(book.id)} />
      </td>
    </tr>
  );
}
