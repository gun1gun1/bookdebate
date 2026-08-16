"use client";

import { useState, useTransition } from "react";

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

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={isPending}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(null)}
          onClick={() => {
            setStars(n);
            startTransition(() => {
              void action(sessionId, n);
            });
          }}
          className={`text-2xl leading-none ${n <= displayed ? "text-yellow-500" : "text-gray-300"}`}
          aria-label={`별점 ${n}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
