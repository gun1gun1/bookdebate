// 별점 집계 표시 — 원래 구글 문서에서는 각자 ☆를 채워 넣고 서로의 별점을
// 그대로 봤다(누가 몇 점을 줬는지가 토론 시작 전 분위기를 읽는 재료였다).
// 지금까지는 본인 몫의 StarRating 위젯만 있고 이 집계가 없어서 "다른 사람
// 참여가 안 보인다"는 문제로 이어졌다 — 저장 로직은 원래도 회원별 독립
// 행(ratings.session_id+member_id UNIQUE)이라 정상이었고, 이 컴포넌트가
// 그 값을 보여주기만 하면 된다(새 쿼리/마이그레이션 불필요).
type Member = { id: string; name: string };
type Rating = { member_id: string; stars: number };

export function RatingSummary({
  members,
  ratings,
  currentMemberId,
}: {
  members: Member[];
  ratings: Rating[];
  currentMemberId: string;
}) {
  if (ratings.length === 0) {
    return <p className="mt-3 text-sm text-gray-400">아직 별점이 없습니다</p>;
  }

  const average = ratings.reduce((sum, r) => sum + r.stars, 0) / ratings.length;

  return (
    <div className="mt-3 flex flex-col gap-2">
      <p className="text-sm text-gray-600">
        평균 {average.toFixed(1)}점 · {members.length}명 중 {ratings.length}명 참여
      </p>
      <ul className="flex flex-col gap-1">
        {members.map((m) => {
          const rating = ratings.find((r) => r.member_id === m.id) ?? null;
          const isMe = m.id === currentMemberId;

          return (
            <li
              key={m.id}
              className={`flex items-center gap-2 text-sm ${isMe ? "font-semibold text-gray-900" : "text-gray-700"}`}
            >
              <span className="w-16 shrink-0 truncate">
                {m.name}
                {isMe ? " (나)" : ""}
              </span>
              {rating ? (
                <span aria-label={`별점 ${rating.stars}`}>
                  <span className="text-yellow-500">{"★".repeat(rating.stars)}</span>
                  <span className="text-gray-300">{"★".repeat(5 - rating.stars)}</span>
                </span>
              ) : (
                <span className="text-gray-400">아직 매기지 않음</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
