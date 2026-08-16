"use client";

import { useState, useTransition } from "react";

type DeleteResult = { ok: boolean; error?: string };

// 네이티브 confirm() 대신 같은 자리에서 "정말 삭제"로 바뀌는 2단계 버튼.
// docs/DECISIONS.md "Phase 3"/"Phase 4" 참고 — admin과 참여자 화면(본인
// answer/reply 삭제)이 함께 쓰는 공용 컴포넌트다.
export function DeleteButton({
  action,
  confirmLabel = "정말 삭제",
}: {
  action: () => Promise<DeleteResult>;
  confirmLabel?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-red-600 hover:underline"
      >
        삭제
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await action();
            if (!result.ok) {
              setError(result.error ?? "삭제할 수 없습니다.");
              setConfirming(false);
            }
          });
        }}
        className="font-semibold text-red-600 hover:underline disabled:opacity-50"
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-gray-500 hover:underline"
      >
        취소
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
