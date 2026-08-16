import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";

// docs/SECURITY.md: 1차 방어선. 세션 쿠키 서명만 확인하고(DB 조회 없음, Edge에서
// 실행) /admin은 JWT의 role 클레임으로 1차 차단한다. 진짜 권한 판단(계정 활성
// 여부, 최신 role)은 각 Server Action의 requireSession()/requireAdmin()이
// DB를 다시 조회해서 한다(2차 방어).
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
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!login|api/auth|api/keep-alive|_next/static|_next/image|favicon.ico).*)",
  ],
};
