// 책 표지. cover_url 은 관리자가 자유롭게 입력하는 외부 URL이라 도메인을
// 미리 알 수 없으므로 next/image 대신 <img>를 쓴다(REFACTOR_PLAN.md 5절).
export function BookCover({
  coverUrl,
  title,
  size = 96,
  className = "",
}: {
  coverUrl: string | null;
  title: string;
  size?: number;
  className?: string;
}) {
  if (coverUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={coverUrl}
        alt={`『${title}』 표지`}
        style={{ width: size }}
        className={`aspect-[2/3] shrink-0 rounded object-cover ${className}`}
      />
    );
  }

  const initial = title.trim().slice(0, 1) || "?";

  return (
    <div
      style={{ width: size, fontSize: size * 0.36 }}
      className={`flex aspect-[2/3] shrink-0 items-center justify-center rounded bg-gray-100 font-semibold text-gray-400 ${className}`}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}
