"use client";

import { useState, useTransition } from "react";
import { DeleteButton } from "@/components/DeleteButton";
import { ReplyThread } from "@/components/ReplyThread";
import { useEditorLock } from "./EditorLockContext";
import { upsertAppendixAction, deleteAnswerAction } from "./actions";
import type { Topic } from "./types";

const NEW = "new";

// 제한 없음, 1인 다건 — 미작성자 카드 없음. "부록 논제 올리기"는 항상
// 노출되고, 본인 글만 수정/삭제할 수 있다(소유권은 서버에서도 확인).
// 같은 topic 안에서는 편집기 하나만(신규 작성 또는 기존 글 수정 중 하나) 열리도록
// 공용 EditorLockContext 키(answer:{topicId})를 공유하고, 어느 글을 편집 중인지는
// 로컬 상태(editingTarget)로 구분한다.
export function AppendixView({
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

  const answers = [...topic.answers].sort((a, b) => {
    if (a.member_id === b.member_id) return a.slot - b.slot;
    return (a.submitted_at ?? "").localeCompare(b.submitted_at ?? "");
  });

  function openNew() {
    if (!tryOpen(editorKey)) return;
    setEditingTarget(NEW);
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
    <div className="flex flex-col gap-6">
      {canWrite && (
        <button
          type="button"
          onClick={openNew}
          className="self-start rounded border border-gray-900 px-3 py-1 text-sm"
        >
          부록 논제 올리기
        </button>
      )}

      {isEditorOpen && editingTarget === NEW && (
        <AppendixEditor
          topicId={topic.id}
          answerId={null}
          initialTitle=""
          initialBody=""
          onDone={closeEditor}
          onCancel={closeEditor}
        />
      )}

      {answers.map((answer) => {
        const isMe = answer.member_id === currentMemberId;
        const isEditingThis = isEditorOpen && editingTarget === answer.id;

        return (
          <div key={answer.id} className="border-b border-gray-100 pb-6 last:border-none">
            <p className="mb-1 text-xs font-semibold text-gray-500">
              {answer.member?.name}
              {isMe ? " (나)" : ""}
            </p>

            {isEditingThis ? (
              <AppendixEditor
                topicId={topic.id}
                answerId={answer.id}
                initialTitle={answer.title ?? ""}
                initialBody={answer.body ?? ""}
                onDone={closeEditor}
                onCancel={closeEditor}
              />
            ) : (
              <>
                {answer.title && <p className="font-semibold">{answer.title}</p>}
                <p className="mt-1 max-w-[68ch] whitespace-pre-wrap text-[16px] leading-[1.7]">
                  {answer.body}
                </p>
                {isMe && canWrite && (
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
                          ? `의견 ${answer.replies.length}개도 함께 삭제됩니다 · 정말 삭제`
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
                          ? `의견 ${answer.replies.length}개도 함께 삭제됩니다 · 정말 삭제`
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
              label="의견 남기기"
            />
          </div>
        );
      })}

      {answers.length === 0 && !(isEditorOpen && editingTarget === NEW) && (
        <p className="text-sm text-gray-400">아직 아무도 글을 올리지 않았습니다</p>
      )}
    </div>
  );
}

function AppendixEditor({
  topicId,
  answerId,
  initialTitle,
  initialBody,
  onDone,
  onCancel,
}: {
  topicId: string;
  answerId: string | null;
  initialTitle: string;
  initialBody: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-gray-500">제목(선택)</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full max-w-[68ch] rounded border border-gray-300 p-2 text-[16px]"
      />
      <label className="text-xs text-gray-500">본문</label>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
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
              if (!body.trim()) {
                setError("내용을 입력해 주세요.");
                return;
              }
              const result = await upsertAppendixAction(topicId, answerId, {
                title: title.trim() || undefined,
                body,
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
