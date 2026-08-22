"use client";

import { useState, useTransition, type KeyboardEvent } from "react";
import { StarDisplay } from "./StarDisplay";

// 별 하나를 좌/우 절반으로 나눠 왼쪽 클릭 = 0.5, 오른쪽 클릭 = 1.0으로 즉시
// 저장한다(다른 액션들과 마찬가지로 별도 저장 버튼 없이 클릭 즉시 반영).
// 좌우 화살표 키로도 0.5 단위 조작이 가능하도록 각 반쪽 버튼에 동일한
// keydown 핸들러를 둔다 — 포커스가 어느 반쪽에 있든 상대적으로 값을 올리고
// 내리기만 하면 되므로 어느 별에서 눌렸는지는 상관없다.
export function StarRating({
  sessionId,
  initialStars,
  action,
}: {
  sessionId: string;
  initialStars: number | null;
  action: (sessionId: string, stars: number) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [stars, setStars] = useState(initialStars ?? 0);
  const [hovered, setHovered] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const displayed = hovered ?? stars;

  function commit(value: number) {
    const clamped = Math.max(0.5, Math.min(5, value));
    setStars(clamped);
    startTransition(() => {
      void action(sessionId, clamped);
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      commit((stars || 0) + 0.5);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      commit((stars || 0) - 0.5);
    }
  }

  return (
    <div role="group" aria-label="별점" className="inline-flex">
      <StarDisplay
        value={displayed}
        size="lg"
        renderOverlay={(n) => (
          <>
            <button
              type="button"
              disabled={isPending}
              aria-label={`별점 ${n - 0.5}`}
              onMouseEnter={() => setHovered(n - 0.5)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(n - 0.5)}
              onBlur={() => setHovered(null)}
              onKeyDown={handleKeyDown}
              onClick={() => commit(n - 0.5)}
              className="absolute inset-y-0 left-0 w-1/2 cursor-pointer"
            />
            <button
              type="button"
              disabled={isPending}
              aria-label={`별점 ${n}`}
              onMouseEnter={() => setHovered(n)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(n)}
              onBlur={() => setHovered(null)}
              onKeyDown={handleKeyDown}
              onClick={() => commit(n)}
              className="absolute inset-y-0 right-0 w-1/2 cursor-pointer"
            />
          </>
        )}
      />
    </div>
  );
}
