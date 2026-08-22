"use client";

import { isAnswerComplete, isMandatoryKind } from "@/lib/topics";
import { SessionSidebar } from "./SessionSidebar";
import { TopicPanel } from "./TopicPanel";
import { EditorLockProvider } from "./EditorLockContext";
import type { Member, Rating, Topic } from "./types";
import type { SessionStatus } from "@/lib/supabase/types";

export function SessionShell({
  sessionId,
  bookTitle,
  bookAuthor,
  bookCoverUrl,
  meetsAt,
  deadlineAt,
  status,
  topics,
  members,
  ratings,
  currentMemberId,
  isAdmin,
}: {
  sessionId: string;
  bookTitle: string;
  bookAuthor: string | null;
  bookCoverUrl: string | null;
  meetsAt: string;
  deadlineAt: string | null;
  status: SessionStatus;
  topics: Topic[];
  members: Member[];
  ratings: Rating[];
  currentMemberId: string;
  isAdmin: boolean;
}) {
  const ratingTopic = topics.find((t) => t.has_rating) ?? null;
  const myRating = ratings.find((r) => r.member_id === currentMemberId)?.stars ?? null;

  const mandatoryTopics = topics.filter((t) => isMandatoryKind(t.kind));
  const completedCount = members.filter((m) =>
    mandatoryTopics.every((t) =>
      isAnswerComplete(t.kind, t.answers.find((a) => a.member_id === m.id) ?? null)
    )
  ).length;

  return (
    <EditorLockProvider>
      <div className="mx-auto max-w-[1600px] px-6 py-6 xl:px-8">
        <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:gap-10">
          <SessionSidebar
            sessionId={sessionId}
            bookTitle={bookTitle}
            bookAuthor={bookAuthor}
            bookCoverUrl={bookCoverUrl}
            meetsAt={meetsAt}
            deadlineAt={deadlineAt}
            topics={topics}
            completedCount={completedCount}
            totalCount={members.length}
          />

          <div className="flex min-w-0 flex-1 flex-col gap-14">
            {topics.map((t) => (
              <TopicPanel
                key={t.id}
                sessionId={sessionId}
                sessionStatus={status}
                meetsAt={meetsAt}
                topic={t}
                members={members}
                currentMemberId={currentMemberId}
                isAdmin={isAdmin}
                showRating={ratingTopic?.id === t.id}
                myRating={myRating}
                ratings={ratings}
              />
            ))}
          </div>
        </div>
      </div>
    </EditorLockProvider>
  );
}
