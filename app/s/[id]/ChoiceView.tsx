"use client";

import { useState, useTransition } from "react";
import { DeleteButton } from "@/components/DeleteButton";
import { useEditorLock } from "./EditorLockContext";
import {
  upsertChoiceTopicAction,
  upsertChoiceReplyAction,
  deleteAnswerAction,
  deleteReplyAction,
} from "./actions";
import type { Answer, Topic } from "./types";

const BAR_COLORS = ["bg-gray-900", "bg-gray-500", "bg-gray-300", "bg-gray-200"];
const NEW = "new";

// 선택 참여, 2단 구조(R1-e) + 다건 허용(2026-11) — topics.body의 지시문에 따라
// 참여자 누구나 구체적인 논제/장면을 게시물(answers 행)로 올리고, 여러
// 사람이 각자(한 사람이 여러 개도 가능) 올릴 수 있다. 참여자 전원(작성자
// 포함)이 게시물마다 따로 찬반(topics.choice_options)으로 반응한다 — 입장과
// 이유(선택 입력)를 그 게시물에 대한 reply 한 행에 담는다(docs/DECISIONS.md
// "R1-e"/"choice 논제 다건 허용" 절 참고).
// R1-f 시절의 body=null "앵커" 행(게시물 없이 먼저 남긴 입장)은 더 이상 새로
// 만들지 않지만, 남아 있으면 "아직 논제 게시물이 없습니다" 카드로 보여주고
// 누구든 채울 수 있게 한다.
// 게시물 편집기(신규/수정)는 topic 단위 EditorLockContext 키(answer:{topicId})
// 하나를 공유하고, 어느 게시물을 편집 중인지는 로컬 상태(editingTarget)로
// 구분한다(AppendixView와 같은 패턴).
export function ChoiceView({
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
  const postEditorKey = `answer:${topic.id}`;
  const isPostEditorOpen = openEditorKey === postEditorKey;
  const [editingTarget, setEditingTarget] = useState<string | null>(null);

  // 게시물은 올린 순서대로, 본문이 빈 옛 앵커는 맨 뒤로.
  const answers = [...topic.answers].sort((a, b) => {
    const aPosted = Boolean(a.body?.trim());
    const bPosted = Boolean(b.body?.trim());
    if (aPosted !== bPosted) return aPosted ? -1 : 1;
    return (a.submitted_at ?? "").localeCompare(b.submitted_at ?? "") || a.slot - b.slot;
  });

  function openPostEditor(target: string) {
    if (!tryOpen(postEditorKey)) return;
    setEditingTarget(target);
  }

  function closePostEditor() {
    close(postEditorKey);
    setEditingTarget(null);
  }

  return (
    <div className="flex flex-col gap-8">
      {answers.length === 0 && !canWrite && (
        <p className="text-sm text-gray-400">아직 아무도 논제를 올리지 않았습니다</p>
      )}

      {answers.map((answer) => (
        <ChoicePostCard
          key={answer.id}
          topic={topic}
          answer={answer}
          currentMemberId={currentMemberId}
          isAdmin={isAdmin}
          canWrite={canWrite}
          isEditingPost={isPostEditorOpen && editingTarget === answer.id}
          onEditPost={() => openPostEditor(answer.id)}
          onClosePostEditor={closePostEditor}
        />
      ))}

      {canWrite &&
        (isPostEditorOpen && editingTarget === NEW ? (
          <ChoicePostEditor
            topicId={topic.id}
            answerId={null}
            initialText=""
            onDone={closePostEditor}
            onCancel={closePostEditor}
          />
        ) : (
          <button
            type="button"
            onClick={() => openPostEditor(NEW)}
            className="self-start rounded border border-gray-900 px-3 py-1 text-sm"
          >
            {answers.length > 0 ? "찬반 논제 하나 더 올리기" : "찬반 논제 올리기"}
          </button>
        ))}
    </div>
  );
}

// 게시물 하나 — 상단에 게시물(원 작성자만 수정), 그 아래 찬반 버튼 + 집계
// 막대, 맨 아래 진영별 이유 카드.
function ChoicePostCard({
  topic,
  answer,
  currentMemberId,
  isAdmin,
  canWrite,
  isEditingPost,
  onEditPost,
  onClosePostEditor,
}: {
  topic: Topic;
  answer: Answer;
  currentMemberId: string;
  isAdmin: boolean;
  canWrite: boolean;
  isEditingPost: boolean;
  onEditPost: () => void;
  onClosePostEditor: () => void;
}) {
  const { openEditorKey, tryOpen, close } = useEditorLock();
  const reasonEditorKey = `reply:${answer.id}`;
  const isEditingReason = openEditorKey === reasonEditorKey;
  const isAuthor = answer.member_id === currentMemberId;
  // body가 비어 있으면 R1-f 시절의 앵커(사전 입장만 있는 행)다 — 누구든
  // canWrite면 처음 채워 넣을 수 있다(actions.ts의 upsertChoiceTopicAction
  // 주석 참고) — isAuthor 하나로만 "수정" 버튼을 판단하지 않는 이유.
  const posted = Boolean(answer.body?.trim());

  const options = topic.choice_options;
  const gridColsClass =
    options.length <= 1
      ? ""
      : options.length === 2
        ? "md:grid-cols-2"
        : options.length === 3
          ? "md:grid-cols-3"
          : "md:grid-cols-4";
  const myReply = answer.replies.find((r) => r.member_id === currentMemberId) ?? null;
  const [myChoice, setMyChoice] = useState<string | null>(myReply?.choice ?? null);
  const [choicePending, startChoiceTransition] = useTransition();

  const decided = answer.replies.filter((r) => r.choice);
  const hasAnyChoice = decided.length > 0;
  const countFor = (opt: string) => decided.filter((r) => r.choice === opt).length;
  const namesFor = (opt: string) =>
    decided
      .filter((r) => r.choice === opt)
      .map((r) => r.member?.name ?? "")
      .filter(Boolean);
  const reasonsFor = (opt: string) => decided.filter((r) => r.choice === opt && r.body.trim());

  function pick(option: string) {
    setMyChoice(option);
    startChoiceTransition(() => {
      void upsertChoiceReplyAction(answer.id, option, myReply?.body ?? "");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="border-l-2 border-gray-300 pl-4">
        {isEditingPost ? (
          <ChoicePostEditor
            topicId={topic.id}
            answerId={answer.id}
            initialText={answer.body ?? ""}
            onDone={onClosePostEditor}
            onCancel={onClosePostEditor}
          />
        ) : posted ? (
          <>
            <p className="mb-1 text-xs font-semibold text-gray-500">
              {answer.member?.name}
              {isAuthor ? " (나)" : ""}
            </p>
            <p className="whitespace-pre-wrap text-[16px] leading-[1.7]">{answer.body}</p>
            <div className="mt-2 flex items-center gap-3">
              {isAuthor && canWrite && (
                <button
                  type="button"
                  onClick={onEditPost}
                  className="text-sm text-gray-700 hover:underline"
                >
                  수정
                </button>
              )}
              {(isAuthor || isAdmin) && canWrite && (
                <DeleteButton
                  confirmLabel={
                    answer.replies.length > 0
                      ? `찬반 반응 ${answer.replies.length}개도 함께 삭제됩니다 · 정말 삭제`
                      : "정말 삭제"
                  }
                  action={async () => {
                    const result = await deleteAnswerAction(answer.id);
                    return result.ok ? { ok: true } : { ok: false, error: result.error };
                  }}
                />
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-400">아직 논제 게시물이 없습니다(먼저 남긴 입장만 있음)</p>
            {canWrite && (
              <button
                type="button"
                onClick={onEditPost}
                className="mt-2 rounded border border-gray-900 px-3 py-1 text-sm"
              >
                논제 올리기
              </button>
            )}
          </>
        )}
      </div>

      {canWrite && (
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              disabled={choicePending}
              onClick={() => pick(opt)}
              className={`rounded border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                myChoice === opt
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-300 hover:border-gray-500"
              }`}
            >
              나는 {opt}
            </button>
          ))}
        </div>
      )}

      {myChoice && canWrite && (
        <div>
          {isEditingReason ? (
            <ChoiceReasonEditor
              answerId={answer.id}
              choice={myChoice}
              initialText={myReply?.body ?? ""}
              onDone={() => close(reasonEditorKey)}
              onCancel={() => close(reasonEditorKey)}
            />
          ) : (
            <button
              type="button"
              onClick={() => tryOpen(reasonEditorKey)}
              className="text-sm text-gray-700 hover:underline"
            >
              {myReply?.body?.trim() ? "이유 수정" : "이유 남기기"}
            </button>
          )}
        </div>
      )}

      {!hasAnyChoice ? (
        <p className="text-sm text-gray-400">아직 아무도 입장을 밝히지 않았습니다</p>
      ) : (
        <>
          <div className="flex h-3 overflow-hidden rounded-full bg-gray-100">
            {options.map((opt, i) => {
              const pct = (countFor(opt) / decided.length) * 100;
              if (pct === 0) return null;
              return (
                <div
                  key={opt}
                  style={{ width: `${pct}%` }}
                  className={BAR_COLORS[i % BAR_COLORS.length]}
                  title={`${opt} ${countFor(opt)}명`}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
            {options.map((opt) => (
              <span key={opt}>
                {opt} {countFor(opt)}명
                {namesFor(opt).length > 0 ? ` · ${namesFor(opt).join(", ")}` : ""}
              </span>
            ))}
          </div>

          <div className={`mt-2 grid gap-4 ${gridColsClass}`}>
            {options.map((opt) => (
              <div key={opt} className="flex flex-col gap-3">
                <p className="text-xs font-semibold text-gray-500">
                  {opt} ({countFor(opt)}명)
                </p>
                {reasonsFor(opt).map((reply) => {
                  const isMe = reply.member_id === currentMemberId;
                  return (
                    <div key={reply.id} className="rounded border border-gray-200 p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-500">
                          {reply.member?.name}
                          {isMe ? " (나)" : ""}
                        </p>
                        {(isMe || isAdmin) && canWrite && (
                          <DeleteButton action={async () => deleteReplyAction(reply.id)} />
                        )}
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-gray-700">{reply.body}</p>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ChoicePostEditor({
  topicId,
  answerId,
  initialText,
  onDone,
  onCancel,
}: {
  topicId: string;
  answerId: string | null;
  initialText: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="책 속에서 찬반이 갈릴 만한 구체적인 결정이나 장면을 소개해 주세요"
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
              const result = await upsertChoiceTopicAction(topicId, answerId, text);
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

function ChoiceReasonEditor({
  answerId,
  choice,
  initialText,
  onDone,
  onCancel,
}: {
  answerId: string;
  choice: string;
  initialText: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="이유를 남겨 주세요(선택)"
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
              const result = await upsertChoiceReplyAction(answerId, choice, text);
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
