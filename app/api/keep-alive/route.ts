import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Supabase 무료 플랜은 7일 무활동 시 프로젝트를 일시정지한다. 이 앱은 월 1회만
// 쓰이므로 매일 도는 이 cron이 없으면 매달 꺼져 있다(docs/RETENTION.md,
// CLAUDE.md "배포 제약" 참고). Vercel Cron이 Authorization 헤더로 인증한다.

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("members").select("id").limit(1);

  if (error) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
