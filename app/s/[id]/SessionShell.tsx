"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShareButton } from "@/components/ShareButton";
import { isAnswerComplete } from "@/lib/topics";
import { TopicPanel } from "./TopicPanel";
import { MemberPanel } from "./MemberPanel";
import { MatrixPanel } from "./MatrixPanel";
import type { Member, Rating, Topic } from "./types";
import type { SessionStatus } from "@/lib/supabase/types";

type View = "topic" | "member" | "matrix";

export function SessionShell({
  sessionId,
  bookTitle,
  meetsAt,
  deadlineAt,
  status,
  topics,
  members,
  ratings,
  currentMemberId,
  isAdmin,
  initialView,
  initialTopicId,
}: {
  sessionId: string;
  bookTitle: string;
  meetsAt: string;
  deadlineAt: string | null;
  status: SessionStatus;
  topics: Topic[];
  members: Member[];
  ratings: Rating[];
  currentMemberId: string;
  isAdmin: boolean;
  initialView: View;
  initialTopicId: string | null;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>(initialView);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(initialTopicId);
  const [hasOpenEditor, setHasOpenEditor] = useState(false);

  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (hasOpenEditor) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasOpenEditor]);

  const guarded = useCallback(
    (action: () => void) => {
      if (hasOpenEditor && !window.confirm("작성 중인 내용이 있습니다. 저장하지 않고 이동할까요?")) {
        return;
      }
      action();
    },
    [hasOpenEditor]
  );

  function syncUrl(nextView: View, nextTopicId: string | null) {
    const qs = new URLSearchParams();
    qs.set("view", nextView);
    if (nextView === "topic" && nextTopicId) qs.set("topic", nextTopicId);
    router.replace(`/s/${sessionId}?${qs.toString()}`, { scroll: false });
  }

  const selectedTopic = topics.find((t) => t.id === selectedTopicId) ?? topics[0] ?? null;
  const ratingTopic = topics.find((t) => t.has_rating) ?? null;
  const myRating = ratings.find((r) => r.member_id === currentMemberId)?.stars ?? null;

  const completedCount = members.filter((m) =>
    topics.every((t) => isAnswerComplete(t.kind, t.answers.find((a) => a.member_id === m.id) ?? null))
  ).length;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">『{bookTitle}』</h1>
          <p className="text-sm text-gray-500">
            모임 {meetsAt}
            {deadlineAt ? ` · 마감 ${deadlineAt}` : ""}
          </p>
        </div>
        <ShareButton
          bookTitle={bookTitle}
          meetsAt={meetsAt}
          deadlineAt={deadlineAt}
          completedCount={completedCount}
          totalCount={members.length}
          sessionId={sessionId}
        />
      </div>

      <div className="mb-4 flex gap-4 border-b border-gray-200 text-sm">
        <button
          type="button"
          onClick={() => guarded(() => { setView("topic"); syncUrl("topic", selectedTopicId); })}
          className={`border-b-2 pb-2 ${view === "topic" ? "border-gray-900 font-semibold" : "border-transparent text-gray-500"}`}
        >
          논제별
        </button>
        <button
          type="button"
          onClick={() => guarded(() => { setView("member"); syncUrl("member", selectedTopicId); })}
          className={`border-b-2 pb-2 ${view === "member" ? "border-gray-900 font-semibold" : "border-transparent text-gray-500"}`}
        >
          사람별
        </button>
        <button
          type="button"
          onClick={() => guarded(() => { setView("matrix"); syncUrl("matrix", selectedTopicId); })}
          className={`hidden border-b-2 pb-2 lg:inline ${view === "matrix" ? "border-gray-900 font-semibold" : "border-transparent text-gray-500"}`}
        >
          한눈에
        </button>
      </div>

      {view === "topic" && (
        <div className="flex flex-col gap-6 lg:flex-row">
          <nav className="flex gap-2 overflow-x-auto lg:sticky lg:top-4 lg:w-52 lg:flex-col lg:gap-1 lg:overflow-visible">
            {topics.map((t) => {
              const done = isAnswerComplete(t.kind, t.answers.find((a) => a.member_id === currentMemberId) ?? null);
              const active = t.id === selectedTopic?.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => guarded(() => { setSelectedTopicId(t.id); syncUrl("topic", t.id); })}
                  className={`flex shrink-0 items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                    active ? "bg-gray-900 text-white" : "hover:bg-gray-100"
                  }`}
                >
                  <span
                    className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                      done ? "bg-green-500" : active ? "bg-white/50" : "bg-gray-300"
                    }`}
                  />
                  <span className="max-w-[16rem] truncate lg:whitespace-normal">
                    {t.order_no}. {t.title}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="min-w-0 flex-1">
            {selectedTopic && (
              <TopicPanel
                sessionId={sessionId}
                sessionStatus={status}
                topic={selectedTopic}
                members={members}
                currentMemberId={currentMemberId}
                isAdmin={isAdmin}
                showRating={ratingTopic?.id === selectedTopic.id}
                myRating={myRating}
                onEditorOpenChange={setHasOpenEditor}
              />
            )}
          </div>
        </div>
      )}

      {view === "member" && (
        <MemberPanel topics={topics} members={members} initialMemberId={currentMemberId} />
      )}

      {view === "matrix" && (
        <div className="hidden lg:block">
          <MatrixPanel
            topics={topics}
            members={members}
            onCellClick={(topicId) => guarded(() => { setView("topic"); setSelectedTopicId(topicId); syncUrl("topic", topicId); })}
          />
        </div>
      )}
    </div>
  );
}
