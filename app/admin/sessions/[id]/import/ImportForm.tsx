"use client";

import { useState, useTransition } from "react";
import { previewImportAction, confirmImportAction, type NameResolution } from "./actions";
import type { ParseResult } from "@/lib/admin/importParser";

type Option = { id: string; label: string };

export function ImportForm({ sessionId, members }: { sessionId: string; members: Option[] }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, NameResolution>>({});
  const [error, setError] = useState<string | null>(null);
  const [successCounts, setSuccessCounts] = useState<ParseResult["counts"] | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePreview() {
    setError(null);
    setSuccessCounts(null);
    startTransition(async () => {
      const result = await previewImportAction(text);
      setPreview(result);
      setResolutions(
        Object.fromEntries(result.unmatchedNames.map((name) => [name, { type: "new" as const }]))
      );
    });
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await confirmImportAction(sessionId, text, resolutions);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccessCounts(result.counts);
      setPreview(null);
      setText("");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
          setSuccessCounts(null);
        }}
        rows={14}
        placeholder="구글 문서에서 복사한 텍스트를 붙여넣으세요."
        className="w-full rounded border border-gray-300 p-2 font-mono text-sm"
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={isPending || text.trim().length === 0}
          onClick={handlePreview}
          className="rounded bg-gray-900 px-3 py-1 text-white disabled:opacity-50"
        >
          미리보기
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
        {successCounts && (
          <span className="text-sm text-green-700">
            저장 완료 — 논제 {successCounts.topics}개, 답변 {successCounts.answers}개, 사유더하기{" "}
            {successCounts.replies}개
          </span>
        )}
      </div>

      {preview && (
        <div className="rounded border border-gray-200 p-3">
          <p className="mb-3 text-sm">
            논제 {preview.counts.topics}개, 답변 {preview.counts.answers}개, 사유더하기{" "}
            {preview.counts.replies}개를 만듭니다.
          </p>

          <ul className="mb-3 list-inside list-decimal text-sm text-gray-600">
            {preview.topics.map((topic) => (
              <li key={topic.orderNo}>
                [{topic.kind}] {topic.title} — 답변 {topic.answers.length}개
              </li>
            ))}
          </ul>

          {preview.unclassified.length > 0 && (
            <div className="mb-3 flex flex-col gap-2 rounded border border-orange-300 bg-orange-50 p-2">
              <p className="text-sm font-semibold">
                미분류 텍스트 {preview.unclassified.length}건 — 자동 저장되지 않습니다. 직접
                확인 후 수동으로 배정하거나 무시하세요.
              </p>
              {preview.unclassified.map((block, i) => (
                <div key={i} className="rounded border border-orange-200 bg-white p-2">
                  <p className="mb-1 text-xs font-semibold text-gray-600">
                    {block.topicOrderNo}. {block.topicTitle}
                  </p>
                  <pre className="whitespace-pre-wrap font-mono text-xs text-gray-700">
                    {block.text}
                  </pre>
                </div>
              ))}
            </div>
          )}

          {preview.unmatchedNames.length > 0 && (
            <div className="mb-3 flex flex-col gap-2 rounded border border-yellow-300 bg-yellow-50 p-2">
              <p className="text-sm font-semibold">
                이름 매칭에 실패했습니다 — 연결 방법을 선택하세요.
              </p>
              {preview.unmatchedNames.map((name) => (
                <div key={name} className="flex items-center gap-2 text-sm">
                  <span className="w-20">{name}</span>
                  <select
                    value={
                      resolutions[name]?.type === "existing"
                        ? resolutions[name].memberId
                        : "new"
                    }
                    onChange={(e) => {
                      const value = e.target.value;
                      setResolutions((prev) => ({
                        ...prev,
                        [name]:
                          value === "new"
                            ? { type: "new" }
                            : { type: "existing", memberId: value },
                      }));
                    }}
                    className="rounded border border-gray-300 px-2 py-1"
                  >
                    <option value="new">새 멤버로 추가</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        기존 멤버: {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            disabled={isPending}
            onClick={handleConfirm}
            className="rounded bg-gray-900 px-3 py-1 text-white disabled:opacity-50"
          >
            확인 — 저장
          </button>
        </div>
      )}
    </div>
  );
}
