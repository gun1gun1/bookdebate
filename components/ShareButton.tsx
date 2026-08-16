"use client";

import { useState } from "react";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function formatShareText(input: {
  bookTitle: string;
  meetsAt: string;
  deadlineAt: string | null;
  completedCount: number;
  totalCount: number;
  sessionId: string;
}) {
  const weekday = WEEKDAYS[new Date(input.meetsAt).getDay()];
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const lines = [
    `📖 『${input.bookTitle}』 논제가 올라왔습니다`,
    `모임: ${input.meetsAt} ${weekday}`,
    `작성: ${input.completedCount}/${input.totalCount}명 완료${
      input.deadlineAt ? ` · 마감 ${input.deadlineAt}` : ""
    }`,
    `${siteUrl}/s/${input.sessionId}`,
  ];
  return lines.join("\n");
}

export function ShareButton(props: {
  bookTitle: string;
  meetsAt: string;
  deadlineAt: string | null;
  completedCount: number;
  totalCount: number;
  sessionId: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(formatShareText(props));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="relative rounded border border-gray-300 px-3 py-1 text-sm hover:border-gray-500"
    >
      공유 문구 복사
      {copied && (
        <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white">
          복사됨
        </span>
      )}
    </button>
  );
}
