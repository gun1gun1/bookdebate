import Link from "next/link";
import { requireSession } from "@/lib/auth";

// requireAdmin()과 proxy.ts가 관리자 권한 없이 /admin/*에 접근했을 때
// 여기로 보낸다(둘 다 "/"로 안내 없이 리다이렉트하던 것을 바꾼 것 —
// docs/DECISIONS.md 참고). /admin 하위가 아니라 최상위 경로에 둬서,
// AdminLayout의 requireAdmin() 호출에 다시 걸려 리다이렉트 루프가
// 생기지 않게 한다.
export default async function ForbiddenPage() {
  await requireSession();

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <p className="text-base font-semibold">이 화면은 관리자만 볼 수 있습니다</p>
        <p className="mt-2 text-sm text-gray-500">
          권한이 필요한 화면에 접근하려고 했습니다.
        </p>
        <Link href="/" className="mt-6 inline-block text-sm text-gray-900 underline">
          홈으로 돌아가기
        </Link>
      </div>
    </main>
  );
}
