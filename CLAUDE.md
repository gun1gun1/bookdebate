# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 현재 상태

Phase 0~5(스펙 문서화 → 스캐폴딩/스키마/시드 → 인증 → 관리자 화면 → 참여자 화면 → 배포 준비)가 모두 끝났고, 실제로 Vercel에 배포되어 쓰이고 있다(https://bookdebate.vercel.app). 그 위에 R1 개편(레이아웃 전면 개편, 논제 5종 `free`/`excerpt`/`difficult`/`choice`/`appendix` 정식 구현, "내담리" 브랜딩)이 R1-a~R1-e를 거쳐 R1-d(구 코드/문서 잔재 정리)까지 끝났고, 그 위에 실사용 피드백을 반영한 **R1-f**(별점 0.5 단위, choice 사전 작성 허용, 발췌 1인 다건 허용, 논제 헤더 강화)도 끝났다. `supabase/migrations/0001~0007` 전부 프로덕션 DB에 적용 완료됨(2026-08-22, Supabase MCP로 라이브 스키마 직접 조회해 재확인 — `docs/DECISIONS.md` "마이그레이션 0005~0007 프로덕션 적용 확인" 절 참고). `docs/` 아래에 아래 문서들이 있으니, 작업 전에 관련된 것을 먼저 읽어라 — 이 CLAUDE.md는 요약이지 대체가 아니다.

- `docs/SPEC.md` — 화면, 기능, 사용자 흐름, 상태 전이
- `docs/SCHEMA.md` — 테이블 정의, 관계, `topics.kind`에 따른 answers/replies 사용 방식, R1-a 마이그레이션 롤백 절차
- `docs/SECURITY.md` — 권한 매트릭스, 서버 측 필수 검증 체크리스트
- `docs/DECISIONS.md` — 결정과 이유, 채택하지 않은 대안 (진행 중 바뀐 결정은 여기 계속 추가되는 append-only 로그 — 과거 항목은 고치지 말고 새 항목을 더할 것)
- `docs/RETENTION.md` — 이 앱이 계속 쓰이게 만드는 장치와 근거
- `docs/OPEN_QUESTIONS.md` — 아직 정해지지 않은 운영/UI 정책 질문들(7~14번). 데이터/정책 관련 1~6번은 이미 답이 정해져 DECISIONS.md로 옮겨졌다.
- `docs/REFACTOR_PLAN.md` — R1 개편 계획과 단계별 진행 현황(R1-a~R1-e 완료). R1-f 이후의 실사용 피드백 반영은 REFACTOR_PLAN.md 범위 밖이라 DECISIONS.md에만 기록한다.

원본 기획 문서 `독서토론앱.md`는 Phase 0~5의 실제 프롬프트 블록을 담고 있는 계획서로, 지금은 과거 이력 참고용으로 유효하다.

작업을 시작하기 전에 저장소가 실제로 어디까지 진행됐는지 먼저 확인하라(예: `git log`, `docs/DECISIONS.md`의 최신 절, `docs/REFACTOR_PLAN.md`의 단계 표) — 어떤 단계가 끝났다고 문서만 보고 가정하지 말고 코드/DB의 실제 상태에서 이어서 진행할 것.

## 빌드 · 린트 · 개발

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # 프로덕션 빌드 + 타입체크(Next.js가 tsc를 겸함)
npm run lint     # ESLint
```

## 제품 배경

40~50대 5~8명이 참여하는 사적 월간 독서모임으로, 현재는 구글 문서로 토론을 진행 중이다. 이 앱은 그 구글 문서를 대체한다. 이전에도 비슷한 앱을 만들었지만 안 쓰여서 사장된 이력이 있다 — `독서토론앱.md`의 B절은 이런 앱이 죽는 전형적인 경로(링크가 단톡방에 묻힘, 누가 참여했는지 안 보임, 관리자의 매달 세팅 피로, 아카이브 부재, 로그인 번거로움)를 나열하고 각각을 특정 기능에 대응시켜 놓았다. "이 앱이 실제로 매달 계속 쓰일 것인가"를 부수적 고려사항이 아니라 실질적 설계 제약으로 취급할 것 — 공유 문구 생성, 참여 현황 표시, 회차 템플릿 같은 기능이 나중이 아니라 MVP 범위에 들어가 있는 이유가 이것이다.

## 핵심 도메인 개념: `topics.kind`가 전체를 좌우한다

원본 구글 문서 구조에는 다섯 가지 논제 형태가 있고, 이 구분이 데이터 모델과 UI 전체의 축이다(R1에서 5종 전부 정식 구현됨 — `docs/REFACTOR_PLAN.md`, `docs/SCHEMA.md` 참고):

- **`free` 논제** — 평평한 구조: 참여자당 답변 1개, 카드로 나란히 표시. 전원 참여 전제.
- **`excerpt` 논제** — 2단 중첩 구조: 각 참여자가 발췌+이유를 올리고(`answers` 행), **다른 참여자들이 그 특정 발췌 아래에 사유를 덧붙인다**(그 `answer`에 달리는 `replies` 행이며, 논제에 직접 달리는 것이 아니다). 이것이 "사유 더하기" 스레드이며, 이 앱을 단순 폼과 가장 크게 구분 짓는 기능이다. 전원 참여 전제.
- **`difficult` 논제("힘든 구절")** — `excerpt`와 같은 두 컬럼(`quote_text`/`quote_reason`)을 공유하는 선택 참여 논제. 여기 달리는 reply("같이 생각해 보니")는 모임 당일 0시(Asia/Seoul) 이후에만 쓸 수 있다 — `lib/topics.ts`의 `isPostMeetingOpen()`을 클라이언트와 서버(`upsertReplyAction`)가 함께 써서 강제한다(클라이언트 표시만으로 막지 않음).
- **`choice` 논제** — 찬반형 선택 참여 논제. `answers.choice`(입장, `topics.choice_options` 중 하나)는 버튼 클릭 즉시 저장하고 `answers.body`(근거)는 선택 입력. 더 이상 스키마만 있는 kind가 아니라 전용 화면(`ChoiceView`)까지 정식 구현됐다 — 과거 `votes` 테이블은 이 kind가 정식화되며 R1-a에서 drop됐다.
- **`appendix` 논제("부록논제")** — 선택 참여, 1인이 여러 개(`answers.slot`으로 구분)를 올릴 수 있는 유일한 kind. `answers.title`(선택)+`body` 사용.

모든 화면, 쿼리, 관리자 편집기는 `topics.kind`에 따라 분기한다. `answers`/`replies`를 다룰 때는 `replies`가 항상 특정 `answer`에 속하며, `topic`에 직접 속하지 않는다는 점을 유념할 것 — R1부터는 5종 kind 전부의 answer에 reply를 달 수 있다(`difficult`만 위 KST 게이트가 추가로 걸림).

## 데이터 모델

전체 테이블 정의는 `독서토론앱.md` C절 참고. 핵심 관계:

```
books -> sessions (회차 1개당 책 1권)
sessions -> topics (순서 있음, session.selector_member_id가 책을 고르고 보통 논제 1번을 담당)
topics -> answers (free/excerpt/difficult/choice는 참여자당 1개, appendix만 slot으로 여러 개 허용)
answers -> replies (R1부터 5종 kind 전부에서 의미 있음 — difficult만 KST 게이트 추가)
sessions -> ratings (참여자당 회차당 1개, 화면에는 논제 1에 표시되지만 실질은 회차 단위)
members.aliases text[] — 참여자들은 이름을 축약해서 씀(예: 선희→'선', 희진→'희'); 이름을 파싱하거나 표시하는 모든 곳에서 별칭 매칭이 필요함
```

MVP는 `free`와 `excerpt`를 먼저 완전히 구현했고, R1에서 `difficult`/`choice`/`appendix`까지 5종 전부 정식 구현했다.

## 인증 및 보안 모델 (타협 불가 제약)

이 설계에서 가장 안전 관련도가 높은 부분이며, 여기서 벗어나는 것이 실제 취약점을 만드는 가장 유력한 경로다:

- **Supabase Auth를 쓰지 않는다.** 인증은 공통 암호(`SITE_PASSWORD_HASH`에 bcrypt 해시로 저장) + 이름 선택 방식이며, 서명된 JWT 세션 쿠키(`jose` 사용)로 뒷받침한다. httpOnly/secure/sameSite=lax, 유효기간 90일.
- **모든 테이블에 RLS를 켜고 정책은 하나도 만들지 않는다**(전면 거부). 즉 Postgres 자체가 모든 접근을 막으며, 데이터에 닿는 유일한 경로는 service-role 키를 쓰는 Next.js 서버뿐이다.
- **브라우저에서 Supabase를 직접 호출하지 않는다.** 클라이언트는 `lib/supabase/server.ts` 단 하나만 존재하며, 첫 줄에 `import 'server-only'`를 두고 `SUPABASE_SERVICE_ROLE_KEY`를 사용한다. 클라이언트용 Supabase 클라이언트를 새로 만들지 말 것.
- **인증 로직은 전부 `lib/auth.ts` 한 파일에만 둔다**, 외부에는 `getSession()`, `requireSession()`, `requireAdmin()` 세 함수만 노출한다. 인증 방식이 나중에 바뀌더라도(예: `REQUIRE_MEMBER_PIN`으로 개인 PIN 추가) 이 시그니처는 유지할 것.
- **모든 Server Action의 첫 줄은 `requireSession()` 또는 `requireAdmin()`을 호출해야 한다.** `proxy.ts`(Next.js 16부터 `middleware.ts`에서 이름이 바뀐 컨벤션)에서도 경로 보호를 하지만(이중 방어), 서버 액션이 미들웨어만 믿어서는 안 된다. 버튼을 클라이언트에서 숨기는 것은 이 프로젝트에서 명시적으로 보안 조치로 인정하지 않는다.
- `SUPABASE_SERVICE_ROLE_KEY`에는 절대 `NEXT_PUBLIC_` 접두사를 붙이지 않으며, 클라이언트 번들에 절대 포함되어서는 안 된다 — Phase 5에는 `.next` 빌드 산출물에 대해 이를 grep으로 확인하는 절차가 명시되어 있다.
- 무차별 대입 방지: `login_attempts` 테이블, 같은 IP에서 10분 내 5회 실패 시 10분 차단, 메시지는 "잠시 후 다시 시도해 주세요"로만 표시(세부 정보 노출 금지).

이 프로젝트는 Claude Code뿐 아니라 Codex CLI / Gemini CLI로도 유지보수될 것을 전제로 한다 — "마법 같은" 추상화를 피하고 폴더 구조와 명명 규칙을 명시적으로 유지할 것(인증과 Supabase 클라이언트를 각각 프레임워크 계층에 흩뿌리지 않고 파일 하나에 고정해 둔 이유가 이것이다).

## 배포 제약

- Vercel Hobby(무료 플랜) — 유료 기능에 의존하지 않는다.
- Supabase 무료 플랜 Postgres — 7일간 무활동 시 자동 일시정지되는데, 이 앱은 월 1회 정도만 쓰이므로 매일 도는 keep-alive cron(`app/api/keep-alive/route.ts`, `CRON_SECRET`으로 보호)이 부가적 개선이 아니라 필수 인프라다. Vercel Hobby는 cron을 **하루 1회까지만** 허용한다 — 하루 2회 이상 도는 스케줄 표현식은 배포 자체가 실패한다.

## 붙여넣기 이관 파서 (Phase 3 도입, R1-c2에서 5종으로 확장)

관리자는 `/admin/sessions/[id]/import`에 구글 문서에서 복사한 원문 텍스트를 붙여넣어 과거 회차를 이관한다. 파서 규칙(`lib/admin/importParser.ts` 상단 주석, `docs/REFACTOR_PLAN.md` 4.8절)은 구체적이며 미묘하게 틀리기 쉽다:

- `■`로 시작하거나 `숫자.`로 시작하는 줄 = 새 논제.
- kind 판정은 아래 우선순위 체인(위에서부터 먼저 매치되는 것을 채택): 1. 찬반/선택논제/찬성/반대 → `choice` 2. 발췌/사유 더하기 → `excerpt` 3. 힘든/어려운/걸린 구절 → `difficult` 4. 부록 → `appendix` 5. 그 외 → `free`.
- "별점" 줄이 있으면 `has_rating = true`.
- `excerpt` 논제 안에서: `"이름 발췌"` 형태의 줄이 그 참여자의 answer를 시작시키고, `이유` 라벨 이후의 텍스트가 `quote_reason`이 되며, `사유 더하기` 라벨 이후의 `"이름:"` 줄들이 그 answer에 달리는 `replies`가 된다.
- `difficult` 논제 안에서: 이름 줄 다음에 고정 라벨 "힘든 구절"이 와야 answer가 시작된다(이름 줄만으로는 확정 아님). 이후 "저는 이리 생각했는데…" 라벨 다음이 `quote_reason`, "같이 생각하니…" 라벨 다음의 `"이름:"` 줄들이 `replies`가 된다 — 이 라벨들은 과거 원문의 고정 문구를 그대로 인식하는 용도이며, 라이브 UI가 새 댓글 작성 시 보여주는 레이블("같이 생각해 보니")과는 별개다(`docs/DECISIONS.md` "R1-c1 정정" 참고, 둘을 같은 문자열로 맞추지 말 것).
- `free` 논제 안에서: `"이름:"` 줄이 그 참여자의 answer.
- `choice`/`appendix`로 판정된 논제는 구조 파싱하지 않고 원문 그대로 `unclassified` 블록에 담아 관리자가 미리보기에서 직접 확인·수동 처리한다(파서가 신뢰도 낮게 자동 배정하지 않는다).
- 이름은 `members.name`과 `members.aliases` 양쪽에서 정확히 일치할 때만 매칭한다(부분 매칭 없음). 매칭에 실패한 이름은 관리자가 수동으로 연결할 수 있도록 반드시 표시해야 하며, 조용히 무시하거나 자동 생성해서는 안 된다.
- 실제 저장 전에 반드시 미리보기(kind별 개수를 포함한 생성될 논제/답변/사유더하기 개수)를 보여주고 명시적 확인을 받아야 한다.

이 파서는 관리자가 붙여넣는 자유 텍스트를 처리하므로, 인젝션/렌더링 관점에서 신뢰할 수 없는 입력으로 취급할 것(`docs/SECURITY.md` "붙여넣기 이관 파서의 신뢰 경계" 절 참고).

## 데스크톱 우선 UI

주 사용 환경은 데스크톱이며 모바일은 보조다(대부분의 소비자용 웹앱과 반대). 이는 단순 반응형 대응을 넘어 실제 레이아웃 결정에 영향을 준다. **[R1]** 회차 상세 페이지(`/s/[id]`)는 더 이상 뷰 전환 탭이 없다 — 좌측 사이드바(책 정보/참여 현황/논제 목차+스크롤스파이/공유 버튼, `SessionSidebar.tsx`)와 우측에 모든 논제를 순서대로 세로로 나열하는 스트림(`TopicPanel.tsx`) 2컬럼 구조 하나뿐이다. `xl:`(1280px) 미만에서는 사이드바가 접힌 가로 요약 바로 전환되고 논제 목차는 아코디언으로 펼친다. 스트림 레이아웃에서는 여러 논제의 편집기가 동시에 열릴 수 있어, `EditorLockContext`로 한 번에 편집기 하나만 열리도록 제한한다(다른 편집기를 열려고 하면 저장 확인창). 본문 컬럼 폭은 화면이 넓어도 약 68자로 고정한다. 다크 모드는 없다. 자동 저장은 하지 않는다 — 명시적 저장 버튼, "저장됨 · 방금" 확인 표시, 작성 중 이탈 시 확인창.

## 환경변수

| 이름 | 용도 | 클라이언트 노출 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | 가능 |
| `NEXT_PUBLIC_SITE_URL` | 공유 문구용 절대 URL | 가능 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 DB 접근 | **절대 금지** |
| `SITE_PASSWORD_HASH` | 공통 암호 bcrypt 해시 | 금지 |
| `SESSION_SECRET` | JWT 서명 키 (32자 이상) | 금지 |
| `REQUIRE_MEMBER_PIN` | 개인 PIN 사용 여부 (기본 false) | 금지 |
| `CRON_SECRET` | keep-alive 인증 | 금지 |
