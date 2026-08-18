"use client";

import { useState, useTransition } from "react";
import { DeleteButton } from "@/components/DeleteButton";
import { ReplyThread } from "@/components/ReplyThread";
import { useEditorLock } from "./EditorLockContext";
import { upsertAnswerAction, upsertChoiceAction, deleteAnswerAction } from "./actions";
import type { Topic } from "./types";

const BAR_COLORS = ["bg-gray-900", "bg-gray-500", "bg-gray-300", "bg-gray-200"];

// 선택 참여 — 입장(choice)은 버튼 클릭 즉시 저장(StarRating과 같은 패턴),
// 근거(body)는 선택 입력. 아무도 입장을 밝히지 않으면 집계/진영 열 없이
// 버튼만 보인다. 미작성자 회색 카드는 만들지 않는다(REFACTOR_PLAN.md 7절).
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
  const editorKey = `answer:${topic.id}`;
  const isEditingMine = openEditorKey === editorKey;

  const myAnswer = topic.answers.find((a) => a.member_id === currentMemberId) ?? null;
  const [myChoice, setMyChoice] = useState<string | null>(myAnswer?.choice ?? null);
  const [choicePending, startChoiceTransition] = useTransition();

  const options = topic.choice_options;
  const decided = topic.answers.filter((a) => a.choice);
  const hasAnyChoice = decided.length > 0;

  function pick(option: string) {
    setMyChoice(option);
    startChoiceTransition(() => {
      void upsertChoiceAction(topic.id, option);
    });
  }

  const countFor = (option: string) => decided.filter((a) => a.choice === option).length;
  const namesFor = (option: string) =>
    decided
      .filter((a) => a.choice === option)
      .map((a) => a.member?.name ?? "")
      .filter(Boolean);
  const answersFor = (option: string) => decided.filter((a) => a.choice === option);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            disabled={!canWrite || choicePending}
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

      {myChoice && canWrite && (
        <div>
          {isEditingMine ? (
            <ReasonEditor
              topicId={topic.id}
              initialText={myAnswer?.body ?? ""}
              onDone={() => close(editorKey)}
              onCancel={() => close(editorKey)}
            />
          ) : (
            <button
              type="button"
              onClick={() => tryOpen(editorKey)}
              className="text-sm text-gray-700 hover:underline"
            >
              {myAnswer?.body?.trim() ? "근거 수정" : "근거 남기기"}
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

          <div className={`mt-2 grid gap-4 ${options.length <= 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
            {options.map((opt) => (
              <div key={opt} className="flex flex-col gap-3">
                <p className="text-xs font-semibold text-gray-500">
                  {opt} ({countFor(opt)}명)
                </p>
                {answersFor(opt).map((answer) => {
                  const isMe = answer.member_id === currentMemberId;
                  return (
                    <div key={answer.id} className="rounded border border-gray-200 p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-500">
                          {answer.member?.name}
                          {isMe ? " (나)" : ""}
                        </p>
                        {!isMe && isAdmin && canWrite && (
                          <DeleteButton
                            action={async () => {
                              const result = await deleteAnswerAction(answer.id);
                              return result.ok ? { ok: true } : { ok: false, error: result.error };
                            }}
                          />
                        )}
                      </div>
                      {answer.body?.trim() ? (
                        <p className="whitespace-pre-wrap text-sm text-gray-700">{answer.body}</p>
                      ) : (
                        <p className="text-sm text-gray-400">근거를 남기지 않았습니다</p>
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
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ReasonEditor({
  topicId,
  initialText,
  onDone,
  onCancel,
}: {
  topicId: string;
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
        placeholder="근거를 남겨 주세요(선택)"
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
              const result = await upsertAnswerAction(topicId, { body: text });
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
