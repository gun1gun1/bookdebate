import type { ReactNode } from "react";

// 별 5개를 0.5 단위 반점까지 표시하는 순수 표시용 컴포넌트.
// 각 별을 회색 바탕 별 + 그 위에 폭을 0/50/100%로 자른 금색 별 두 겹으로
// 그린다(반점은 50% 폭). StarRating(조작 가능)이 renderOverlay로 별 하나당
// 좌/우 클릭 영역 버튼을 얹어 재사용하고, RatingSummary(읽기 전용)는
// overlay 없이 그대로 쓴다.
export function StarDisplay({
  value,
  size = "lg",
  renderOverlay,
}: {
  value: number;
  size?: "sm" | "lg";
  renderOverlay?: (starNumber: number) => ReactNode;
}) {
  const dim = size === "lg" ? "h-7 w-7 text-2xl leading-7" : "h-4 w-4 text-sm leading-4";

  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((n) => {
        const fraction = Math.max(0, Math.min(1, value - (n - 1)));
        return (
          <span key={n} className={`relative inline-block ${dim}`}>
            <span aria-hidden className="pointer-events-none absolute inset-0 text-gray-300">
              ★
            </span>
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden text-yellow-500"
              style={{ width: `${fraction * 100}%` }}
            >
              ★
            </span>
            {renderOverlay?.(n)}
          </span>
        );
      })}
    </span>
  );
}
