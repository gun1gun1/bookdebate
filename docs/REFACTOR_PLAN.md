# REFACTOR_PLAN.md — R1 개편 (레이아웃 전면 개편 + 논제 5종 + 브랜딩 "내담리")

이 문서는 계획 문서다. **이 문서 자체는 코드를 변경하지 않는다** — 실제 구현은 별도 턴에서 이 계획을 따라 진행한다.

**v2 개정**: 최초 계획(v1)은 `choice`를 "스키마만, UI 없음"으로 전제했으나 틀렸다 — 과거 구글 문서 대부분에 "4. 찬반 논제(선택과제)"가 실제로 있었고, `SPEC.md`/`SCHEMA.md`/`DECISIONS.md`가 그동안 "MVP는 화면만 줄이고 스키마는 v2까지 미리 반영"이라고 적어온 것 자체가 이 프로젝트의 착오였다. **R1부터 `choice`는 정식 5종 kind 중 하나로 실제 구현한다.** 이 문서 전체를 이 전제로 다시 썼다 — v1과 달라진 지점은 대화 응답에 별도로 정리했다(문서 안에는 델타를 표시하지 않는다).

**v3 정정**: v2까지는 difficult의 "2단계"를 `answers.reflection_text`라는 **별도 필드**(작성자 본인이 모임 후 다시 들어와 채우는 것)로 설계했다. 사용자가 과거 원문(힘든 구절 논제 실제 텍스트, 2건)을 직접 제공해 확인한 결과 이 설계가 틀렸다 — 실제 원문의 "같이 생각하니…" 아래에는 **다른 참여자들의 이름과 짧은 댓글**(`용훈:`/`수:`/`선:`/`희:`/`윤선:` 형태)이 나열된다. 이는 별도 필드가 아니라 excerpt의 "사유 더하기"와 구조적으로 동일한 **reply 목록**이며, R1이 이미 "모든 kind에 의견 남기기 허용"으로 결정한 것과 정확히 같은 메커니즘이다. 따라서 `reflection_text`/`reflection_updated_at` 컬럼은 **폐기**하고, "모임 당일 0시(KST)부터 열린다"는 게이팅은 별도 필드가 아니라 **difficult-kind answer에 대한 reply 작성 자체**로 옮겼다. 이 문서 전체에서 관련 부분을 정정했다.

범위: (1) 회차 상세 레이아웃 전면 개편, (2) 뷰 전환 탭 제거, (3) `topics.kind`를 5종(`free`/`excerpt`/`difficult`/`choice`/`appendix`)으로 확장하고 전부 UI를 갖추며 모든 kind에 "의견 남기기"(replies) 허용, (4) 서비스명 "내담리" 브랜딩.

## 논제 5종 요약

| kind | 라벨 | 참여 | 본문 필드 | 의견 남기기 |
|---|---|---|---|---|
| `free` | 자유논제 | 전원 | `body` (+ 별점) | O |
| `excerpt` | 발췌와 사유 | 전원 | `quote_text` + `quote_reason` | O |
| `difficult` | 힘든 구절 | 선택 | `quote_text` + `quote_reason` | O(단, 댓글은 모임 당일 KST 0시부터) |
| `choice` | 찬반 논제 | 선택 | `choice`(입장) + `body`(근거) | O |
| `appendix` | 부록논제 | 선택, 1인 다건 | `title` + `body` | O |

`excerpt`/`difficult`는 같은 두 컬럼(`quote_text`/`quote_reason`, R1에서 `excerpt_text`/`excerpt_reason`을 리네임)을 공유한다.

---

## 1. 현재 코드 구조 파악 결과

### 1.1 라우트 (`app/`)

| 파일 | 역할 |
|---|---|
| `app/layout.tsx` | 루트 레이아웃. `<AppHeader/>` 렌더링, `metadata`(title/description) 정의. |
| `app/page.tsx` | `/` 회차 목록. 진행 중 회차 카드 + 지난 회차 연도별 목록. 참여 현황(`N/M명 작성`) 계산. |
| `app/globals.css` | Tailwind v4 진입점. 다크모드 없음, Pretendard 폰트. |
| `app/favicon.ico` | 현재 파비콘(Next 기본값 추정) — R1에서 `app/icon.svg`로 교체 예정(3.4절). |
| `app/login/**` | 2단계 로그인. 이번 개편과 무관. |
| `app/me/page.tsx` | `/me` 내 글 모아보기. `answers`+`replies`를 회차별로 묶어 읽기 전용 렌더링. |
| `app/s/[id]/page.tsx` | 회차 상세 Server Component. `sessions`+`topics`+`answers`+`replies`+`ratings`를 조회, `searchParams`의 `view`/`topic` 쿼리를 읽어 `SessionShell`에 전달. |
| `app/s/[id]/SessionShell.tsx` | `"use client"`. 상단 헤더 + 뷰 전환 탭 3개 + 탭별 컨텐츠. `?view=`/`?topic=` URL 동기화, 이탈 확인. |
| `app/s/[id]/TopicPanel.tsx` | "논제별 뷰"에서 **선택된 논제 하나**를 렌더링. `FreeView`/`ExcerptView` 2분기, reply UI가 `ExcerptView`에 내장(excerpt 전용, 재사용 불가). |
| `app/s/[id]/MemberPanel.tsx` | "사람별 뷰". |
| `app/s/[id]/MatrixPanel.tsx` | "한눈에 뷰"(데스크톱 전용). `AnswerContent`의 `truncate` prop의 유일한 소비처. |
| `app/s/[id]/types.ts` | `Member`/`Reply`/`Answer`/`Topic`/`Rating` 타입. |
| `app/s/[id]/actions.ts` | `upsertAnswerAction`(topic+member 기준 upsert), `deleteAnswerAction`, `upsertReplyAction`(**`topic.kind !== 'excerpt'`면 거부**), `deleteReplyAction`, `upsertRatingAction`. |
| `app/admin/**` | 관리자 화면. kind를 다루는 곳: `admin/sessions/[id]/topics/{page,TopicRow,actions}.tsx`, `admin/templates/{NewTemplateForm,TemplateCard,actions}.tsx`, `admin/sessions/[id]/import/{ImportForm,actions}.tsx` — `<select>`에 `free`/`excerpt`/`choice` 3개만 하드코딩(단 `choice`는 지금도 목록엔 있으나 전용 편집 UI가 없음). |
| `app/api/keep-alive/route.ts` | 무관. |

### 1.2 라이브러리 (`lib/`)

| 파일 | 역할 |
|---|---|
| `lib/supabase/server.ts` | service-role 서버 전용 클라이언트. |
| `lib/supabase/types.ts` | `Database` 타입 + `TopicKind = "free" \| "excerpt" \| "choice"`. `votes` 테이블 타입 포함. `answers` Row/Insert/Update에 `excerpt_text`/`excerpt_reason`(리네임 대상), `title`/`choice`/`slot`(신규 대상) 없음. |
| `lib/auth.ts` | 인증 전체. 무관. |
| `lib/topics.ts` | `isAnswerComplete(kind, answer)` — `excerpt`면 `excerpt_text`, 그 외는 `body`만 보는 2분기. `choice`/`difficult`/`appendix` 분기 없음. |
| `lib/admin/topics.ts` | 템플릿→회차 적용, 이전 회차 구조 복제. kind를 그대로 복사만 하므로 재사용 가능(변경 불필요). |
| `lib/admin/importParser.ts` | `free`/`excerpt` 2종만 판정(제목+안내문에 "발췌"/"사유 더하기" 포함 여부). `difficult`/`choice`/`appendix` 판정 없음. |

### 1.3 공용 컴포넌트 (`components/`)

`AppHeader.tsx`(로고 없음), `AnswerContent.tsx`(`free`/`excerpt` 2분기, `truncate`는 `MatrixPanel` 전용), `ShareButton.tsx`(레이아웃 무관하게 재사용 가능), `StarRating.tsx`(변경 불필요 — `ChoiceView`의 "즉시 저장" 버튼이 이 컴포넌트와 같은 패턴을 따른다), `DeleteButton.tsx`(변경 불필요, appendix 다중 게시물 삭제에도 재사용).

### 1.4 DB (`supabase/`)

`0001_init_schema.sql`(전 테이블 초기 스키마, `votes` 포함), `0002_topic_templates.sql`, `seed.sql`(6멤버/2책/2세션/5논제/16답변/6리플라이).

라이브 DB(`bookdebate`, `gfayjvddrlhjgkunjlnt`, `ap-northeast-2`, Postgres 17.6)를 직접 조회해 확인한 사실:
- 제약 이름: `topics_kind_check`, `topic_template_items_kind_check`, `answers_topic_id_member_id_key`(전부 확인됨, 추측 아님).
- 행 수: `answers` 16 / `replies` 6 / `topics` 5 / `sessions` 2 / `members` 6 / `books` 2 / **`votes` 0** — 전부 시드 값과 일치, 실사용 데이터 없음. `votes`가 비어 있다는 사실은 이번에 `votes` 테이블을 drop하는 결정(6절)의 근거이기도 하다.

### 1.5 문서 (`docs/`, 그리고 루트의 `CLAUDE.md`/`AGENTS.md`)

`SCHEMA.md`/`SECURITY.md`/`SPEC.md`/`DECISIONS.md`가 갱신 대상인 것은 v1과 동일. **추가로 확인**: 루트의 `CLAUDE.md`와 `AGENTS.md`도 각각 "`choice` 논제 — v2 전용(찬반 투표). `votes` 테이블 스키마는 처음부터 존재하지만, MVP에는 전용 UI를 만들지 않는다"라는 동일 문장을 담고 있다 — **이 두 파일도 R1 구현 시 함께 갱신해야 한다**(이번 턴 산출물에는 포함하지 않음, 코드 저장소 최상위 안내 문서라 실제 구현 PR에서 다른 코드 변경과 같이 처리하는 편이 자연스럽다).

---

## 2. 실행 단계와 순서

R1을 4단계로 나눈다. **실행 순서: R1-b → R1-a → R1-c → R1-d.**

| 단계 | 내용 | DB 변경 | 진행 현황 |
|---|---|---|---|
| **R1-b** | 레이아웃 개편(사이드바+스트림) + 브랜딩("내담리", 히어로, 헤더 로고, 파비콘) | 없음 | **완료** |
| **R1-a** | 스키마 마이그레이션(`supabase/migrations/0003_r1a_schema.sql`) | 있음 | **완료·적용됨** |
| **R1-c** | 논제 5종 UI(`DifficultView`/`ChoiceView`/`AppendixView` 신설, `ExcerptView` 회색카드화) + 모든 kind에 "의견 남기기" + 이관 파서 확장(difficult) + closed 전환 경고 | 없음(R1-a가 이미 적용된 스키마를 사용) | **완료**(R1-c1: 화면·저장, R1-e: choice 2단 구조 전환, R1-c2: 파서 확장·닫기 경고) |
| **R1-d** | 정리 및 점검(구 코드/문서 잔재 제거, `SECURITY.md` 체크리스트 재확인, `.next` grep 등 배포 전 점검) | 있음(`0005_drop_answers_choice.sql`, 미적용) | **거의 완료**(2026-08-21) — 4.6절 시드 갱신, 루트 `CLAUDE.md`/`AGENTS.md`의 이관 파서·데스크톱 UI 서술 갱신, `SECURITY.md` 체크리스트 재확인(+`upsertChoiceAction` 등 오래된 함수명 정정), `.next` grep으로 서비스 롤 키 미노출 재확인, `/me` 페이지의 kind 무관 reply 레이블 버그 수정, 사이드바 "선택" 배지 신설(SPEC.md엔 있었지만 미구현이었음), `answers.choice` 죽은 컬럼 정리를 마쳤다. 남은 건 `0005` 마이그레이션의 실제 프로덕션 적용뿐(사람 확인 필요) |

**R1-b를 가장 먼저 하는 이유**: DB를 전혀 건드리지 않아 위험이 없고, 나머지 단계와 독립적으로 배포·롤백할 수 있다.

**⚠ R1-a와 R1-c 사이의 배포 간극에 대한 운영 주의**: R1-a는 `excerpt_text`→`quote_text` 컬럼 리네임과 `votes` 테이블 drop처럼 **기존 코드가 즉시 깨지는(breaking) 변경**을 포함한다(6절 SQL 참고). R1-c 코드가 아직 `quote_text`를 쓰지 않는 상태에서 R1-a만 먼저 프로덕션 DB에 적용하면, 그 사이에 살아있는 구 코드(R1-b까지만 반영된 상태)가 `excerpt_text` 컬럼에 접근하려다 즉시 에러를 낸다. 따라서 **R1-a의 마이그레이션 적용과 R1-c의 코드 배포 사이에 트래픽을 받는 배포가 존재해서는 안 된다** — 실무적으로는 R1-a 마이그레이션을 R1-c 브랜치/PR과 같은 배포 묶음으로 취급하고, R1-a를 프로덕션에 적용하는 시점을 R1-c 병합 직전으로 맞춘다(이 앱은 월 1회 사용, 트래픽이 극히 적어 짧은 유지보수 창을 잡기 쉽다).

---

## 3. 삭제할 파일 · 컴포넌트

| 대상 | 이유 |
|---|---|
| `app/s/[id]/MemberPanel.tsx` | "사람별" 탭 제거. |
| `app/s/[id]/MatrixPanel.tsx` | "한눈에" 탭 제거. `AnswerContent`의 `truncate` prop도 함께 정리(유일한 소비처였음). |
| `app/s/[id]/SessionShell.tsx`의 뷰 전환 탭 UI와 `view` state/`?view=` 동기화 로직 | 탭 개념 자체가 없어짐. 파일은 남지만 전면 재작성. |
| `app/s/[id]/page.tsx`의 `searchParams: { view, topic }` | 논제 앵커는 브라우저 네이티브 해시(`#topic-{id}`)로 대체. |
| `lib/supabase/types.ts`의 `votes` 테이블 타입 | `votes` 테이블 자체를 drop하므로(6절) 타입도 제거. |

## 4. 수정할 파일별 변경 요지

### 4.1 레이아웃 개편 (R1-b)

- **`app/s/[id]/page.tsx`**: `searchParams` 제거. `select`에 `books.cover_url`/`books.author` 추가(사이드바용). `topics(...)` select에 신규 컬럼(`title`, `choice`, `slot`, `choice_options`) 추가는 R1-a 스키마 적용 이후, 즉 R1-c에서 실제로 반영(R1-b 시점에는 아직 이 컬럼들이 DB에 없음).
- **`app/s/[id]/SessionShell.tsx`**: `max-w-[1600px] mx-auto px-8` 컨테이너 + `<aside>`(320px 고정, `xl:` 이상 sticky) + `<div className="flex-1">` 2컬럼. `xl:` 미만은 사이드바가 상단 요약 바로 전환(4.7절). 탭 상태/URL 동기화 전부 삭제. 본문은 `topics.map(t => <TopicPanel key={t.id} topic={t} ... />)`로 스트림 렌더링. 사이드바는 `SessionSidebar.tsx`(5절)로 위임.
- **`app/s/[id]/TopicPanel.tsx`**: 최상위 `<div id={\`topic-${topic.id}\`} className="scroll-mt-*">` 추가. kind 분기를 5개로 확장(`DifficultView`/`ChoiceView`/`AppendixView` 신설은 R1-c, 파일 자체의 스트림 렌더링 골격은 R1-b에서 먼저 잡는다).
- **`app/layout.tsx`**: `metadata.title = "내담리"`, `metadata.description = "수원시 학습구 다정동 내담리"`. `app/icon.svg` 참조로 파비콘 교체(4.4절).
- **`components/AppHeader.tsx`**: 좌측에 `<Link href="/" className="font-semibold">내담리</Link>` 추가.
- **`app/page.tsx`**: 최상단 히어로 섹션 — `next/image`로 `public/brand/naedamri-hero.png`(682×510) 배치, 별도 텍스트 반복 없음.

### 4.2 편집기 동시 열림 방지 (R1-b, SessionShell 골격과 함께)

스트림 레이아웃에서는 여러 논제의 편집기가 동시에 열릴 수 있어, 화면 밖에 저장하지 않은 편집기가 남아 잊히는 사고가 생길 수 있다. **한 번에 편집기 하나만 열리도록 제한**한다:

- `SessionShell.tsx`의 기존 `hasOpenEditor: boolean` 상태를 `openEditorKey: string | null`(예: `"answer:{topicId}"`, `"reply:{answerId}"`, `"appendix-new:{topicId}"`)으로 확장해 Context나 prop drilling으로 각 View/`ReplyThread`에 전달한다. difficult의 "같이 생각하니…" 댓글도 `ReplyThread`를 통하므로 별도 키 없이 `"reply:{answerId}"`로 충분하다.
- 어떤 편집기를 열려는 시점에 이미 다른 `openEditorKey`가 열려 있으면, 그 편집기를 열기 전에 `window.confirm("저장하지 않은 내용이 있습니다. 계속할까요?")`를 띄운다 — 기존 `guarded()` 헬퍼(탭 전환 이탈 확인용으로 쓰던 것)를 "편집기 전환"까지 다루도록 일반화해서 재사용.
- `beforeunload` 확인(탭 닫기/새로고침 방지)은 `openEditorKey !== null`일 때 그대로 유지.

### 4.3 논제 5종 (R1-c, R1-a 스키마 적용 이후)

- **컬럼 리네임 전면 반영**: `excerpt_text`/`excerpt_reason`을 참조하는 모든 곳을 `quote_text`/`quote_reason`으로 바꾼다 — `app/s/[id]/types.ts`(`Answer` 타입), `app/s/[id]/page.tsx`(select 절), `app/s/[id]/actions.ts`(`upsertAnswerAction`의 `excerptText`/`excerptReason` 입력 키), `app/s/[id]/TopicPanel.tsx`(및 분리된 `ExcerptView.tsx`), `components/AnswerContent.tsx`, `lib/topics.ts`(`isAnswerComplete`), `app/me/page.tsx`(select), `app/admin/sessions/[id]/import/actions.ts`(`confirmImportAction`의 insert), `lib/admin/importParser.ts`(`ParsedAnswer.excerptText`/`excerptReason` 필드명도 `quoteText`/`quoteReason`으로 맞추는 편이 일관적).
- **`app/s/[id]/actions.ts`**:
  - `upsertAnswerAction`: `title`/`choice` 입력 추가. kind별 분기:
    - `free`/`excerpt`/`difficult`/`choice`: `slot`은 항상 `0`. `(topic_id, member_id, slot=0)` 기준으로 기존 행을 조회해 있으면 update, 없으면 insert(`upsert(..., {onConflict: "topic_id,member_id,slot"})`로 그대로 처리 가능 — 3개 컬럼 unique 제약이 DB에 있으므로 upsert의 arbiter로 계속 쓸 수 있다. **v1 초안과 달리 "조회 후 분기"로 바꿀 필요가 없어졌다** — slot 설계 덕분에 기존 upsert 패턴을 그대로 유지 가능).
    - `appendix`: `slot = coalesce(max(slot)+1, 0)`을 같은 `(topic_id, member_id)` 안에서 계산해 insert. **unique 위반(동시 제출 경합) 시 slot을 재계산해 1회 재시도**, 재시도도 실패하면 에러 반환.
    - `choice`: `body`(근거)는 선택 입력 — 비어 있어도 저장 가능(입장만 밝히는 경우).
  - **`upsertChoiceAction(topicId, choiceValue)`**(신규, `StarRating`과 같은 "즉시 저장" 패턴): 입장만 즉시 반영하는 전용 액션. 근거(`body`)를 나중에 따로 쓸 수 있도록 `upsertAnswerAction`과는 별개로 두되, 내부적으로는 같은 "조회 후 upsert(topic_id, member_id, slot=0)" 로직을 공유.
  - `upsertReplyAction`: `topic.kind !== "excerpt"` 거부 분기를 **삭제**하되, 완전 무조건 허용으로 바꾸지는 않는다 — **`topic.kind === "difficult"`일 때만 추가로 KST 게이트를 확인**하는 분기로 대체한다(v3 정정, 아래 4.3.1절). 그 외 4개 kind(`free`/`excerpt`/`choice`/`appendix`)는 `session.status==='open'`만 확인하면 reply를 허용한다.

#### 4.3.1 difficult 댓글("같이 생각하니…") 게이팅 — v3 정정, v4 레이블 정정

v2까지는 이 게이팅을 `upsertReflectionAction`이라는 별도 액션(별도 필드 `reflection_text` 갱신)으로 설계했다. 사용자가 제공한 실제 원문 확인 결과, "같이 생각하니…" 아래에는 다른 참여자들의 이름+댓글이 나열되는 **reply 목록**이었다 — 별도 필드가 아니었다. 따라서:

- `answers.reflection_text`/`reflection_updated_at` 컬럼을 **만들지 않는다**(관련 SQL·스키마 문서에서도 제거).
- 게이팅 로직은 `upsertReplyAction` 안으로 이동한다: 대상 `answer`가 속한 `topic.kind === 'difficult'`이면, `session.status==='open'`에 더해 **KST 게이트**(`lib/topics.ts`의 `isPostMeetingOpen(meetsAt)`)까지 통과해야 reply를 쓸 수 있다.
- `isPostMeetingOpen(meetsAt: string): boolean`(v2의 `isReflectionOpen`에서 개명 — 더 이상 "reflection" 필드가 없으므로 "모임 이후에 열린다"는 의미가 드러나는 이름으로 바꿨다): Vercel은 UTC로 동작하므로 `new Date()`에 9시간을 더해 "지금의 KST 날짜"를 구하고 `meets_at`과 비교. 클라이언트(댓글 입력창 비활성화+안내 문구)와 서버(`upsertReplyAction`의 실제 거부) 양쪽이 재사용한다 — 버튼 숨김만으로는 보안 조치로 인정하지 않는다(SECURITY.md 원칙).
- **레이블 정책(v4, `DECISIONS.md` "R1: 논제 유형별 reply 레이블 정책" 참고)**: 논제 유형마다 원문 표현을 그대로 쓴다 — 하나로 통일하지 않는다.
  - `difficult`: `quote_reason` 입력 필드 라벨 = **"저는 이리 생각했는데…"**, 댓글 영역 레이블 = **"같이 생각하니…"**(원문 그대로, 다듬지 않음 — v3에서 한때 "같이 생각해 보니"로 다듬으려 했으나 파서 정규식과 다르게 둘 이유가 없어 정정했다).
  - `excerpt`: 댓글 영역 레이블 = **"사유 더하기"**(기존 표현 유지, "의견 남기기"로 바꾸지 않는다).
  - `free`/`choice`/`appendix`: 댓글 영역 레이블 = **"의견 남기기"**(원문에 대응하는 관용구가 없는 신규 유형이므로 일반화한 문구).
- `ReplyThread`(5절)는 `label` prop을 받아 호출부(`ExcerptView`/`DifficultView`/`FreeView`/`ChoiceView`/`AppendixView`)가 위 표현을 각각 넘긴다 — 컴포넌트 자체는 기본값을 갖지 않고 항상 명시적으로 label을 받는다(어느 kind가 어떤 문구를 쓰는지 호출부 코드만 보고 알 수 있게).

- **`app/s/[id]/TopicPanel.tsx`**: `free`/`excerpt`/`difficult`/`choice`/`appendix` 5분기. `FreeView`/`ExcerptView`/`DifficultView`/`ChoiceView`/`AppendixView`로 분리(6절 신규 파일). `ExcerptView`는 미작성자 필터링(`answersWithContent = topic.answers.filter(...)`)을 삭제하고 `FreeView`처럼 전 멤버 순회 + 회색 카드로 전환.
- **`lib/topics.ts`**:
  - `isAnswerComplete()`: `excerpt`/`difficult`는 `quote_text` 기준(컬럼명만 갱신), **`choice`는 `answer.choice !== null`이면 완료**, `free`는 `body` 기준, `appendix`는 "완료" 개념 없음(있으면 목록에 표시, 없으면 미표시일 뿐이라 이 함수의 판정 대상이 아님).
  - `isMandatoryKind(kind)`(신규): `free`/`excerpt` → `true`, `difficult`/`choice`/`appendix` → `false`.
  - `isReflectionOpen(meetsAt: string): boolean`(신규): Asia/Seoul 기준 오늘 날짜 ≥ `meetsAt`.
- **`app/page.tsx`**: 참여 현황 계산에서 `isMandatoryKind()`로 `free`/`excerpt`만 필터링.
- **`app/me/page.tsx`**: select에 `title`/`quote_text`/`quote_reason`/`choice` 추가. `AnswerContent`가 5kind를 처리하게 되므로 `kind={a.topic.kind}` 그대로 넘기면 나머지는 내부 처리.
- **`components/AnswerContent.tsx`**: 5kind 분기로 확장(`choice`는 "나는 {선택지}" + 근거, `appendix`는 제목+본문). `truncate` prop은 `MatrixPanel` 삭제와 함께 제거.

### 4.4 브랜딩 — 파비콘 (R1-b)

히어로 이미지(`public/brand/naedamri-hero.png`)를 크롭해서 쓰지 않는다 — 배경에 체크무늬(투명 배경을 나타내는 편집기 표시)가 딸려와 16px 파비콘 크기에서 지저분해진다. 대신 **`app/icon.svg` 신규 제작**: 배경색 `#F2CB66`, 흰색 "내" 한 글자, 16px에서도 읽히도록 글자가 캔버스를 꽉 채우는 굵은 형태. Next.js 15+ 컨벤션상 `app/icon.svg`를 두면 자동으로 파비콘/앱 아이콘으로 인식되므로 `app/favicon.ico`는 제거하거나 유지(공존 가능, 브라우저가 SVG를 우선 사용).

### 4.5 관리자 화면 — kind 선택지 확장 + 참여 방식 안내 (R1-c)

`app/admin/sessions/[id]/topics/page.tsx`, `TopicRow.tsx`, `app/admin/templates/NewTemplateForm.tsx`의 `<select>`에 5종을 순서대로 노출: `free`/`excerpt`/`difficult`/`choice`/`appendix`.

- `kind === 'choice'`를 고르면 **선택지 목록 입력 필드**(쉼표 구분, 기본값 `"찬성,반대"`)를 노출 — `topics.choice_options`(6절 신규 컬럼)에 저장.
- kind 선택 시 참여 방식 안내 한 줄을 표시:
  - `free`/`excerpt` → "전원 참여 전제입니다"
  - `difficult`/`choice` → "선택 참여 논제입니다"
  - `appendix` → "누구나 여러 개를 올릴 수 있습니다"

`app/admin/sessions/[id]/topics/actions.ts`의 `parseTopicForm()`은 `formData.get("kind")`를 그대로 캐스팅하는 구조라 5종 자체는 코드 변경 없이 받아들이지만, `choice_options` 필드 파싱(쉼표 구분 문자열 → `text[]`)을 `createTopicAction`/`updateTopicAction`에 추가해야 한다.

### 4.6 회차 템플릿 기본값 갱신 (R1-c)

`supabase/seed.sql`의 기본 템플릿("기본 템플릿(요약+발췌)", 현재 2논제)을 5논제 구성으로 갱신:

1. `free` — 책을 소개하는 한 문장 요약과 소감 · 별점 있음 · 담당=책 선정자(role: selector)
2. `excerpt` — 인상 깊게 읽은 부분이나 발췌를 이유와 함께
3. `difficult` — 읽으면서 어려웠거나 마음에 걸린 구절 (선택)
4. `choice` — 찬반 논제 (선택)
5. `appendix` — 부록논제

`topic_template_items`에 `choice_options` 컬럼이 없으므로(템플릿 항목은 논제 구조만 담고 실제 회차에 적용될 때 `topics` 행이 새로 만들어짐), 4번 항목이 실제 회차에 적용되면 `topics.choice_options`는 DB 기본값(`{찬성,반대}`)을 그대로 받는다 — 템플릿 단계에서 선택지까지 커스터마이즈하려면 `topic_template_items`에도 `choice_options` 컬럼을 추가해야 하는데, 이번 R1 범위에서는 "기본 찬성/반대로 만들어진 뒤 회차별로 관리자가 논제 수정 화면에서 바꾼다"로 충분하다고 보고 템플릿 테이블 확장은 하지 않는다.

**[완료, 2026-08-21 R1-d에서 반영]** 위 5논제 갱신을 `supabase/seed.sql`에 반영했다. 원본 시드(참여자 6명, 책 2권)는 유지하고, 『허삼관매혈기』(진행 중 회차)에 아래를 추가했다:

- 기본 템플릿을 위 5논제 구성으로 갱신(이름도 "기본 템플릿(요약+발췌)" → "기본 템플릿(5논제)"로 변경).
- `difficult` 논제 1개 — 일부만 작성(선택 참여 재현). 용훈은 `quote_text`/`quote_reason`만 있고 댓글 없음("모임 전" 상태, 4.10절 "댓글 없는 힘든 구절" 경고 대상), 혜정은 댓글(`replies`) 3개까지 재현("모임 후" 상태, 경고 대상 아님).
- `choice` 논제 1개 — 선희가 발제 게시물을 올리고, 용훈(입장만)/혜정(입장+근거)이 반응, 나머지(수열/윤선/희진)는 미참여 상태로 재현. `choice_options`를 기본값(찬성/반대) 대신 `{이해된다,이해 안 된다}`로 바꾼 커스텀 케이스.
- `appendix` 논제 1개 — 수열이 서로 다른 제목으로 2개 게시물(`slot=0,1`)을 올린 상태 재현.

새 마이그레이션 `supabase/migrations/0005_drop_answers_choice.sql`도 이 턴에서 작성했다(R1-e가 미사용으로 남겨뒀던 `answers.choice` 컬럼 drop, `docs/DECISIONS.md` "R1-d" 절 참고) — 단 **파일만 작성됐고 프로덕션에는 아직 미적용**이다.

### 4.7 가로 요약 바 (R1-b, `xl:` 미만)

논제 목차를 요약 바에서 빼지 않는다(빼면 좁은 화면에서 스크롤 탐색 문제가 재현됨). 기본은 접힌 한 줄 `"논제 {N}개 ▾"`, 클릭 시 펼쳐지는 아코디언으로 전체 목차(제목+kind 배지)를 보여준다. 표지는 48px 정사각 썸네일로 유지(데스크톱 사이드바보다 훨씬 작게). 참여 현황 텍스트와 공유 버튼은 요약 바에 항상 노출(접힘 상태에서도 보임).

### 4.8 이관 파서 확장 (R1-c)

`lib/admin/importParser.ts`의 kind 판정을 아래 우선순위 체인으로 확장한다(위에서부터 먼저 매치되는 것을 채택):

```
1. /찬반|선택논제|찬성|반대/        → choice
2. /발췌|사유\s*더하기/             → excerpt
3. /힘든|어려운|걸린\s*구절/        → difficult
4. /부록/                           → appendix
5. (매치 없음)                      → free
```

기존 `TOPIC_HEADER = /^(?:■|\d+\.)\s*(.*)$/`는 실제 원문 양식("■ 자유논제 1.", "2.")을 이미 지원하므로 **변경 불필요** — 확인만 하고 넘어간다. `hasRating` 판정(`/별점/`)도 "별점 ☆ ☆ ☆ ☆ ☆" 표기를 그대로 잡아내므로 변경 불필요. 문서 상단의 제목 줄("내담리_독서논제_{책제목}")과 서지 줄("찰리 맥커시,『언제나 기억해』")은 첫 논제 헤더 이전에 나오므로 기존 "첫 논제 헤더 전 줄은 버린다" 로직이 그대로 스킵한다 — 별도 파싱 추가 불필요.

**difficult 서브파서 — v3, 실제 원문 2건으로 확정**: `excerpt`/`difficult`는 저장 컬럼은 같지만(`quote_text`+`quote_reason`), 참여자별 시작 신호는 **다르다**. excerpt는 `EXCERPT_START = /^(\S+)\s*발췌\s*$/`(이름+"발췌"가 한 줄)로 한 줄이면 충분하지만, 실제 힘든 구절 원문은 **두 줄**로 나뉜다:

```
{이름}          ← 후보 이름 줄(그 자체로는 확정 아님)
힘든 구절        ← 고정 라벨. 이 줄이 나와야 answer 시작이 확정된다
{quote_text, 여러 줄 가능, 빈 줄 가능}
저는 이리 생각했는데…   ← 이유 라벨(엑서프트의 "이유"와 다른 고정 문구)
{quote_reason, 여러 줄 가능, 빈 줄 가능}
같이 생각하니…         ← 댓글 시작 라벨("사유 더하기"와 다른 고정 문구)
{이름}: {댓글}
{이름}: {댓글}
```

파서 구현 방향: `kind==='difficult'`인 토픽 안에서 한 줄 앞선 값을 `pendingNameLine`으로 계속 버퍼링하다가, 현재 줄이 `DIFFICULT_LABEL = /^힘든\s*구절\s*$/`과 매치되면 그 시점에 `pendingNameLine`을 `resolveName()`으로 확정해 새 answer를 연다(직전 answer는 flush). 이유 라벨은 `DIFFICULT_REASON_LABEL = /^저는\s*이리\s*생각했는데[…\.]*\s*$/`(원문의 말줄임표가 "…" 한 글자든 "..." 세 글자든 매치되도록), 댓글 시작 라벨은 `DIFFICULT_REPLY_LABEL = /^같이\s*생각하니[…\.]*\s*$/`로 판정하고, 그 아래 `{이름}: {댓글}` 줄들은 excerpt의 "사유 더하기" 구간과 동일하게 `NAME_COLON` 패턴으로 replies에 채운다 — **즉 difficult 원문에 이미 채워진 "같이 생각하니" 댓글도 이관 시 실제 `replies` 행으로 저장된다.**

라이브 앱의 댓글 UI 레이블도 "같이 생각하니…"(4.3.1절 v4 레이블 정정)이므로, 파서 정규식(`DIFFICULT_REPLY_LABEL`)과 화면 문구가 동일한 표현을 쓴다 — 둘을 따로 관리할 필요가 없다.

⚠ **이관 시점에는 4.3.1절의 KST 게이트를 적용하지 않는다.** 그 게이트는 "참여자가 지금 브라우저에서 새로 입력하는 것"을 모임 당일까지 막는 라이브 쓰기 제약이지, 이미 끝난 과거 회차를 관리자가 일괄 백필하는 것과는 다른 맥락이다 — `confirmImportAction`의 direct insert는 다른 Server Action들의 라이브 게이트를 원래도 거치지 않는다(기존 `requireAdmin()`만 통과하면 된다).

`choice` 논제는 입장 파싱 신뢰도가 낮으므로(원문에서 "{이름}: 찬성/반대"처럼 명확히 구조화되어 있다는 보장이 없다) **파서는 근거 본문만 `free`와 동일한 방식(`NAME_COLON` 라인)으로 채우고, `answers.choice`는 항상 `null`로 둔다.**

`appendix` 논제의 원문 구조(제목 표기 방식, 1인 다건 시 구분 방식)도 사용자가 준 확인 사항에 포함되어 있지 않다 — ⚠ 마찬가지로 잠정 처리: `free`와 동일하게 `NAME_COLON` 라인 하나를 한 개의 답변으로 파싱하고 `title`은 `null`로 둔다(관리자가 저장 후 수동으로 제목을 채울 수 있음). 실제 원문 확인 후 조정.

**미리보기 개수 표시**: `ParseResult["counts"]`에 kind별 개수를 추가 — `counts: { topics: number; answers: number; replies: number; byKind: Record<TopicKind, number> }`. `ImportForm.tsx`의 미리보기 문구를 `"논제 {N}개(자유 {a} · 발췌 {b} · 힘든구절 {c} · 찬반 {d} · 부록 {e})"` 형태로 갱신 — 관리자가 유형별 누락을 눈으로 확인할 수 있게 한다(예: 찬반 논제가 0개로 나오면 파싱 실패를 즉시 알아챌 수 있음).

**입장 지정 UI(신규)**: `choice` 논제의 답변은 파서가 입장을 못 채우므로, 미리보기 화면(`ImportForm.tsx`)에 `choice` 논제로 판정된 각 답변마다 입장 선택 `<select>`(기본값 `"찬성"`/`"반대"`, 비워도 됨)를 추가한다. `previewImportAction`/`confirmImportAction`(`app/admin/sessions/[id]/import/actions.ts`)에 `choiceAssignments: Record<string, string | null>`(key는 topic order_no + answer index 조합 등) 파라미터를 추가해, 확인 시 `answers.insert`에 `choice: assignments[key] ?? null`을 반영한다. `unmatchedNames`의 `resolutions`와 같은 패턴(파싱 직후 별도 사람 확인 단계)을 그대로 따른다.

### 4.9 문서

- `docs/SCHEMA.md`: R1 내용 반영해 갱신. **완료.**
- `docs/SECURITY.md`: reply 권한 매트릭스에서 `topic.kind='excerpt'이고` 조건을 "`topic.kind='difficult'`이면 KST 게이트(모임 당일 0시 이후)까지 추가로 확인"으로 교체. 체크리스트에 "difficult-kind answer에 대한 reply 작성 시 KST 게이트를 서버가 재확인하는가" 추가. "회차를 닫기 전 댓글 없는 힘든 구절 인원을 관리자에게 경고하는가" 항목도 추가(4.10절).
- `docs/SPEC.md`: 화면 2 전면 재작성, `choice` 전용 화면(`ChoiceView`, 7절) 서술 추가, 이관 파서의 5종 판정 규칙 반영.
- `docs/DECISIONS.md`: 아래 3건을 R1 절로 신설.
  1. "R1: 레이아웃 개편 + 논제 5종 + 내담리 브랜딩" — choice 승격 배경(과거 문서에 실제로 4번 찬반 논제가 있었다는 사실 확인), slot 설계 채택 이유(DB 제약을 최후 방어선으로 유지).
  2. **운영 원칙**: "다음 회차를 열기 전까지 이전 회차를 닫지 않는다" — difficult 논제의 "같이 생각하니…" 댓글이 모임 당일부터 열리는데, `session.status==='open'`일 때만 모든 쓰기(reply 포함)가 허용되는 단일 규칙을 그대로 유지하기로 했으므로(4.3.1절), 회차를 성급히 `closed`로 돌리면 댓글 달 기회가 막힌다. 이를 관리자 조작 규율로 명문화한다(구현 없이 순수 운영 가이드).
  3. **"내담리" 이름의 출처**: 이번에 새로 지은 이름이 아니라, 기존 구글 문서 제목("내담리_독서논제_{책제목}")에서 이미 쓰이던 이름이었다는 사실 확인 — 브랜딩은 "새 이름 도입"이 아니라 "이미 쓰던 이름을 정식화"한 것.
- 루트 `CLAUDE.md`/`AGENTS.md`의 "`choice` 논제 — v2 전용" 서술 갱신(1.5절 참고, 실제 구현 시 함께 처리).

### 4.10 closed 전환 시 댓글 없는 힘든 구절 경고 (R1-c, v3 정정)

`app/admin/sessions/**`의 회차 상태 변경 액션(현재 `app/admin/sessions/actions.ts`에 있을 것으로 추정 — 실제 파일 위치는 구현 시 확인)에서, 상태를 `open → closed`로 바꾸기 직전에 해당 회차의 `difficult` kind 논제 중 **`quote_text`는 채워졌지만(=실제로 힘든 구절을 올렸지만) 딸린 `replies`가 0개인 answer** 수를 세어, 0보다 크면 확인 창을 띄운다: **"아직 댓글이 안 달린 힘든 구절 N개 · 닫으면 더 이상 댓글을 달 수 없습니다"**. 관리자가 그래도 진행을 선택하면 그대로 닫는다(강제 차단이 아니라 확인 한 번 더). v2까지는 이 경고를 `reflection_text is null` 카운트로 설계했으나, 4.3.1절 정정에 따라 "댓글(reply) 0개" 카운트로 바뀌었다.

---

## 5. 새로 만들 파일 목록

| 파일 | 역할 | 단계 |
|---|---|---|
| `app/s/[id]/SessionSidebar.tsx` | 좌측 사이드바(책 정보/참여현황/논제 목차+스크롤스파이/공유버튼). 참여 현황은 `isMandatoryKind()`로 필터링하고, 선택 참여 kind(`difficult`/`choice`/`appendix`)의 목차 항목에는 "선택" 배지를 단다. `xl:` 미만에서 4.7절의 요약 바로 전환. | R1-b |
| `components/BookCover.tsx` | `cover_url` 있으면 이미지, 없으면 제목 첫 글자 이니셜 플레이스홀더. 사이드바(큰 크기)와 요약 바(48px)/`/`(회차 목록) 양쪽에서 크기 prop만 다르게 재사용. | R1-b |
| `app/icon.svg` | 파비콘. 배경 `#F2CB66`, 흰색 "내" 한 글자. (문서화만 — 실제 파일은 구현 턴에서 제작) | R1-b |
| `app/s/[id]/FreeView.tsx` | `TopicPanel.tsx`에서 분리, 로직 변경 없음 + 하단 `ReplyThread label="의견 남기기"` 추가. | R1-c |
| `app/s/[id]/ExcerptView.tsx` | `TopicPanel.tsx`에서 분리 + 미작성자 회색 카드로 전환 + `ReplyThread label="사유 더하기"` 재사용(기존 표현 유지, "의견 남기기"로 바꾸지 않음). | R1-c |
| `app/s/[id]/DifficultView.tsx` | 선택 참여 — 작성자만 나열, 없으면 "내 구절 추가하기" 버튼만. `quote_text` 입력 + `quote_reason` 입력(라벨 "저는 이리 생각했는데…", 별도 2단계 필드 없음, v3 정정) + `ReplyThread`를 `label="같이 생각하니…"`(원문 그대로, v4 정정), KST 게이트 적용 상태로 재사용. 게이트가 닫혀 있으면 댓글 입력창 대신 "모임 당일부터 작성할 수 있습니다" 안내를 흐리게 표시. | R1-c |
| `app/s/[id]/ChoiceView.tsx` | 신규. 7절 참고. `ReplyThread label="의견 남기기"`. | R1-c |
| `app/s/[id]/AppendixView.tsx` | 진입 제약 없음, 1인 다건. "내 글 목록"(각각 수정/삭제) + "새로 추가", 제목 입력 필드, `ReplyThread label="의견 남기기"` 재사용(게이트 없음). | R1-c |
| `components/ReplyThread.tsx` | `TopicPanel.tsx`의 `ReplyRow`/`ReplyComposer`를 일반화. `answerId`/`replies`/`canWrite`/`currentMemberId`/`isAdmin`/`openEditorKey`(4.2절)/`label`(필수 prop, 기본값 없음 — 호출부가 매번 명시, `DECISIONS.md` "R1: 논제 유형별 reply 레이블 정책" 참고)/`gate`(선택, difficult에서만 KST 게이트 상태+안내문구 전달)를 props로 받아 5개 View 전부가 공용으로 쓴다. | R1-c |

---

## 6. R1 확정 결정 사항 (v1의 "질문" 7개 + 신규 항목에 대한 답)

1. **컬럼 재사용 + 리네임**: `excerpt_text`→`quote_text`, `excerpt_reason`→`quote_reason`으로 `RENAME COLUMN`. `excerpt`/`difficult`가 공유. 전용 컬럼(`difficult_text` 등)은 만들지 않는다. **[v3 정정]** `reflection_text`/`reflection_updated_at`은 만들지 않기로 바뀌었다 — 실제 원문 확인 결과 difficult의 "같이 생각하니…"는 별도 필드가 아니라 reply 목록이었다(4.3.1절).
2. **UNIQUE 제약을 제거하지 않고 slot 컬럼으로 전환**: `answers`에 `slot smallint not null default 0` 추가, `UNIQUE(topic_id, member_id, slot)`으로 대체. `free`/`excerpt`/`difficult`/`choice`는 항상 `slot=0`(기존 "1인 1답변"과 동일한 효과가 DB 레벨에서 계속 강제됨), `appendix`만 `slot`을 늘려가며 다건을 허용한다. DB 제약을 최후 방어선으로 유지하는 이유는 Codex/Gemini CLI 등 여러 도구가 이 저장소를 함께 수정하므로 Server Action의 검사만으로는 리팩터링 중 조용히 사라질 위험이 있기 때문 — v1의 "UNIQUE 완전 제거" 안에 있던 롤백 위험(8절)이 이 방식으로 대부분 해소된다.
3. **참여 현황 집계에서 `difficult`/`choice`/`appendix` 제외**: `isMandatoryKind()`는 `free`/`excerpt`만 `true`. 사이드바 목차에서 선택 참여 kind에 "선택" 배지를 달아 왜 분모에서 빠졌는지 시각적으로 드러낸다.
4. **`session.status==='open'` 단일 규칙 유지**, 대신 관리자 화면에 안전장치 추가(4.10절: closed 전환 시 성찰 미작성 인원 경고). `DECISIONS.md`에 "다음 회차를 열기 전까지 이전 회차를 닫지 않는다"를 운영 원칙으로 기록.
5. **이관 파서 확장은 범위 안**: choice/difficult/appendix까지 kind 판정 확장(4.8절). **difficult의 참여자별 줄 형식은 실제 원문 2건으로 확정**했다(이름 줄+"힘든 구절" 라벨 두 줄, "저는 이리 생각했는데…"/"같이 생각하니…" 고정 라벨, 4.3.1·4.8절). `appendix`의 원문 구조만 아직 확인되지 않아 잠정 규칙으로 남아 있다(9절).
6. **파비콘은 히어로 이미지 크롭이 아니라 `app/icon.svg` 신규 제작**(배경 `#F2CB66`, 흰 "내"자, 4.4절).
7. **가로 요약 바에 논제 목차 유지**(접힌 아코디언), 표지는 48px 썸네일(4.7절).
8. **(신규) `choice` 승격**: 스키마만이 아니라 정식 UI(`ChoiceView`, 7절)를 갖춘 5번째 kind로 구현.
9. **(신규) `votes` 테이블 drop**: 입장(`choice`)과 근거(`body`)가 항상 함께 쓰이고 함께 보이므로 `answers.choice`로 합친다. 현재 `votes`는 0행이라 무손실(1.4절에서 라이브 DB로 직접 확인).

## 7. `ChoiceView.tsx` 상세 설계

- **상단 집계**: 가로 스택 막대(선택지별 비율) + 선택지별 인원수 + 그 진영에 속한 이름 나열.
- **입장 버튼 줄**: "나는 {선택지}" 버튼들. 클릭 시 `upsertChoiceAction`으로 **즉시 저장**(별도 저장 버튼 없음 — `StarRating`과 동일 패턴). 이미 고른 값은 눌린 상태(강조 스타일)로 표시, 다시 다른 버튼을 누르면 값이 바뀐다.
- **진영별 열**: 선택지 2개면 데스크톱 2열, 3개 이상이면 3열 그리드. 각 열에 그 입장을 고른 사람들의 근거 카드(`body`).
- 근거는 **선택 입력** — 입장만 밝히고 근거를 안 써도 그 사람은 집계와 진영 목록에 나타난다(근거 카드에는 "근거를 남기지 않았습니다" 같은 옅은 안내).
- 선택 참여이므로 **미작성자 회색 카드를 만들지 않는다** — 애초에 입장을 안 밝힌 사람은 집계·목록 어디에도 안 나온다.
- 각 근거 카드 하단에 `ReplyThread` 재사용("의견 남기기").
- 아무도 입장을 밝히지 않은 초기 상태: "아직 아무도 입장을 밝히지 않았습니다" 안내 + 입장 버튼 줄만 표시(집계 막대/진영 열은 생략).
- `topics.choice_options`(신규 컬럼, `docs/SCHEMA.md` 참고)를 선택지 원본으로 쓴다 — 관리자가 "찬성/반대" 대신 "A안/B안" 등으로 바꿔도 이 화면은 그대로 동작.

## 8. 데이터 손실 위험 (v1 대비 갱신)

v1에서 "중간" 위험으로 표시했던 `UNIQUE(topic_id, member_id)` 제거 건은 **slot 설계로 대부분 해소**됐다 — 이유와 잔여 위험을 아래에 정리한다.

1. **`answers_topic_id_member_id_key` → `answers_topic_member_slot_key` 전환 (위험도: 낮음, v1의 "중간"에서 하향)**
   - 기존 행은 전부 `(topic_id, member_id)`가 유니크했으므로, `slot` 컬럼이 기본값 `0`으로 채워져도 새 3컬럼 유니크 제약(`topic_id, member_id, slot`)을 위반할 수 없다 — **마이그레이션 시점에는 실패할 수 없는 안전한 전환**이다.
   - 이후로도 `free`/`excerpt`/`difficult`/`choice`는 계속 DB가 "1인 1답변"을 강제한다(Server Action 검사가 실수로 빠져도 DB가 막아준다) — v1 초안이 가졌던 "DB 안전망이 완전히 사라진다"는 위험 자체가 사라졌다.
   - 남는 위험은 `appendix`에 한정된다: 롤백 시(구 2컬럼 제약으로 되돌릴 때) `appendix` 논제에 실제로 `slot > 0`인 다건 게시물이 쌓여 있다면, 그중 하나만 남기고 나머지를 버리는 판단이 필요하다 — 이 판단 자체는 여전히 사람이 해야 한다(`docs/SCHEMA.md` "부록: R1-a 롤백 절차" 참고).
2. **`excerpt_text`→`quote_text`, `excerpt_reason`→`quote_reason` 리네임 (위험도: 낮음, 신규 항목)** — `RENAME COLUMN`은 메타데이터만 바뀌는 즉시 연산이라 값 손실은 없다. 다만 **가용성 위험**이 있다: 리네임 이후 아직 새 컬럼명을 쓰지 않는 구 코드가 실행 중이면 그 요청은 즉시 실패한다(데이터 손실이 아니라 일시적 쓰기/조회 오류) — 2절의 "R1-a/R1-c 배포 간극" 주의사항으로 대응.
3. **`votes` 테이블 drop (위험도: 없음)** — 현재 0행(라이브 DB 직접 확인). 롤백은 `0001_init_schema.sql`의 원본 `CREATE TABLE votes`를 그대로 재실행하면 되고,애초에 지울 데이터가 없었으므로 무손실.
4. **신규 컬럼 추가(`answers.title`/`choice`/`slot`, `topics.choice_options`) (위험도: 낮음)** — 전부 nullable 또는 기본값이 있는 `ADD COLUMN`이라 기존 행에 영향 없음. 롤백(`DROP COLUMN`)은 그 시점에 값이 채워져 있다면 그 필드만 손실(기존과 동일한 원칙). **[v3 정정]** `reflection_text`/`reflection_updated_at`은 애초에 만들지 않으므로(4.3.1절) 이 목록에서 제외.
5. **`topics.kind`/`topic_template_items.kind` CHECK 제약 확장 (위험도: 없음)** — 값 추가만, 기존 값 제한 완화.
6. **실사용 데이터 존재 시점의 적용** — 현재 라이브 DB는 시드뿐이지만 R1-a 실제 적용 시점엔 실데이터가 있을 수 있다. 위 1~5가 전부 개별적으로는 안전해도, **적용 전 백업(Supabase 백업 또는 `pg_dump`) 없이 진행하지 않는다**는 원칙은 v1과 동일하게 유지한다.

## 9. 남은 확인 필요 사항 (구현 착수를 막지는 않음)

- **[v3: difficult는 해소됨]** 실제 원문 2건(사용자 제공)으로 difficult의 참여자별 줄 형식을 확정했다(4.3.1·4.8절) — 더 이상 잠정 규칙이 아니다.
- **[남음]** `appendix` 논제의 원문 구조(제목을 어떤 표기로 구분하는지, 1인 다건일 때 문서에서 어떻게 나뉘는지)는 아직 사용자가 제공한 확인 사항에 없어 잠정 규칙(4.8절: `free`와 동일하게 `NAME_COLON` 한 줄 = 답변 1개, `title`은 `null`)으로 남아 있다. 실제 과거 문서 샘플 1건만 있으면 확정 가능 — 없어도 잠정 규칙으로 구현 착수 가능(파서 미리보기가 최종 방어선이므로).
