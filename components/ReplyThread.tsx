"use client";

import { useState, useTransition } from "react";
import { DeleteButton } from "@/components/DeleteButton";
import { useEditorLock } from "@/app/s/[id]/EditorLockContext";
import { upsertReplyAction, deleteReplyAction } from "@/app/s/[id]/actions";

type ReplyItem = {
  id: string;
  member_id: string;
  body: string;
  member: { name: string } | null;
};

// TopicPanel의 옛 ReplyRow/ReplyComposer를 일반화한 공용 컴포넌트 — 5개
// View(FreeView/ExcerptView/DifficultView/ChoiceView/AppendixView) 전부가
// 이걸 쓴다. label은 kind마다 다른 원문 표현을 그대로 넘기도록 필수 prop으로
// 두고 기본값을 주지 않는다(REFACTOR_PLAN.md "R1: 논제 유형별 reply 레이블
// 정책"). gate는 difficult 전용 — 모임 당일(KST) 전에는 입력창 대신 안내문만
// 보여준다.
export function ReplyThread({
  answerId,
  replies,
  canWrite,
  currentMemberId,
  isAdmin,
  label,
  gate,
}: {
  answerId: string;
  replies: ReplyItem[];
  canWrite: boolean;
  currentMemberId: string;
  isAdmin: boolean;
  label: string;
  gate?: { open: boolean; closedMessage: string };
}) {
  const { openEditorKey, tryOpen, close } = useEditorLock();
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);

  const key = `reply:${answerId}`;
  const isThreadOpen = openEditorKey === key;
  const canCompose = canWrite && (!gate || gate.open);

  return (
    <div className="mt-3 ml-4 flex flex-col gap-2 border-l border-gray-100 pl-4">
      {replies.map((reply) => (
        <ReplyRow
          key={reply.id}
          reply={reply}
          isMine={reply.member_id === currentMemberId || isAdmin}
          canWrite={canWrite}
          isEditing={isThreadOpen && editingReplyId === reply.id}
          onEdit={() => {
            if (!tryOpen(key)) return;
            setEditingReplyId(reply.id);
          }}
          onDone={() => {
            close(key);
            setEditingReplyId(null);
          }}
        />
      ))}

      {canCompose && (
        <ReplyComposer
          answerId={answerId}
          label={label}
          isOpen={isThreadOpen && editingReplyId === null}
          onToggle={(open) => {
            if (open) {
              if (!tryOpen(key)) return;
              setEditingReplyId(null);
            } else {
              close(key);
            }
          }}
        />
      )}

      {!canCompose && canWrite && gate && !gate.open && (
        <p className="text-xs text-gray-400">{gate.closedMessage}</p>
      )}
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
  reply: ReplyItem;
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
  label,
  isOpen,
  onToggle,
}: {
  answerId: string;
  label: string;
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
        + {label}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="내용을 입력해 주세요"
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
