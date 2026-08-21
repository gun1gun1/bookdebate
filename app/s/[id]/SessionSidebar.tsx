"use client";

import { useEffect, useState } from "react";
import { BookCover } from "@/components/BookCover";
import { ShareButton } from "@/components/ShareButton";
import { isMandatoryKind } from "@/lib/topics";
import type { Topic } from "./types";

// 좌측 사이드바(책 정보/참여현황/논제 목차+스크롤스파이/공유버튼).
// xl: 미만에서는 같은 컴포넌트가 가로 요약 바(접이식 목차)로 전환된다
// — docs/REFACTOR_PLAN.md 4.7절.
export function SessionSidebar({
  sessionId,
  bookTitle,
  bookAuthor,
  bookCoverUrl,
  meetsAt,
  deadlineAt,
  topics,
  completedCount,
  totalCount,
}: {
  sessionId: string;
  bookTitle: string;
  bookAuthor: string | null;
  bookCoverUrl: string | null;
  meetsAt: string;
  deadlineAt: string | null;
  topics: Topic[];
  completedCount: number;
  totalCount: number;
}) {
  const [activeTopicId, setActiveTopicId] = useState<string | null>(topics[0]?.id ?? null);
  const [tocOpen, setTocOpen] = useState(false);

  useEffect(() => {
    const elements = topics
      .map((t) => document.getElementById(`topic-${t.id}`))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const topMost = visible.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b
        );
        setActiveTopicId(topMost.target.id.replace(/^topic-/, ""));
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 }
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [topics]);

  const toc = (
    <ul className="flex flex-col gap-1">
      {topics.map((t) => (
        <li key={t.id}>
          <a
            href={`#topic-${t.id}`}
            onClick={() => setTocOpen(false)}
            className={`flex items-center gap-1.5 rounded px-2 py-1.5 text-sm ${
              activeTopicId === t.id ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <span className="min-w-0 flex-1 truncate">
              {t.order_no}. {t.title}
            </span>
            {!isMandatoryKind(t.kind) && (
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                  activeTopicId === t.id ? "bg-gray-700 text-gray-200" : "bg-gray-100 text-gray-500"
                }`}
              >
                선택
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );

  const shareButton = (
    <ShareButton
      bookTitle={bookTitle}
      meetsAt={meetsAt}
      deadlineAt={deadlineAt}
      completedCount={completedCount}
      totalCount={totalCount}
      sessionId={sessionId}
    />
  );

  return (
    <div className="xl:w-80 xl:shrink-0">
      {/* xl 이상: 세로 사이드바, sticky */}
      <div className="hidden xl:sticky xl:top-6 xl:flex xl:max-h-[calc(100vh-3rem)] xl:flex-col xl:gap-6 xl:overflow-y-auto xl:rounded-lg xl:border xl:border-gray-200 xl:p-5">
        <div className="flex gap-3">
          <BookCover coverUrl={bookCoverUrl} title={bookTitle} size={80} />
          <div className="min-w-0">
            <h1 className="text-base font-semibold leading-snug">『{bookTitle}』</h1>
            {bookAuthor && <p className="mt-0.5 text-sm text-gray-500">{bookAuthor}</p>}
            <p className="mt-2 text-xs text-gray-500">
              모임 {meetsAt}
              {deadlineAt ? ` · 마감 ${deadlineAt}` : ""}
            </p>
          </div>
        </div>

        <p className="text-sm text-gray-600">
          작성 {completedCount}/{totalCount}명 완료
        </p>

        {shareButton}

        <div>
          <p className="mb-2 text-xs font-semibold text-gray-400">논제 {topics.length}개</p>
          {toc}
        </div>
      </div>

      {/* xl 미만: 가로 요약 바, 목차는 접이식 아코디언 */}
      <div className="rounded-lg border border-gray-200 p-4 xl:hidden">
        <div className="flex items-center gap-3">
          <BookCover coverUrl={bookCoverUrl} title={bookTitle} size={48} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold leading-snug">『{bookTitle}』</h1>
            <p className="truncate text-xs text-gray-500">
              모임 {meetsAt}
              {deadlineAt ? ` · 마감 ${deadlineAt}` : ""} · 작성 {completedCount}/{totalCount}명
            </p>
          </div>
          {shareButton}
        </div>

        <button
          type="button"
          onClick={() => setTocOpen((v) => !v)}
          className="mt-3 flex w-full items-center justify-between text-sm text-gray-600"
        >
          <span>논제 {topics.length}개</span>
          <span className="text-gray-400">{tocOpen ? "▴" : "▾"}</span>
        </button>
        {tocOpen && <div className="mt-2">{toc}</div>}
      </div>
    </div>
  );
}
