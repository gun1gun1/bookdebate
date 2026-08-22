"use client";

import { useState, useTransition } from "react";
import { AnswerContent } from "@/components/AnswerContent";
import { StarRating } from "@/components/StarRating";
import { RatingSummary } from "@/components/RatingSummary";
import { DeleteButton } from "@/components/DeleteButton";
import { ReplyThread } from "@/components/ReplyThread";
import { useEditorLock } from "./EditorLockContext";
import { upsertAnswerAction, upsertExcerptAction, deleteAnswerAction, upsertRatingAction } from "./actions";
import { DifficultView } from "./DifficultView";
import { ChoiceView } from "./ChoiceView";
import { AppendixView } from "./AppendixView";
import { KIND_LABEL, isMandatoryKind } from "@/lib/topics";
import type { Answer, Member, Rating, Topic } from "./types";
import type { SessionStatus } from "@/lib/supabase/types";

export function TopicPanel({
  sessionId,
  sessionStatus,
  meetsAt,
  topic,
  members,
  currentMemberId,
  isAdmin,
  showRating,
  myRating,
  ratings,
}: {
  sessionId: string;
  sessionStatus: SessionStatus;
  meetsAt: string;
  topic: Topic;
  members: Member[];
  currentMemberId: string;
  isAdmin: boolean;
  showRating: boolean;
  myRating: number | null;
  ratings: Rating[];
}) {
  const canWrite = sessionStatus === "open";
  const myAnswer = topic.answers.find((a) => a.member_id === currentMemberId) ?? null;

  return (
    <div id={`topic-${topic.id}`} className="scroll-mt-6">
      <div className="mb-6 border-b border-gray-200 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-[#F2CB66] px-2 py-0.5 text-xs font-semibold text-gray-900">
            {KIND_LABEL[topic.kind]}
          </span>
          {!isMandatoryKind(topic.kind) && (
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">선택</span>
          )}
        </div>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-gray-900">{topic.title}</h2>
        {topic.body && <p className="mt-1 max-w-[68ch] text-sm text-gray-600">{topic.body}</p>}
      </div>

      {showRating && (
        <div className="mt-3">
          <StarRating sessionId={sessionId} initialStars={myRating} action={upsertRatingAction} />
          <RatingSummary members={members} ratings={ratings} currentMemberId={currentMemberId} />
        </div>
      )}

      <div className="mt-6">
        {topic.kind === "free" ? (
          <FreeView
            topic={topic}
            members={members}
            currentMemberId={currentMemberId}
            isAdmin={isAdmin}
            canWrite={canWrite}
            myAnswer={myAnswer}
          />
        ) : topic.kind === "excerpt" ? (
          <ExcerptView
            topic={topic}
            currentMemberId={currentMemberId}
            isAdmin={isAdmin}
            canWrite={canWrite}
          />
        ) : topic.kind === "difficult" ? (
          <DifficultView
            topic={topic}
            currentMemberId={currentMemberId}
            isAdmin={isAdmin}
            canWrite={canWrite}
            myAnswer={myAnswer}
            meetsAt={meetsAt}
          />
        ) : topic.kind === "choice" ? (
          <ChoiceView
            topic={topic}
            currentMemberId={currentMemberId}
            isAdmin={isAdmin}
            canWrite={canWrite}
          />
        ) : (
          <AppendixView
            topic={topic}
            currentMemberId={currentMemberId}
            isAdmin={isAdmin}
            canWrite={canWrite}
          />
        )}
      </div>
    </div>
  );
}

function SavedBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="text-xs text-green-700">저장됨 · 방금</span>;
}

function FreeView({
  topic,
  members,
  currentMemberId,
  isAdmin,
  canWrite,
  myAnswer,
}: {
  topic: Topic;
  members: Member[];
  currentMemberId: string;
  isAdmin: boolean;
  canWrite: boolean;
  myAnswer: Answer | null;
}) {
  const { openEditorKey, tryOpen, close } = useEditorLock();
  const editorKey = `answer:${topic.id}`;
  const isEditing = openEditorKey === editorKey;

  const [text, setText] = useState(myAnswer?.body ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const others = members.filter((m) => m.id !== currentMemberId);
  const orderedMembers = [{ id: currentMemberId, name: "" }, ...others];

  function startEditing() {
    if (!tryOpen(editorKey)) return;
    setText(myAnswer?.body ?? "");
    setError(null);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await upsertAnswerAction(topic.id, { body: text });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      close(editorKey);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {orderedMembers.map((m) => {
        const isMe = m.id === currentMemberId;
        const memberName = isMe ? members.find((x) => x.id === currentMemberId)?.name ?? "" : m.name;
        const answer = isMe ? myAnswer : topic.answers.find((a) => a.member_id === m.id) ?? null;

        return (
          <div
            key={m.id}
            className={`rounded-lg border p-4 ${isMe ? "border-gray-900" : "border-gray-200"}`}
          >
            <p className="mb-2 text-xs font-semibold text-gray-500">{memberName}{isMe ? " (나)" : ""}</p>

            {isMe && isEditing ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={5}
                  className="w-full max-w-[68ch] rounded border border-gray-300 p-2 text-[16px] leading-[1.7]"
                />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={save}
                    className="rounded bg-gray-900 px-3 py-1 text-sm text-white disabled:opacity-50"
                  >
                    저장
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setText(myAnswer?.body ?? "");
                      close(editorKey);
                    }}
                    className="text-sm text-gray-500 hover:underline"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : isMe ? (
              <button
                type="button"
                disabled={!canWrite}
                onClick={() => canWrite && startEditing()}
                className="block w-full text-left disabled:cursor-not-allowed"
              >
                <AnswerContent kind="free" answer={myAnswer} />
                {!myAnswer?.body && canWrite && (
                  <span className="text-sm text-gray-500">클릭해서 답변 작성</span>
                )}
              </button>
            ) : (
              <AnswerContent kind="free" answer={answer} />
            )}

            {isMe && !isEditing && (
              <div className="mt-2 flex items-center gap-3">
                <SavedBadge show={saved} />
                {canWrite && myAnswer && (
                  <DeleteButton
                    action={async () => {
                      const result = await deleteAnswerAction(myAnswer.id);
                      return result.ok ? { ok: true } : { ok: false, error: result.error };
                    }}
                  />
                )}
              </div>
            )}

            {!isMe && isAdmin && canWrite && answer && (
              <div className="mt-2">
                <DeleteButton
                  action={async () => {
                    const result = await deleteAnswerAction(answer.id);
                    return result.ok ? { ok: true } : { ok: false, error: result.error };
                  }}
                />
              </div>
            )}

            {answer && (
              <ReplyThread
                answerId={answer.id}
                replies={answer.replies}
                canWrite={canWrite}
                currentMemberId={currentMemberId}
                isAdmin={isAdmin}
                label="의견 남기기"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

const NEW_EXCERPT = "new";

// R1-f(발췌 다건 허용) — 1인 다건, appendix의 slot 패턴을 그대로 따른다
// (AppendixView 참고). 내 발췌들을 먼저 쌓아 보여주고 그 아래 "발췌
// 추가하기"(하나도 없으면 "내 발췌 추가하기") 버튼, 그다음 다른 참여자들의
// 발췌 순서로 렌더링한다. 편집기는 topic당 하나만 열리도록 공용
// EditorLockContext 키(answer:{topicId})를 공유하고, 신규 작성인지 기존
// 발췌 수정인지는 로컬 상태(editingTarget)로 구분한다(AppendixView와 동일
// 패턴).
function ExcerptView({
  topic,
  currentMemberId,
  isAdmin,
  canWrite,
}: {
  topic: Topic;
  currentMemberId: string;
  isAdmin: boolean;
  canWrite: boolean;
}) {
  const { openEditorKey, tryOpen, close } = useEditorLock();
  const editorKey = `answer:${topic.id}`;
  const isEditorOpen = openEditorKey === editorKey;
  const [editingTarget, setEditingTarget] = useState<string | null>(null);

  const myAnswers = topic.answers
    .filter((a) => a.member_id === currentMemberId)
    .sort((a, b) => a.slot - b.slot);
  const othersWithContent = topic.answers.filter(
    (a) => a.member_id !== currentMemberId && a.quote_text?.trim()
  );

  function openNew() {
    if (!tryOpen(editorKey)) return;
    setEditingTarget(NEW_EXCERPT);
  }

  function openEdit(answerId: string) {
    if (!tryOpen(editorKey)) return;
    setEditingTarget(answerId);
  }

  function closeEditor() {
    close(editorKey);
    setEditingTarget(null);
  }

  return (
    <div className="flex flex-col gap-8">
      {myAnswers.map((answer) => {
        const isEditingThis = isEditorOpen && editingTarget === answer.id;

        return (
          <div key={answer.id} className="border-b border-gray-100 pb-6">
            <p className="mb-1 text-xs font-semibold text-gray-500">{answer.member?.name} (나)</p>

            {isEditingThis ? (
              <ExcerptEditor
                topicId={topic.id}
                answerId={answer.id}
                initialText={answer.quote_text ?? ""}
                initialReason={answer.quote_reason ?? ""}
                onDone={closeEditor}
                onCancel={closeEditor}
              />
            ) : (
              <>
                <AnswerContent kind="excerpt" answer={answer} />
                {canWrite && (
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => openEdit(answer.id)}
                      className="text-sm text-gray-700 hover:underline"
                    >
                      수정
                    </button>
                    <DeleteButton
                      confirmLabel={
                        answer.replies.length > 0
                          ? `사유더하기 ${answer.replies.length}개도 함께 삭제됩니다 · 정말 삭제`
                          : "정말 삭제"
                      }
                      action={async () => {
                        const result = await deleteAnswerAction(answer.id);
                        return result.ok ? { ok: true } : { ok: false, error: result.error };
                      }}
                    />
                  </div>
                )}
              </>
            )}

            <ReplyThread
              answerId={answer.id}
              replies={answer.replies}
              canWrite={canWrite}
              currentMemberId={currentMemberId}
              isAdmin={isAdmin}
              label="사유 더하기"
            />
          </div>
        );
      })}

      {isEditorOpen && editingTarget === NEW_EXCERPT && (
        <div className="border-b border-gray-100 pb-6">
          <ExcerptEditor
            topicId={topic.id}
            answerId={null}
            initialText=""
            initialReason=""
            onDone={closeEditor}
            onCancel={closeEditor}
          />
        </div>
      )}

      {canWrite && !(isEditorOpen && editingTarget === NEW_EXCERPT) && (
        <button
          type="button"
          onClick={openNew}
          className="self-start rounded border border-gray-900 px-3 py-1 text-sm"
        >
          {myAnswers.length === 0 ? "내 발췌 추가하기" : "발췌 추가하기"}
        </button>
      )}

      {othersWithContent.map((answer, i) => (
        <div
          key={answer.id}
          className={`border-b border-gray-100 pb-6 ${i === othersWithContent.length - 1 ? "border-none" : ""}`}
        >
          <p className="mb-1 text-xs font-semibold text-gray-500">{answer.member?.name}</p>

          <AnswerContent kind="excerpt" answer={answer} />
          {isAdmin && canWrite && (
            <div className="mt-2">
              <DeleteButton
                confirmLabel={
                  answer.replies.length > 0
                    ? `사유더하기 ${answer.replies.length}개도 함께 삭제됩니다 · 정말 삭제`
                    : "정말 삭제"
                }
                action={async () => {
                  const result = await deleteAnswerAction(answer.id);
                  return result.ok ? { ok: true } : { ok: false, error: result.error };
                }}
              />
            </div>
          )}

          <ReplyThread
            answerId={answer.id}
            replies={answer.replies}
            canWrite={canWrite}
            currentMemberId={currentMemberId}
            isAdmin={isAdmin}
            label="사유 더하기"
          />
        </div>
      ))}
    </div>
  );
}

function ExcerptEditor({
  topicId,
  answerId,
  initialText,
  initialReason,
  onDone,
  onCancel,
}: {
  topicId: string;
  answerId: string | null;
  initialText: string;
  initialReason: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [reason, setReason] = useState(initialReason);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-gray-500">발췌문</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="w-full max-w-[68ch] rounded border border-gray-300 p-2 font-serif text-[16px] leading-[1.7]"
      />
      <label className="text-xs text-gray-500">고른 이유</label>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        className="w-full max-w-[68ch] rounded border border-gray-300 p-2 text-[16px] leading-[1.7]"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={isPending || !text.trim()}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await upsertExcerptAction(topicId, answerId, {
                quoteText: text,
                quoteReason: reason,
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              onDone();
            })
          }
          className="rounded bg-gray-900 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          저장
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:underline">
          취소
        </button>
      </div>
    </div>
  );
}
