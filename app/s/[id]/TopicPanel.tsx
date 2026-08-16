"use client";

import { useEffect, useState, useTransition } from "react";
import { AnswerContent } from "@/components/AnswerContent";
import { StarRating } from "@/components/StarRating";
import { DeleteButton } from "@/components/DeleteButton";
import {
  upsertAnswerAction,
  deleteAnswerAction,
  upsertReplyAction,
  deleteReplyAction,
  upsertRatingAction,
} from "./actions";
import type { Answer, Member, Topic } from "./types";
import type { SessionStatus } from "@/lib/supabase/types";

export function TopicPanel({
  sessionId,
  sessionStatus,
  topic,
  members,
  currentMemberId,
  isAdmin,
  showRating,
  myRating,
  onEditorOpenChange,
}: {
  sessionId: string;
  sessionStatus: SessionStatus;
  topic: Topic;
  members: Member[];
  currentMemberId: string;
  isAdmin: boolean;
  showRating: boolean;
  myRating: number | null;
  onEditorOpenChange: (open: boolean) => void;
}) {
  const canWrite = sessionStatus === "open";
  const myAnswer = topic.answers.find((a) => a.member_id === currentMemberId) ?? null;

  const [editingMine, setEditingMine] = useState(false);
  const [openReplyFor, setOpenReplyFor] = useState<Set<string>>(new Set());
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);

  useEffect(() => {
    onEditorOpenChange(editingMine || openReplyFor.size > 0 || editingReplyId !== null);
  }, [editingMine, openReplyFor, editingReplyId, onEditorOpenChange]);

  return (
    <div>
      <h2 className="text-lg font-semibold">{topic.title}</h2>
      {topic.body && <p className="mt-1 max-w-[68ch] text-sm text-gray-600">{topic.body}</p>}

      {showRating && (
        <div className="mt-3">
          <StarRating sessionId={sessionId} initialStars={myRating} action={upsertRatingAction} />
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
            editingMine={editingMine}
            setEditingMine={setEditingMine}
          />
        ) : (
          <ExcerptView
            topic={topic}
            currentMemberId={currentMemberId}
            isAdmin={isAdmin}
            canWrite={canWrite}
            myAnswer={myAnswer}
            editingMine={editingMine}
            setEditingMine={setEditingMine}
            openReplyFor={openReplyFor}
            setOpenReplyFor={setOpenReplyFor}
            editingReplyId={editingReplyId}
            setEditingReplyId={setEditingReplyId}
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
  editingMine,
  setEditingMine,
}: {
  topic: Topic;
  members: Member[];
  currentMemberId: string;
  isAdmin: boolean;
  canWrite: boolean;
  myAnswer: Answer | null;
  editingMine: boolean;
  setEditingMine: (v: boolean) => void;
}) {
  const [text, setText] = useState(myAnswer?.body ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const others = members.filter((m) => m.id !== currentMemberId);
  const orderedMembers = [{ id: currentMemberId, name: "" }, ...others];

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await upsertAnswerAction(topic.id, { body: text });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditingMine(false);
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

            {isMe && editingMine ? (
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
                      setEditingMine(false);
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
                onClick={() => canWrite && setEditingMine(true)}
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

            {isMe && !editingMine && (
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
          </div>
        );
      })}
    </div>
  );
}

function ExcerptView({
  topic,
  currentMemberId,
  isAdmin,
  canWrite,
  myAnswer,
  editingMine,
  setEditingMine,
  openReplyFor,
  setOpenReplyFor,
  editingReplyId,
  setEditingReplyId,
}: {
  topic: Topic;
  currentMemberId: string;
  isAdmin: boolean;
  canWrite: boolean;
  myAnswer: Answer | null;
  editingMine: boolean;
  setEditingMine: (v: boolean) => void;
  openReplyFor: Set<string>;
  setOpenReplyFor: (v: Set<string>) => void;
  editingReplyId: string | null;
  setEditingReplyId: (v: string | null) => void;
}) {
  const answersWithContent = topic.answers.filter((a) => a.excerpt_text?.trim());
  const ordered = [
    ...(myAnswer ? [myAnswer] : []),
    ...answersWithContent.filter((a) => a.id !== myAnswer?.id),
  ];

  return (
    <div className="flex flex-col gap-8">
      {!myAnswer && canWrite && !editingMine && (
        <button
          type="button"
          onClick={() => setEditingMine(true)}
          className="self-start rounded border border-gray-900 px-3 py-1 text-sm"
        >
          내 발췌 추가하기
        </button>
      )}

      {!myAnswer && editingMine && (
        <ExcerptEditor
          topicId={topic.id}
          initialText=""
          initialReason=""
          onDone={() => setEditingMine(false)}
          onCancel={() => setEditingMine(false)}
        />
      )}

      {ordered.map((answer) => {
        const isMe = answer.member_id === currentMemberId;
        const isEditingThis = isMe && editingMine;

        return (
          <div key={answer.id} className="border-b border-gray-100 pb-6 last:border-none">
            <p className="mb-1 text-xs font-semibold text-gray-500">
              {answer.member?.name}{isMe ? " (나)" : ""}
            </p>

            {isEditingThis ? (
              <ExcerptEditor
                topicId={topic.id}
                initialText={answer.excerpt_text ?? ""}
                initialReason={answer.excerpt_reason ?? ""}
                onDone={() => setEditingMine(false)}
                onCancel={() => setEditingMine(false)}
              />
            ) : (
              <>
                <AnswerContent kind="excerpt" answer={answer} />
                {isMe && canWrite && (
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditingMine(true)}
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
                {!isMe && isAdmin && canWrite && (
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
              </>
            )}

            <div className="mt-3 ml-4 flex flex-col gap-2 border-l border-gray-100 pl-4">
              {answer.replies.map((reply) => (
                <ReplyRow
                  key={reply.id}
                  reply={reply}
                  isMine={reply.member_id === currentMemberId || isAdmin}
                  canWrite={canWrite}
                  isEditing={editingReplyId === reply.id}
                  onEdit={() => setEditingReplyId(reply.id)}
                  onDone={() => setEditingReplyId(null)}
                />
              ))}

              {canWrite && (
                <ReplyComposer
                  answerId={answer.id}
                  isOpen={openReplyFor.has(answer.id)}
                  onToggle={(open) => {
                    const next = new Set(openReplyFor);
                    if (open) next.add(answer.id);
                    else next.delete(answer.id);
                    setOpenReplyFor(next);
                  }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ExcerptEditor({
  topicId,
  initialText,
  initialReason,
  onDone,
  onCancel,
}: {
  topicId: string;
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
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await upsertAnswerAction(topicId, {
                excerptText: text,
                excerptReason: reason,
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

function ReplyRow({
  reply,
  isMine,
  canWrite,
  isEditing,
  onEdit,
  onDone,
}: {
  reply: { id: string; body: string; member: { name: string } | null };
  isMine: boolean;
  canWrite: boolean;
  isEditing: boolean;
  onEdit: () => void;
  onDone: () => void;
}) {
  const [text, setText] = useState(reply.body);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (isEditing) {
    return (
      <div className="flex flex-col gap-1">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          className="w-full max-w-[60ch] rounded border border-gray-300 p-1.5 text-sm"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await upsertReplyAction(reply.id, reply.id, text);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                onDone();
              })
            }
            className="text-xs font-semibold text-gray-900 hover:underline"
          >
            저장
          </button>
          <button type="button" onClick={onDone} className="text-xs text-gray-500 hover:underline">
            취소
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="text-sm">
      <span className="font-semibold">{reply.member?.name}: </span>
      <span className="whitespace-pre-wrap">{reply.body}</span>
      {isMine && canWrite && (
        <span className="ml-2 inline-flex gap-2 text-xs">
          <button type="button" onClick={onEdit} className="text-gray-500 hover:underline">
            수정
          </button>
          <DeleteButton action={async () => deleteReplyAction(reply.id)} />
        </span>
      )}
    </div>
  );
}

function ReplyComposer({
  answerId,
  isOpen,
  onToggle,
}: {
  answerId: string;
  isOpen: boolean;
  onToggle: (open: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => onToggle(true)}
        className="self-start text-xs text-gray-500 hover:underline"
      >
        + 사유 더하기
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="사유를 더해 주세요"
        className="w-full max-w-[60ch] rounded border border-gray-300 p-1.5 text-sm"
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await upsertReplyAction(answerId, null, text);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setText("");
              onToggle(false);
            })
          }
          className="text-xs font-semibold text-gray-900 hover:underline"
        >
          등록
        </button>
        <button type="button" onClick={() => onToggle(false)} className="text-xs text-gray-500 hover:underline">
          취소
        </button>
      </div>
    </div>
  );
}
