"use client";

import { useState } from "react";
import { AnswerContent } from "@/components/AnswerContent";
import type { Member, Topic } from "./types";

export function MemberPanel({
  topics,
  members,
  initialMemberId,
}: {
  topics: Topic[];
  members: Member[];
  initialMemberId: string;
}) {
  const [memberId, setMemberId] = useState(initialMemberId);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMemberId(m.id)}
            className={`rounded px-3 py-1 text-sm ${
              m.id === memberId ? "bg-gray-900 text-white" : "border border-gray-300"
            }`}
          >
            {m.name}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-8">
        {topics.map((topic) => {
          const answer = topic.answers.find((a) => a.member_id === memberId) ?? null;
          const myReplies = topic.answers.flatMap((a) =>
            a.replies
              .filter((r) => r.member_id === memberId)
              .map((r) => ({ ...r, onAnswerAuthor: a.member?.name ?? "" }))
          );

          return (
            <div key={topic.id}>
              <h3 className="mb-2 text-sm font-semibold text-gray-500">
                {topic.order_no}. {topic.title}
              </h3>
              <AnswerContent kind={topic.kind} answer={answer} />
              {myReplies.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 border-l border-gray-100 pl-3 text-sm text-gray-700">
                  {myReplies.map((r) => (
                    <li key={r.id}>
                      <span className="text-gray-400">→ {r.onAnswerAuthor}의 발췌에: </span>
                      {r.body}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
