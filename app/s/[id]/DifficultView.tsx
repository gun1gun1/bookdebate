"use client";

import { useState, useTransition } from "react";
import { AnswerContent } from "@/components/AnswerContent";
import { DeleteButton } from "@/components/DeleteButton";
import { ReplyThread } from "@/components/ReplyThread";
import { isPostMeetingOpen } from "@/lib/topics";
import { useEditorLock } from "./EditorLockContext";
import { upsertAnswerAction, deleteAnswerAction } from "./actions";
import type { Answer, Topic } from "./types";

// 선택 참여 — 작성자만 나열, 없으면 "내 구절 추가하기" 버튼만(미작성자 카드
// 없음). "같이 생각해 보니" 댓글은 모임 당일(KST) 이후로만 열린다 —
// 서버(upsertReplyAction)도 같은 isPostMeetingOpen을 재확인한다.
export function DifficultView({
  topic,
  currentMemberId,
  isAdmin,
  canWrite,
  myAnswer,
  meetsAt,
}: {
  topic: Topic;
  currentMemberId: string;
  isAdmin: boolean;
  canWrite: boolean;
  myAnswer: Answer | null;
  meetsAt: string;
}) {
  const { openEditorKey, tryOpen, close } = useEditorLock();
  const answerEditorKey = `answer:${topic.id}`;
  const isEditingMine = openEditorKey === answerEditorKey;
  const replyGateOpen = isPostMeetingOpen(meetsAt);

  const answersWithContent = topic.answers.filter((a) => a.quote_text?.trim());
  const ordered = [
    ...(myAnswer ? [myAnswer] : []),
    ...answersWithContent.filter((a) => a.id !== myAnswer?.id),
  ];

  return (
    <div className="flex flex-col gap-8">
      {!myAnswer && canWrite && !isEditingMine && (
        <button
          type="button"
          onClick={() => tryOpen(answerEditorKey)}
          className="self-start rounded border border-gray-900 px-3 py-1 text-sm"
        >
          내 구절 추가하기
        </button>
      )}

      {!myAnswer && isEditingMine && (
        <DifficultEditor
          topicId={topic.id}
          initialText=""
          initialReason=""
          onDone={() => close(answerEditorKey)}
          onCancel={() => close(answerEditorKey)}
        />
      )}

      {ordered.map((answer) => {
        const isMe = answer.member_id === currentMemberId;
        const isEditingThis = isMe && isEditingMine;

        return (
          <div key={answer.id} className="border-b border-gray-100 pb-6 last:border-none">
            <p className="mb-1 text-xs font-semibold text-gray-500">
              {answer.member?.name}{isMe ? " (나)" : ""}
            </p>

            {isEditingThis ? (
              <DifficultEditor
                topicId={topic.id}
                initialText={answer.quote_text ?? ""}
                initialReason={answer.quote_reason ?? ""}
                onDone={() => close(answerEditorKey)}
                onCancel={() => close(answerEditorKey)}
              />
            ) : (
              <>
                <AnswerContent kind="excerpt" answer={answer} />
                {isMe && canWrite && (
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => tryOpen(answerEditorKey)}
                      className="text-sm text-gray-700 hover:underline"
                    >
                      수정
                    </button>
                    <DeleteButton
                      confirmLabel={
                        answer.replies.length > 0
                          ? `댓글 ${answer.replies.length}개도 함께 삭제됩니다 · 정말 삭제`
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
                          ? `댓글 ${answer.replies.length}개도 함께 삭제됩니다 · 정말 삭제`
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
              label="같이 생각해 보니"
              gate={{ open: replyGateOpen, closedMessage: "모임 당일부터 남길 수 있습니다" }}
            />
          </div>
        );
      })}
    </div>
  );
}

function DifficultEditor({
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
      <label className="text-xs text-gray-500">구절</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="w-full max-w-[68ch] rounded border border-gray-300 p-2 font-serif text-[16px] leading-[1.7]"
      />
      <label className="text-xs text-gray-500">저는 이리 생각했는데…</label>
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
