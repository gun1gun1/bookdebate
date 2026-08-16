"use client";

import { useState, useTransition } from "react";
import { createSessionAction, type TopicSource } from "./actions";

type Option = { id: string; label: string };

export function NewSessionForm({
  books,
  members,
  templates,
  sessions,
}: {
  books: Option[];
  members: Option[];
  templates: Option[];
  sessions: Option[];
}) {
  const [bookId, setBookId] = useState("");
  const [meetsAt, setMeetsAt] = useState("");
  const [deadlineAt, setDeadlineAt] = useState("");
  const [selectorMemberId, setSelectorMemberId] = useState("");
  const [hostMemberId, setHostMemberId] = useState("");
  const [sourceType, setSourceType] = useState<TopicSource["type"]>("none");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [cloneSessionId, setCloneSessionId] = useState(sessions[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);

        const topicSource: TopicSource =
          sourceType === "template"
            ? { type: "template", templateId }
            : sourceType === "clone"
              ? { type: "clone", sourceSessionId: cloneSessionId }
              : { type: "none" };

        startTransition(async () => {
          const result = await createSessionAction({
            bookId,
            meetsAt,
            deadlineAt,
            selectorMemberId,
            hostMemberId,
            topicSource,
          });
          if (result && !result.ok) {
            setError(result.error ?? "회차를 만들지 못했습니다.");
          }
        });
      }}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <select value={bookId} onChange={(e) => setBookId(e.target.value)} required className="rounded border border-gray-300 px-2 py-1">
          <option value="">책 선택</option>
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
        <input type="date" value={meetsAt} onChange={(e) => setMeetsAt(e.target.value)} required className="rounded border border-gray-300 px-2 py-1" />
        <input type="date" value={deadlineAt} onChange={(e) => setDeadlineAt(e.target.value)} placeholder="마감일" className="rounded border border-gray-300 px-2 py-1" />
        <select value={selectorMemberId} onChange={(e) => setSelectorMemberId(e.target.value)} className="rounded border border-gray-300 px-2 py-1">
          <option value="">선정자 없음</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <select value={hostMemberId} onChange={(e) => setHostMemberId(e.target.value)} className="rounded border border-gray-300 px-2 py-1">
          <option value="">진행자 없음</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-gray-500">논제:</span>
        <label className="flex items-center gap-1">
          <input type="radio" checked={sourceType === "none"} onChange={() => setSourceType("none")} />
          비워두기
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" checked={sourceType === "template"} onChange={() => setSourceType("template")} disabled={templates.length === 0} />
          템플릿에서 시작
        </label>
        {sourceType === "template" && (
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="rounded border border-gray-300 px-2 py-1">
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1">
          <input type="radio" checked={sourceType === "clone"} onChange={() => setSourceType("clone")} disabled={sessions.length === 0} />
          이전 회차 복제
        </label>
        {sourceType === "clone" && (
          <select value={cloneSessionId} onChange={(e) => setCloneSessionId(e.target.value)} className="rounded border border-gray-300 px-2 py-1">
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={isPending} className="rounded bg-gray-900 px-3 py-1 text-white disabled:opacity-50">
          회차 만들기
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}
