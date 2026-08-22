"use client";

import { useState, useTransition } from "react";
import { DeleteButton } from "@/components/DeleteButton";
import { useEditorLock } from "./EditorLockContext";
import {
  upsertChoiceTopicAction,
  upsertChoiceReplyAction,
  upsertChoiceStanceAction,
  deleteAnswerAction,
  deleteReplyAction,
} from "./actions";
import type { Answer, Topic } from "./types";

const BAR_COLORS = ["bg-gray-900", "bg-gray-500", "bg-gray-300", "bg-gray-200"];

// 선택 참여, 2단 구조(R1-e) — topics.body의 지시문에 따라 누구든 먼저 올리는
// 사람이 이 논제의 유일한 게시물(구체적인 논제/장면)을 올린다. 참여자 전원
// (작성자 포함)이 그 게시물에 찬반(topics.choice_options)으로 반응한다 —
// 입장(choice)과 이유(선택 입력)를 같은 reply 한 행에 담는다(docs/DECISIONS.md
// "R1-e: choice 논제 2단 구조 전환" 참고).
// R1-f(사전 작성 허용)부터는 게시물이 없어도 각자 입장을 먼저 적을 수
// 있다 — answers.body가 비어 있는 "앵커" 행이 topic.answers[0]로 잡히면
// ChoicePostView가 "아직 논제가 없습니다" 안내와 함께 찬반 UI를 그대로
// 보여준다(자세한 근거는 actions.ts의 upsertChoiceTopicAction 주석 참고).
// 정말로 아무도(게시물도, 사전 입장도) 손대지 않은 상태(answers 행 자체가
// 없음)일 때만 ChoiceComposeView를 보여준다.
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
  // choice는 topic당 answer가 최대 1개여야 하는 게 이 논제의 전제다(서버 액션이
  // 두 번째 게시물/앵커를 만들지 않는다) — 그래도 배열이면 첫 번째 행을 그
  // 하나로 다룬다.
  const answer = topic.answers[0] ?? null;

  if (!answer) {
    return <ChoiceComposeView topic={topic} canWrite={canWrite} />;
  }

  return (
    <ChoicePostView
      topic={topic}
      answer={answer}
      currentMemberId={currentMemberId}
      isAdmin={isAdmin}
      canWrite={canWrite}
    />
  );
}

// 상태 1 — 이 topic에 answers 행이 아예 없다(게시물도, 사전 입장도 아무도
// 안 한 상태). 게시물 작성 폼과 "미리 내 입장 적기" 찬반 UI를 함께 보여준다
// — 둘 중 무엇을 먼저 하든(글 먼저 쓰거나, 입장부터 밝히거나) 다음
// 렌더부터는 topic.answers[0]가 생겨 ChoicePostView가 이어받는다.
function ChoiceComposeView({ topic, canWrite }: { topic: Topic; canWrite: boolean }) {
  const { openEditorKey, tryOpen, close } = useEditorLock();
  const postEditorKey = `answer:${topic.id}`;
  const stanceEditorKey = `stance:${topic.id}`;
  const isEditingPost = openEditorKey === postEditorKey;
  const isEditingStance = openEditorKey === stanceEditorKey;

  const [text, setText] = useState("");
  const [postError, setPostError] = useState<string | null>(null);
  const [isPostPending, startPostTransition] = useTransition();

  const [myChoice, setMyChoice] = useState<string | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [stanceError, setStanceError] = useState<string | null>(null);
  const [isStancePending, startStanceTransition] = useTransition();

  if (!canWrite) {
    return <p className="text-sm text-gray-400">아직 아무도 논제를 올리지 않았습니다</p>;
  }

  function pick(option: string) {
    setMyChoice(option);
    setStanceError(null);
    startStanceTransition(async () => {
      const result = await upsertChoiceStanceAction(topic.id, option, reasonText);
      if (!result.ok) setStanceError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {isEditingPost ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="책 속에서 찬반이 갈릴 만한 구체적인 결정이나 장면을 소개해 주세요"
            className="w-full max-w-[68ch] rounded border border-gray-300 p-2 text-[16px] leading-[1.7]"
          />
          {postError && <p className="text-sm text-red-600">{postError}</p>}
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isPostPending || !text.trim()}
              onClick={() =>
                startPostTransition(async () => {
                  setPostError(null);
                  const result = await upsertChoiceTopicAction(topic.id, null, text);
                  if (!result.ok) {
                    setPostError(result.error);
                    return;
                  }
                  close(postEditorKey);
                })
              }
              className="rounded bg-gray-900 px-3 py-1 text-sm text-white disabled:opacity-50"
            >
              저장
            </button>
            <button
              type="button"
              onClick={() => {
                setText("");
                close(postEditorKey);
              }}
              className="text-sm text-gray-500 hover:underline"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => tryOpen(postEditorKey)}
          className="self-start rounded border border-gray-900 px-3 py-1 text-sm"
        >
          논제 올리기
        </button>
      )}

      <div className="border-t border-gray-100 pt-4">
        <p className="mb-2 text-sm text-gray-600">게시물이 없어도 내 입장을 먼저 적을 수 있습니다</p>
        <div className="flex flex-wrap gap-2">
          {topic.choice_options.map((opt) => (
            <button
              key={opt}
              type="button"
              disabled={isStancePending}
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

        {myChoice &&
          (isEditingStance ? (
            <div className="mt-2 flex flex-col gap-2">
              <textarea
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                rows={3}
                placeholder="이유를 남겨 주세요(선택)"
                className="w-full max-w-[68ch] rounded border border-gray-300 p-2 text-[16px] leading-[1.7]"
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={isStancePending}
                  onClick={() =>
                    startStanceTransition(async () => {
                      setStanceError(null);
                      const result = await upsertChoiceStanceAction(topic.id, myChoice, reasonText);
                      if (!result.ok) {
                        setStanceError(result.error);
                        return;
                      }
                      close(stanceEditorKey);
                    })
                  }
                  className="rounded bg-gray-900 px-3 py-1 text-sm text-white disabled:opacity-50"
                >
                  저장
                </button>
                <button
                  type="button"
                  onClick={() => close(stanceEditorKey)}
                  className="text-sm text-gray-500 hover:underline"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => tryOpen(stanceEditorKey)}
              className="mt-2 text-sm text-gray-700 hover:underline"
            >
              {reasonText.trim() ? "이유 수정" : "이유 남기기"}
            </button>
          ))}
        {stanceError && <p className="mt-2 text-sm text-red-600">{stanceError}</p>}
      </div>
    </div>
  );
}

// 상태 2 — 게시물이 하나 있다. 상단에 게시물(원 작성자만 수정), 그 아래
// 찬반 버튼 + 집계 막대, 맨 아래 진영별 이유 카드.
function ChoicePostView({
  topic,
  answer,
  currentMemberId,
  isAdmin,
  canWrite,
}: {
  topic: Topic;
  answer: Answer;
  currentMemberId: string;
  isAdmin: boolean;
  canWrite: boolean;
}) {
  const { openEditorKey, tryOpen, close } = useEditorLock();
  const postEditorKey = `answer:${topic.id}`;
  const reasonEditorKey = `reply:${answer.id}`;
  const isEditingPost = openEditorKey === postEditorKey;
  const isEditingReason = openEditorKey === reasonEditorKey;
  const isAuthor = answer.member_id === currentMemberId;
  // R1-f(사전 작성 허용) — body가 비어 있으면 아직 아무도 실제 게시물(장면
  // 소개)을 쓰지 않은 상태다(사전 입장만 있는 앵커일 수 있음). 이때는 누구든
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
            onDone={() => close(postEditorKey)}
            onCancel={() => close(postEditorKey)}
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
                  onClick={() => tryOpen(postEditorKey)}
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
            <p className="text-sm text-gray-400">아직 논제 게시물이 없습니다</p>
            {canWrite && (
              <button
                type="button"
                onClick={() => tryOpen(postEditorKey)}
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
  answerId: string;
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
