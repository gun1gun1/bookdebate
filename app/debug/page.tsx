// 임시 디버그 페이지. 화면/디자인이 없는 Phase 1~3 동안 데이터 구조를 눈으로
// 확인하기 위한 용도다. Phase 4에서 참여자 화면이 완성되면 이 라우트는 삭제한다.
//
// 원래 계획(독서토론앱.md)은 app/_debug 였지만, Next.js App Router는
// 언더스코어로 시작하는 폴더를 라우팅에서 제외하는 규칙이 있어 실제로는
// /_debug 경로가 생기지 않는다(node_modules/next/dist/docs 확인). 그래서
// app/debug, 경로 /debug 로 옮겼다 — docs/DECISIONS.md 참고.

import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DebugPage() {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("sessions")
    .select(
      `
      id, meets_at, deadline_at, status,
      book:books ( title, author ),
      topics (
        id, order_no, kind, title, has_rating,
        answers (
          id, member_id, body, excerpt_text, excerpt_reason,
          member:members ( name ),
          replies (
            id, body, member_id,
            member:members ( name )
          )
        )
      )
    `
    )
    .order("meets_at", { ascending: true });

  if (error) {
    return (
      <pre style={{ color: "red", padding: 16 }}>
        {JSON.stringify(error, null, 2)}
      </pre>
    );
  }

  return (
    <pre style={{ padding: 16, whiteSpace: "pre-wrap" }}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
