"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// 스트림 레이아웃에서는 여러 논제의 편집기가 동시에 열릴 수 있어, 화면 밖에
// 저장하지 않은 편집기가 남아 잊히는 사고가 생길 수 있다. 페이지 전체에서
// 편집기 키(예: "answer:{topicId}", "reply:{answerId}")를 하나만 열리도록
// 제한한다 — docs/REFACTOR_PLAN.md 4.2절.
type EditorLock = {
  openEditorKey: string | null;
  tryOpen: (key: string) => boolean;
  close: (key: string) => void;
};

const EditorLockContext = createContext<EditorLock | null>(null);

export function EditorLockProvider({ children }: { children: React.ReactNode }) {
  const [openEditorKey, setOpenEditorKey] = useState<string | null>(null);

  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (openEditorKey) e.preventDefault();
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [openEditorKey]);

  const tryOpen = useCallback(
    (key: string) => {
      if (openEditorKey && openEditorKey !== key) {
        if (!window.confirm("저장하지 않은 내용이 있습니다. 계속할까요?")) return false;
      }
      setOpenEditorKey(key);
      return true;
    },
    [openEditorKey]
  );

  const close = useCallback((key: string) => {
    setOpenEditorKey((cur) => (cur === key ? null : cur));
  }, []);

  const value = useMemo(() => ({ openEditorKey, tryOpen, close }), [openEditorKey, tryOpen, close]);

  return <EditorLockContext.Provider value={value}>{children}</EditorLockContext.Provider>;
}

export function useEditorLock(): EditorLock {
  const ctx = useContext(EditorLockContext);
  if (!ctx) throw new Error("useEditorLock must be used within EditorLockProvider");
  return ctx;
}
