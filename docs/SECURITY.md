# SECURITY.md

이 문서는 이 앱의 보안 모델과, 왜 그 모델이 이런 형태가 됐는지를 설명한다. Supabase Auth를 쓰지 않기로 한 순간부터 `auth.uid()` 기반 RLS 정책을 쓸 수 없게 됐고, 그 결과 **서버 측 권한 검사가 유일한 방어선**이 됐다. 이 문서의 대부분은 그 하나의 사실에서 파생된다.

## 전제: 왜 이런 구조인가

- Supabase Auth 미사용 → `auth.uid()`, `auth.role()` 등 Supabase가 제공하는 RLS 헬퍼를 쓸 수 없다.
- 그래서 RLS 정책을 세밀하게 짜는 대신 **전 테이블 RLS 활성화 + 정책 0개(전면 거부)**를 택했다. Postgres 자체가 익명/anon 키로는 아무것도 못 읽고 못 쓰게 막는다.
- 유일하게 데이터에 닿을 수 있는 경로는 **service-role 키를 쥔 Next.js 서버**뿐이다. 즉 "DB가 막아준다"는 안전망이 없고, **애플리케이션 코드가 곧 보안 경계**다.
- 이 전제 때문에 아래 원칙들은 전부 "권장"이 아니라 "누락 시 즉시 취약점"이다.

## 원칙

1. 전 테이블 RLS 활성화, 정책 없음(전면 거부). (SCHEMA.md의 모든 테이블에 적용)
2. 브라우저에서 Supabase를 직접 호출하지 않는다. `lib/supabase/server.ts` 단일 파일, 최상단 `import 'server-only'`, `SUPABASE_SERVICE_ROLE_KEY` 사용.
3. 모든 DB 접근은 Next.js 서버(Server Component, Server Action, Route Handler)에서만 일어난다.
4. `SUPABASE_SERVICE_ROLE_KEY`에 `NEXT_PUBLIC_` 접두사를 붙이지 않는다. 클라이언트 번들에 절대 포함되어서는 안 된다.
5. 권한 검사는 서버에서 한다. 버튼을 안 보이게 하는 것은 보안이 아니다 — UI에서 숨겨도 Server Action을 직접 호출하면 뚫린다는 전제로 설계한다.

## 인증 메커니즘

- 2단계: 공통 암호(외부 차단) → 명단에서 이름 선택(신원 지정).
- 공통 암호는 `SITE_PASSWORD_HASH` 환경변수에 bcrypt 해시로만 존재. 평문은 코드/환경변수 어디에도 두지 않는다. 해시 생성은 `scripts/hash-password.ts`로 한다.
- 세션은 서명된 JWT 쿠키(`jose`). `httpOnly`, `secure`, `sameSite='lax'`, `maxAge` 90일. payload에는 `memberId`와 `role`만 담는다(그 이상 담지 않는다 — 세션이 최신 `members` 상태를 반영하지 못할 수 있으므로 민감한 판단은 매 요청 시 DB를 다시 조회해서 한다).
- 인증 함수는 `lib/auth.ts` 한 파일에만 두고, 외부에는 `getSession()`, `requireSession()`, `requireAdmin()` 세 개만 노출한다. 이 시그니처는 인증 방식이 바뀌어도(예: PIN 추가, 방식 교체) 유지되도록 설계한다 — 호출부가 인증 구현 세부사항에 의존하지 않게 하기 위함.
- `proxy.ts`(Next.js 16부터 `middleware.ts`에서 이름이 바뀐 컨벤션 — DECISIONS.md 참고)가 `/login`, `/api/auth/*`, `/api/keep-alive`, `_next/static`, `_next/image`, `favicon.ico`, `icon.svg`, `brand/`(정적 브랜드 자산)를 제외한 전 경로를 보호한다.
- 관리자 판별은 `members.role = 'admin'`. **미들웨어와 각 Server Action 양쪽에서** 검사한다 — 미들웨어만 믿지 않는다(미들웨어 matcher 설정 실수 하나로 전체가 뚫릴 수 있으므로 이중화).

## 개인 PIN (옵션, 기본 비활성)

- 환경변수 `REQUIRE_MEMBER_PIN`(기본 `false`). `true`면 이름 선택 후 4자리 PIN을 추가로 받는다(`members.pin_hash`, bcrypt).
- 현재는 `false`로 두되, 두 경로(PIN 있음/없음) 모두 실제로 동작하도록 구현한다 — "나중에 필요하면 켠다"는 이유로 미구현 상태로 방치하지 않는다.

## 무차별 대입(brute-force) 방지

- `login_attempts` 테이블에 IP·시각·성공여부 기록.
- 같은 IP에서 10분 내 5회 실패 시 10분 차단.
- 차단 메시지는 "잠시 후 다시 시도해 주세요"로만 표시 — 실패 사유, 남은 시도 횟수, 차단 해제 시각 등을 노출하지 않는다.
- 서버리스(Vercel) 환경에서 인메모리 카운터는 인스턴스마다 리셋되므로 반드시 DB(`login_attempts`) 기반으로 구현한다. 이 앱은 트래픽이 극히 적으므로 성능 우려로 인메모리로 타협할 이유가 없다.

## 권한 매트릭스

| 동작 | 비로그인 | 일반 참여자(`member`) | 관리자(`admin`) |
|---|---|---|---|
| `/login` 접근 | 가능 | 가능(이미 로그인 시 리다이렉트 권장) | 가능 |
| 그 외 모든 경로 | 불가 → `/login` 리다이렉트 | 가능 | 가능 |
| 회차/논제 조회 | 불가 | 가능(전체 회차, blind 제외) | 가능 |
| 본인 answer 작성/수정 | 불가 | 가능(`session.status='open'`일 때만) | 가능(동일 조건) |
| 타인 answer 작성/수정 | 불가 | **불가** | 불가(관리자도 대리 작성 안 함, DECISIONS.md 참고) |
| 본인 answer 삭제 | 불가 | 가능(`session.status='open'`일 때만, 하위 replies도 함께 삭제됨 — DECISIONS.md) | 가능 |
| 타인 answer 삭제 | 불가 | **불가** | 가능(관리) |
| reply 작성 | 불가 | 가능(`session.status='open'`일 때만 — R1부터 5종 kind 전부 허용. `topic.kind='difficult'`면 추가로 모임 당일 0시(Asia/Seoul) 이후여야 함. 본인 answer에 본인이 다는 것도 허용) | 가능(단, difficult의 KST 게이트는 관리자에게도 예외 없이 적용) |
| 본인 reply 수정/삭제 | 불가 | 가능 | 가능 |
| 타인 reply 수정/삭제 | 불가 | **불가** | 가능(관리) |
| 별점(`ratings`) 등록 | 불가 | 본인 것만 가능 | 본인 것만 가능 |
| `/admin/*` 전체 | 불가 | **불가** | 가능 |
| 붙여넣기 이관 실행 | 불가 | 불가 | 가능(미리보기 확인 후) |
| 회차 템플릿 관리 | 불가 | 불가 | 가능 |
| 공유 문구 생성 | 불가 | 가능 | 가능 |

"본인 것만"에 해당하는 모든 동작은 **소유권 검사를 서버에서** 한다: 요청 payload의 `answerId`/`replyId`로 레코드를 조회한 뒤 `record.member_id === session.memberId`(또는 `role === 'admin'`)를 확인하고서야 쓰기를 수행한다. 클라이언트가 보낸 `memberId`를 신뢰하지 않는다 — 항상 세션에서 가져온 값을 쓴다.

**[R1] `appendix`는 소유권 검사 방식이 다르다** — 1인이 같은 논제에 여러 글(`slot`로 구분)을 가질 수 있어 `topic_id`+`member_id`만으로는 특정 글을 고를 수 없다. `upsertAppendixAction`(`app/s/[id]/actions.ts`)은 수정 대상을 반드시 `answerId`로 지정받고, `id`로 조회한 뒤 `record.member_id === session.memberId`를 확인하는 것에 더해 실제 `update` 쿼리에도 `.eq("id", answerId).eq("member_id", session.memberId)` 이중 조건을 건다 — 조회 시점과 쓰기 시점 사이의 경쟁 상태(race condition)에서도 소유권 검사가 무력화되지 않도록 방어선을 이중으로 둔 것.

answers/replies를 쓰는 모든 Server Action은 소유권 검사에 더해 아래도 함께 서버에서 확인한다(DECISIONS.md의 후속 결정 참고):

- **회차 상태 검사**: 대상 `answer`/`reply`가 속한 `session.status === 'open'`인지 확인. `draft`나 `closed`면 거부한다. 상태별로 분기하지 않고 이 한 조건으로 draft/closed 둘 다 막는다.
- **[R1] reply 생성 시 topic kind 검사는 더 이상 `excerpt` 전용이 아니다** — 5종 kind 전부의 answer에 reply를 달 수 있다. 대신 `topic.kind === 'difficult'`인 경우에만 추가로 `isPostMeetingOpen(session.meets_at)`(`lib/topics.ts`, KST 기준 모임 당일 0시)을 확인한다. `session.status==='open'`과 AND로 결합하며, 두 조건 모두 서버(`upsertReplyAction`)에서 재확인한다 — 클라이언트의 `ReplyThread`가 `gate` prop으로 입력창을 숨기는 것은 UX 편의일 뿐, 그 prop을 우회해 액션을 직접 호출해도 서버가 독립적으로 거부한다(admin도 예외 없음).

## 서버 측 필수 검증 체크리스트

구현 단계(Phase 2~4)와 배포 전 자체 점검(Phase 5)에서 아래를 모두 확인한다.

- [ ] 모든 Server Action의 첫 줄이 `requireSession()` 또는 `requireAdmin()`을 호출하는가 — 예외 없이 파일 목록과 함께 제시.
- [ ] 모든 Route Handler(`app/api/**/route.ts`)도 동일하게 세션/권한 검사를 거치는가(예: `/api/keep-alive`는 `CRON_SECRET`으로 별도 인증).
- [ ] answer/reply를 수정·삭제하는 모든 액션에서, 요청에 담긴 id로 실제 레코드를 조회해 소유자를 서버에서 재확인하는가(클라이언트가 보낸 memberId를 신뢰하지 않는가).
- [ ] 남의 `answer.id`로 수정 요청을 보내면 서버가 거부하는가 — 남의 `reply` 삭제 시도도 함께 확인.
- [ ] `session.status !== 'open'`인 회차에 answer/reply 쓰기(생성·수정·삭제)를 시도하면 서버가 거부하는가 — `draft`, `closed` 양쪽 모두 확인.
- [ ] **[R1] `topic.kind === 'difficult'`인 answer에 reply를 달 때, 모임 당일(KST) 이전 요청을 서버(`upsertReplyAction`)가 거부하는가** — `ReplyThread`의 `gate` prop을 우회해 액션을 직접 호출해도 막히는지가 핵심(클라이언트 표시만으로 막는 것은 인정하지 않음).
- [ ] **[R1] `appendix` 수정 액션(`upsertAppendixAction`)이 `answerId`+`member_id` 이중 조건으로 소유권을 재확인하는가** — 다른 회원의 `answerId`를 넣어 요청해도 거부되는지 확인.
- [ ] **[R1-e 갱신] `upsertChoiceTopicAction`/`upsertChoiceReplyAction`/`upsertAppendixAction`도 첫 줄에서 `requireSession()`을 호출하는가** — `upsertChoiceAction`(v1 설계)은 R1-e에서 choice가 "발제 게시물+찬반 reply" 2단 구조로 바뀌며 이 두 함수로 대체됐다(`docs/DECISIONS.md` "R1-e" 참고). 2026-08-21 기준 `app/s/[id]/actions.ts` 확인 결과 셋 다 첫 줄에서 호출한다.
- [ ] answer 삭제 시 하위 `replies`가 실제로 `ON DELETE CASCADE`로 함께 삭제되는가, 그리고 삭제 전 확인 모달에 하위 reply 개수가 표시되는가.
- [ ] `/admin/*` 이하 모든 Server Action이 `requireAdmin()`을 첫 줄에서 호출하는가.
- [ ] 빌드 산출물(`.next`)에 `SUPABASE_SERVICE_ROLE_KEY` 문자열이 없는가 — grep으로 실제 확인(`.next/static`처럼 브라우저로 나가는 디렉터리 기준으로 확인할 것 — 서버 전용 청크에는 당연히 남아 있다).
- [ ] 클라이언트 컴포넌트(`"use client"`)에서 `@supabase/supabase-js`를 import하는 곳이 없는가.
- [ ] 전 테이블에 RLS가 켜져 있는가(정책 0개인 것도 함께 확인 — 정책이 실수로 추가돼 있으면 오히려 의도치 않게 열릴 수 있다). **[R1]** `0003_r1a_schema.sql`은 컬럼 추가/리네임과 `votes` drop만 하고 RLS 관련 statement가 없으므로, 적용 후에도 이 항목은 여전히 유효해야 한다.
- [ ] **[R1]** `0003_r1a_schema.sql`이 만드는 `answers_topic_member_slot_key`의 컬럼 구성(`topic_id, member_id, slot`)이 `upsertAnswerAction`/`upsertChoiceAction`의 `onConflict` 문자열과 정확히 일치하는가 — 하나라도 다르면 적용 직후 모든 저장이 즉시 에러난다.
- [ ] `proxy.ts`의 matcher에서 빠진 경로가 없는가(새 라우트나 `public/` 정적 자산 추가 시 matcher 갱신을 잊기 쉽다 — 예: `next/image`가 최적화를 위해 자기 자신에게 보내는 내부 fetch도 이 matcher를 통과하므로, `public/` 자산 경로가 빠지면 이미지 최적화 자체가 깨진다).
- [ ] 세션 쿠키 서명 검증이 모든 보호 경로에서 실제로 실행되는가(미들웨어 우회 경로가 없는가).
- [ ] 로그인 시도 제한이 서버리스 환경(인스턴스 재시작/스케일 아웃)에서도 실제로 유효한가(DB 기반인지 확인).

## 붙여넣기 이관 파서의 신뢰 경계

`/admin/sessions/[id]/import`는 관리자가 붙여넣는 자유 텍스트를 파싱한다. 관리자 전용 기능이라도 아래는 지킨다:

1. 파싱 결과는 항상 미리보기로 먼저 보여주고, 명시적 확인 후에만 DB에 쓴다 — 파서 오작동이 즉시 데이터를 오염시키지 않게 하는 방어선이다.
2. 파싱된 텍스트가 그대로 화면에 렌더링될 때 React의 기본 이스케이프에 의존하고, `dangerouslySetInnerHTML`류를 쓰지 않는다.
3. 파서는 SQL을 직접 조립하지 않는다 — 항상 파라미터 바인딩되는 Supabase 클라이언트 메서드를 통해 쓴다.
4. 이름 매칭 실패 시 자동으로 새 `members` 행을 만들지 않는다 — 관리자의 명시적 선택을 거친다(오탈자로 인한 유령 멤버 생성 방지).

## 외부 리뷰(Codex/Gemini CLI) 점검 항목

Phase 5 이후 또는 주요 변경 후, 코드를 수정하지 않는 리뷰 전용 세션에서 아래를 점검한다(자세한 절차는 `독서토론앱.md`의 "Codex/Gemini CLI 인계 프롬프트" 참고):

1. service-role 키가 클라이언트 번들로 유출될 import 경로가 있는가.
2. 권한 검사가 누락된 Server Action 또는 Route Handler가 있는가.
3. 특히 `replies`(사유 더하기) 생성·수정·삭제에서 작성자 본인 확인이 서버에서 이뤄지는가.
4. 사용자 입력이 SQL이나 렌더링에 안전하지 않게 들어가는 곳이 있는가.
5. 세션 쿠키의 서명 검증을 우회할 지점이 있는가.
6. 로그인 시도 제한이 서버리스 환경에서 실제로 동작하는가.
7. 붙여넣기 이관 파서가 악의적 입력에 대해 안전한가.
