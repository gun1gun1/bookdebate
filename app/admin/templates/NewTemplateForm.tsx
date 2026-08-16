"use client";

import { useState, useTransition } from "react";
import { createTemplateAction, type TemplateItemInput } from "./actions";

function emptyItem(orderNo: number): TemplateItemInput {
  return { orderNo, kind: "free", title: "", body: "", assignedRole: "", hasRating: false };
}

export function NewTemplateForm() {
  const [name, setName] = useState("");
  const [items, setItems] = useState<TemplateItemInput[]>([emptyItem(1)]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateItem(index: number, patch: Partial<TemplateItemInput>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem(prev.length + 1)]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index).map((item, i) => ({ ...item, orderNo: i + 1 })));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createTemplateAction(name, items);
          if (!result.ok) {
            setError(result.error ?? "저장하지 못했습니다.");
            return;
          }
          setName("");
          setItems([emptyItem(1)]);
        });
      }}
      className="flex flex-col gap-4"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="템플릿 이름"
        required
        className="rounded border border-gray-300 px-2 py-1"
      />

      {items.map((item, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2 rounded border border-gray-200 p-2">
          <input
            type="number"
            value={item.orderNo}
            onChange={(e) => updateItem(index, { orderNo: Number(e.target.value) })}
            className="w-16 rounded border border-gray-300 px-2 py-1"
          />
          <select
            value={item.kind}
            onChange={(e) => updateItem(index, { kind: e.target.value as TemplateItemInput["kind"] })}
            className="rounded border border-gray-300 px-2 py-1"
          >
            <option value="free">free</option>
            <option value="excerpt">excerpt</option>
            <option value="choice">choice</option>
          </select>
          <input
            value={item.title}
            onChange={(e) => updateItem(index, { title: e.target.value })}
            placeholder="논제 제목"
            className="min-w-[220px] flex-1 rounded border border-gray-300 px-2 py-1"
          />
          <input
            value={item.body}
            onChange={(e) => updateItem(index, { body: e.target.value })}
            placeholder="안내문(선택)"
            className="min-w-[180px] flex-1 rounded border border-gray-300 px-2 py-1"
          />
          <select
            value={item.assignedRole}
            onChange={(e) => updateItem(index, { assignedRole: e.target.value as TemplateItemInput["assignedRole"] })}
            className="rounded border border-gray-300 px-2 py-1"
          >
            <option value="">담당자 없음</option>
            <option value="selector">선정자</option>
            <option value="host">진행자</option>
          </select>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={item.hasRating}
              onChange={(e) => updateItem(index, { hasRating: e.target.checked })}
            />
            별점
          </label>
          <button
            type="button"
            onClick={() => removeItem(index)}
            disabled={items.length === 1}
            className="text-gray-500 hover:underline disabled:opacity-30"
          >
            제거
          </button>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <button type="button" onClick={addItem} className="text-sm text-gray-700 hover:underline">
          + 논제 추가
        </button>
        <button type="submit" disabled={isPending} className="rounded bg-gray-900 px-3 py-1 text-white disabled:opacity-50">
          템플릿 저장
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}
