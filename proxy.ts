import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";

// docs/SECURITY.md: 1차 방어선. 세션 쿠키 서명만 확인하고(DB 조회 없음, Edge에서
// 실행) /admin은 JWT의 role 클레임으로 1차 차단한다. 진짜 권한 판단(계정 활성
// 여부, 최신 role)은 각 Server Action의 requireSession()/requireAdmin()이
// DB를 다시 조회해서 한다(2차 방어).
//
// /admin 권한 없음은 "/"가 아니라 "/forbidden"으로 보낸다 — 안내 없이
// 홈으로 튕기면 권한 없는 사용자에게는 "화면이 안 보인다"는 원인 불명의
// 혼란으로 비친다(lib/auth.ts의 requireAdmin() 주석, docs/DECISIONS.md 참고).
//
// Next.js 16부터 "middleware.ts" 파일 컨벤션은 deprecated이고 "proxy.ts" +
// export된 proxy() 함수로 이름이 바뀌었다(docs/DECISIONS.md 참고).

export async function proxy(request: NextRequest) {
  const token = request.cookies.get("session")?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (request.nextUrl.pathname.startsWith("/admin") && session.role !== "admin") {
    return NextResponse.redirect(new URL("/forbidden", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // /_next/image의 히어로 이미지 최적화는 서버가 자기 자신에게
  // /brand/*를 다시 요청하는 내부 fetch를 거친다 — 이 경로도 미들웨어에
  // 잡히면 그 fetch가 /login으로 리다이렉트되어 sharp가 HTML을 받고
  // "not a valid image" 에러를 낸다. public/ 정적 자산은 보호 대상이
  // 아니므로 icon.svg와 함께 제외한다.
  matcher: [
    "/((?!login|api/auth|api/keep-alive|_next/static|_next/image|favicon.ico|icon.svg|brand/).*)",
  ],
};
