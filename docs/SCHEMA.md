# SCHEMA.md

독서토론 앱의 Postgres(Supabase) 스키마 명세. 실제 마이그레이션은 `supabase/migrations/`에 있다.

**[R1]** `topics.kind`가 5종(`free`/`excerpt`/`difficult`/`choice`/`appendix`)으로 늘었고, `answers` 컬럼 리네임/추가 + `slot` 기반 유니크 전환, `votes` 테이블 제거가 있었다 — `supabase/migrations/0003_r1a_schema.sql`. **[R1-e]** `replies.choice` 컬럼 추가 — `supabase/migrations/0004_choice_reply_tag.sql`. **[R1-d]** R1-e부터 미사용이던 `answers.choice` 컬럼 drop — `supabase/migrations/0005_drop_answers_choice.sql`. **[R1-f]** `ratings.stars`를 `integer`에서 `numeric(2,1)`(0.5 단위)로 변경 — `supabase/migrations/0007_ratings_half_star.sql`(`0006_all_members_admin.sql`은 role 통일 마이그레이션, R1-f와 무관). **이 세 마이그레이션(0005/0006/0007)은 전부 아직 프로덕션에 미적용 — 0003/0004와 달리 파일만 작성됐고 라이브 DB에 실행되지 않았다. 적용 전 이 문서의 정의를 신뢰하려면 실제 라이브 스키마를 다시 확인할 것**. 결정 배경(왜 `choice`를 정식 kind로 승격했는지, 왜 `slot` 설계를 택했는지 등)은 `docs/DECISIONS.md` "R1" 절 참고 — 이 문서는 "무엇"만 다룬다. `0003` 롤백 절차는 이 문서 맨 끝 "부록: R1-a 롤백 절차" 참고.

DB 접근 원칙(자세한 내용은 SECURITY.md 참고): 전 테이블 `ENABLE ROW LEVEL SECURITY`, 정책은 만들지 않는다(전면 거부). 모든 읽기/쓰기는 `lib/supabase/server.ts`의 service-role 클라이언트를 통해 Next.js 서버에서만 일어난다. **[R1에서도 변경 없음]** — `0003` 마이그레이션은 컬럼 추가/리네임과 `votes` drop만 하며 RLS 관련 statement는 포함하지 않는다.

## 관계도 (텍스트)

```
books (1) ──< sessions (1) ──< topics (1) ──< answers (1) ──< replies
                  └──< ratings
members (1) ──< answers / replies / ratings  (author)
members (1) ──< sessions.selector_member_id / host_member_id (역할)
```

- `sessions`는 `books`를 정확히 1권 참조한다(책 1권 = 회차 1개, 재독은 새 `books` 행 + 새 `sessions` 행으로 처리).
- `topics`는 `sessions`에 속하고 `order_no`로 정렬된다. **[R1]** `kind`가 5종(`free`/`excerpt`/`difficult`/`choice`/`appendix`)으로 늘었다 — 이전에는 3종(`choice`는 스키마만 존재, 전용 UI 없음).
- **[R1]** `answers`는 이전에 `(topic_id, member_id)`가 유니크했지만(DB 제약), R1부터는 **`slot` 컬럼이 추가되어 `(topic_id, member_id, slot)`이 유니크**하다. `free`/`difficult`/`choice`는 항상 `slot = 0`(즉 이전과 동일하게 1인 1답변이 DB 레벨에서 계속 강제된다), `appendix`는 한 사람이 여러 `slot`(0, 1, 2, …)을 가질 수 있다. **[R1-f]** `excerpt`도 `appendix`와 같은 방식으로 다건이 허용된다(`upsertExcerptAction`) — `difficult`만 아직 `slot=0` 단건으로 남아 있다(`docs/OPEN_QUESTIONS.md` 14번).
- `replies`는 `topic`이 아니라 `answer`에 달린다. **[R1]** 이전에는 `kind = 'excerpt'`인 answer에만 reply를 달 수 있었지만, R1부터는 **모든 kind의 answer에 reply를 달 수 있다.** UI 레이블은 kind마다 다르다(하나로 통일하지 않는다) — `excerpt`는 "사유 더하기"(기존 유지), `difficult`는 "같이 생각해 보니"(모임 당일 KST 0시 이후로 게이트 적용), `free`/`choice`/`appendix`는 "의견 남기기"(신규 유형이라 일반화한 문구). 자세한 근거는 `DECISIONS.md` "R1: 논제 유형별 reply 레이블 정책" 참고.
- `ratings`는 논제 1번 화면에 붙어 있지만 실제로는 `session_id` 단위. **[R1에서도 변경 없음]**
- **[R1]** `votes` 테이블은 **제거**됐다. 입장(`choice`)과 근거(`body`)를 `answers` 한 행에 합쳐서 쓴다 — v1까지는 `choice` 논제 전용 집계 테이블로 존재했으나, 실제로 쓰지 않은 채(0행) `choice`가 정식 kind로 승격되면서 역할이 `answers.choice`로 흡수됐다.

## 테이블 정의

### books

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| title | text | not null | |
| author | text | | |
| cover_url | text | | R1 사이드바 책 표지에 사용. 없으면 UI가 제목 이니셜 플레이스홀더로 대체(스키마 변경 아님). |
| memo | text | | |
| created_at | timestamptz | not null default now() | |

### members

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| id | uuid | PK | |
| name | text | not null, unique | |
| aliases | text[] | not null default '{}' | |
| role | text | not null, check in ('member','admin') | |
| is_active | boolean | not null default true | |
| pin_hash | text | nullable | |
| created_at | timestamptz | not null default now() | |

### sessions

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| id | uuid | PK | |
| book_id | uuid | FK -> books.id, not null | |
| meets_at | date | not null | 모임일. **[R1]** difficult 논제의 "같이 생각해 보니" 댓글(reply)이 이 값을 KST 기준 게이트로 쓴다(아래 절 참고). |
| deadline_at | date | | |
| selector_member_id | uuid | FK -> members.id, nullable | |
| host_member_id | uuid | FK -> members.id, nullable | |
| status | text | not null default 'draft', check in ('draft','open','closed') | ★ 쓰기 권한의 단일 기준. **[R1]** difficult 논제에 대한 reply("같이 생각해 보니")도 예외 없이 이 규칙을 따른다 — 대신 회차를 `closed`로 바꾸기 직전 관리자 화면이 "댓글 없는 힘든 구절 N개" 경고를 띄운다(`app/admin/sessions/actions.ts`의 `countUnrepliedDifficultAnswersAction`, R1-c2에서 구현 완료). `DECISIONS.md`에 "다음 회차를 열기 전까지 이전 회차를 닫지 않는다"를 운영 원칙으로 기록. |
| blind_enabled | boolean | not null default false | |
| created_at | timestamptz | not null default now() | |

### topics

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| id | uuid | PK | |
| session_id | uuid | FK -> sessions.id, not null | |
| order_no | integer | not null | |
| kind | text | not null, **[R1] check in ('free','excerpt','choice','difficult','appendix')** | ★ UI/파서 분기의 핵심. 5종 전부 정식 UI를 갖는다. |
| title | text | not null | |
| body | text | | |
| assigned_member_id | uuid | FK -> members.id, nullable | |
| has_rating | boolean | not null default false | |
| **choice_options** | **text[]** | **[R1 신규] not null default '{찬성,반대}'** | `kind='choice'`인 논제의 선택지 목록. 관리자가 "찬성/반대" 대신 다른 값으로 바꿀 수 있다. 다른 kind에서는 사용하지 않음(기본값이 들어있어도 무해). |
| created_at | timestamptz | not null default now() | |

제약: `UNIQUE (session_id, order_no)`.

**kind별 참여 성격**

| kind | 참여 방식 | 미작성자 UI |
|---|---|---|
| `free` | 전원 참여 전제 | 회색 카드로 표시 |
| `excerpt` | 전원 참여 전제 | 회색 카드로 표시 |
| `difficult` | 선택 참여 | 카드 자체를 만들지 않음 — 작성자만 나열, 없으면 "내 구절 추가하기" 버튼만 |
| `choice` | 선택 참여 | 카드 자체를 만들지 않음 — 입장을 밝힌 사람만 집계/진영 열에 나타남 |
| `appendix` | 선택 참여, 제한 없음(1인 다건 허용) | 카드 자체를 만들지 않음 |

"참여 현황"(`N명 중 M명 작성`) 집계는 `free`/`excerpt` 논제만 분모로 삼는다 — `difficult`/`choice`/`appendix`는 선택 참여이므로 제외한다(`lib/topics.ts`의 `isMandatoryKind()`).

### answers

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| id | uuid | PK | |
| topic_id | uuid | FK -> topics.id, not null | |
| member_id | uuid | FK -> members.id, not null | |
| body | text | | free: 소감 / **[R1-e]** choice: 게시물(발제자가 올리는 구체적인 논제/장면) 본문 / appendix: 본문 |
| **quote_text** | text | | **[R1] `excerpt_text`를 리네임.** excerpt: 발췌 원문 / difficult: 힘든 구절. 두 kind가 공유. |
| **quote_reason** | text | | **[R1] `excerpt_reason`을 리네임.** excerpt: 고른 이유 / difficult: 그 이유(입력 라벨 "저는 이리 생각했는데…"). |
| **title** | text | **[R1 신규]** | appendix 전용: 게시물 짧은 제목(선택). 다른 kind는 항상 null. |
| **slot** | smallint | **[R1 신규] not null default 0** | appendix가 1인 다건을 가질 때 순번(0, 1, 2, …). 다른 kind는 항상 0. |
| submitted_at | timestamptz | | |
| updated_at | timestamptz | | |

**[R1] 제약 변경**: 이전에는 `UNIQUE (topic_id, member_id)`로 "논제당 참여자당 답변 1개"를 DB가 강제했다. R1부터는 `UNIQUE (topic_id, member_id, slot)`(제약명 `answers_topic_member_slot_key`)로 바뀐다:

- `topic.kind !== 'appendix'`인 경우: `slot`은 항상 `0`으로 고정 — 실질적으로 이전과 동일하게 **DB가 계속 1인 1답변을 강제한다.** `app/s/[id]/actions.ts`의 `upsertAnswerAction`이 `upsert(..., {onConflict: "topic_id,member_id,slot"})`로 이 제약을 그대로 충돌 대상으로 쓴다(존재 여부를 먼저 조회하지 않는다 — DB가 원자적으로 처리). **[R1-e]** `choice`는 이 제약과 별개로 "논제당 answer 1개(작성자 무관)"까지 서버 액션(`upsertChoiceTopicAction`)이 애플리케이션 레벨에서 추가로 강제한다 — DB 유니크 제약은 여전히 "참여자당"이라 발제자 아닌 다른 참여자는 애초에 이 논제에 `answers` 행을 만들지 않는다.
- `topic.kind === 'appendix'`인 경우: 새 게시물을 만들 때 `slot = coalesce(max(slot)+1, 0)`(같은 `topic_id, member_id` 안에서 계산)로 insert(`upsertAppendixAction`). 동시 제출 경합으로 unique 위반이 나면 slot을 재계산해 1회 재시도한다. 기존 글 수정은 `slot` 계산 없이 `answerId`+`member_id` 이중 조건으로 소유권을 재확인한 뒤 update한다(SECURITY.md 참고).

CHECK 제약(애플리케이션 레벨과 별개로 DB에도 두는 것을 권장): `kind='excerpt'` 또는 `kind='difficult'`인 answer는 `quote_text`가 비면 "미작성", `kind='free'`인 answer는 `body`가 비면 "미작성". **[R1-e]** `kind='choice'`도 이제 `body`(게시물 본문) 기준으로 판정한다 — v1(R1-c1)의 "`choice`가 `null`이면 미작성" 규칙은 입장을 더 이상 `answers`에 두지 않으므로 폐기됐다. `kind='appendix'`는 "미작성" 개념이 없다(있으면 목록에, 없으면 없음). 이 판정은 `lib/topics.ts`의 `isAnswerComplete()` 한 곳에 모은다.

### replies

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| id | uuid | PK | |
| answer_id | uuid | FK -> answers.id, not null, **ON DELETE CASCADE** | |
| member_id | uuid | FK -> members.id, not null | |
| body | text | not null | **[R1]** kind마다 UI 레이블이 다르다(컬럼/의미는 동일) — `excerpt` "사유 더하기"(유지), `difficult` "같이 생각해 보니", `free`/`choice`/`appendix` "의견 남기기". `DECISIONS.md` "R1: 논제 유형별 reply 레이블 정책" 참고. **[R1-e]** `choice` reply는 근거가 선택 입력이라 빈 문자열(`""`)일 수 있다 — `not null` 제약은 유지하되 빈 문자열을 허용한다(다른 kind의 reply는 `upsertReplyAction`이 `body.trim()`이 비면 거부하므로 계속 비어 있을 수 없다). |
| **choice** | text | null, **[R1-e 신규]** | choice 전용: 이 reply가 어느 입장(`topics.choice_options`의 값 중 하나)에 대한 반응인지. 다른 kind는 항상 null. `answer_id`+`member_id`로 "게시물당 참여자 1 reply"를 서버 액션(`upsertChoiceReplyAction`)이 upsert로 지킨다(DB 유니크 제약은 없음 — 일반 reply와 같은 테이블을 공유해서, 다른 kind의 "여러 번 의견 남기기"를 막지 않기 위해). 마이그레이션: `supabase/migrations/0004_choice_reply_tag.sql`(적용됨). |
| created_at | timestamptz | not null default now() | |

정책: 본인 answer 삭제 시 하위 replies도 CASCADE 삭제. 본인 answer에 본인이 reply 허용. **[R1]** `kind != 'excerpt'`면 reply 금지하던 제한이 **삭제**됐다 — 이제 5종 전부의 answer에 reply를 달 수 있다. 이 검사는 원래도 Server Action(`upsertReplyAction`)에서 했으므로(트리거 없음) 조건 분기를 바꾸는 것만으로 반영된다 — 스키마 변경 없음. **[R1-e]** `choice`의 찬반 reply는 `upsertReplyAction`이 아니라 별도의 `upsertChoiceReplyAction`(choice 값 검증 + member 기준 upsert)이 처리한다.

### ratings / login_attempts / topic_templates

**[R1-f]** `ratings.stars`가 `integer check(between 1 and 5)`에서 `numeric(2,1) check(stars >= 0.5 and stars <= 5.0 and (stars*10) % 5 = 0)`로 바뀌어 0.5 단위 반점을 허용한다 — `supabase/migrations/0007_ratings_half_star.sql`. 기존 정수 값은 캐스팅으로 무손실 보존된다. `login_attempts`/`topic_templates`는 원본과 동일.

### votes — **[R1: 테이블 제거]**

이전에는 `choice` 논제 전용 집계 테이블이었다(`topic_id`, `member_id`, `choice`, `UNIQUE(topic_id, member_id)`). R1에서 `choice`가 정식 kind로 구현되면서, 입장과 근거를 한 행(`answers.choice` + `answers.body`)에 합치는 편이 "입장만 있음"/"근거만 있음" 상태를 양쪽 테이블에서 따로 다루지 않아도 되므로 이 테이블은 **drop**한다. 마이그레이션 작성 시점 기준 라이브 DB에서 0행으로 직접 확인했다 — 무손실 제거.

### topic_template_items — kind 컬럼 갱신

| 컬럼(topic_template_items) | 타입 | 제약 | 비고 |
|---|---|---|---|
| kind | text | not null, **[R1] check in ('free','excerpt','choice','difficult','appendix')** | |

`choice_options`는 `topic_template_items`에는 추가하지 않는다 — 템플릿에서 `choice` 항목이 회차에 적용되면 `topics.choice_options`는 DB 기본값(`{찬성,반대}`)을 받고, 필요시 관리자가 회차별로 논제 수정 화면에서 바꾼다. 그 외 컬럼 정의는 원본과 동일.

## `topics.kind`에 따른 answers/replies 사용 방식 **[R1로 전면 갱신]**

| kind | answers 사용 | replies 사용 | 특수 컬럼 |
|---|---|---|---|
| `free` | 참여자당 1개(`slot=0`), `body`만 사용 | 모든 answer에 reply 가능, 레이블 **"의견 남기기"** | `quote_text`/`quote_reason`/`title`는 항상 null |
| `excerpt` | **[R1-f]** 참여자당 여러 개 허용(`slot=0,1,2,…`, `upsertExcerptAction`), `quote_text` + `quote_reason` 사용 | 모든 answer에 reply 가능, 레이블 **"사유 더하기"**(기존 유지) | `body`/`title`는 사용 안 함 |
| `difficult` | 참여자당 최대 1개(`slot=0`, 선택 참여). `quote_text`(힘든 구절)+`quote_reason`(그 이유, 입력 라벨 "저는 이리 생각했는데…") | 모든 answer에 reply 가능, 레이블 **"같이 생각해 보니"** — 단 모임일 KST 0시부터 | `body`/`title`는 사용 안 함 |
| `choice` | **[R1-e]** 논제당 최대 1개(`slot=0`) — 참여자 아무나가 아니라 **먼저 올린 사람(발제자)만**. `body`(게시물 본문)만 사용 | 그 1개 answer에 참여자 전원(발제자 포함)이 각자 1개씩 reply, 찬반은 `replies.choice` + 이유는 `replies.body`(선택 입력) | `quote_text`/`quote_reason`/`title`는 사용 안 함(찬반 입장은 `answers`가 아니라 `replies.choice`에 있다, 아래 "choice 논제 상세" 참고) |
| `appendix` | 참여자당 여러 개 허용(`slot=0,1,2,…`, 선택 참여, 제한 없음), `title`(짧은 제목, 선택) + `body`(본문) 사용 | 모든 answer에 reply 가능, 레이블 **"의견 남기기"** | `quote_text`/`quote_reason`는 사용 안 함 |

레이블 정책의 근거는 `DECISIONS.md` "R1: 논제 유형별 reply 레이블 정책" 참고 — 원문 표현이 있는 kind(`excerpt`/`difficult`)는 그대로 쓰고, 신규 유형(`free`/`choice`/`appendix`)만 일반화한 "의견 남기기"를 쓴다.

이 표는 SPEC.md의 화면별 분기와 반드시 일치해야 한다. **이관 파서(`lib/admin/importParser.ts`)는 R1-c2에서 `free`/`excerpt`/`difficult` 3종을 구조적으로 판정하도록 확장됐다(우선순위: `choice` > `excerpt` > `difficult` > `appendix` > `free`, REFACTOR_PLAN.md 4.8절). `choice`/`appendix`는 논제 kind는 판정하되 구조 파싱은 하지 않고, 논제 원문 전체를 "미분류 텍스트"로 보존해 관리자가 미리보기 화면에서 수동으로 처리한다.**

## difficult 댓글("같이 생각해 보니") 게이팅 — Asia/Seoul 기준

- `difficult` kind의 answer에 달리는 reply는 **모임 당일 0시(Asia/Seoul) 이후**에만 작성할 수 있다. Vercel 서버 런타임은 UTC로 동작하므로 반드시 KST로 변환한 뒤 비교한다.
- 판정 대상: 해당 answer가 속한 `topic.session_id`의 `sessions.meets_at`(date).
- 판정: "지금 시각을 KST로 변환했을 때의 날짜" ≥ `meets_at`.
- 구현 위치: `lib/topics.ts`의 `isPostMeetingOpen(meetsAt: string): boolean` — 클라이언트(`ReplyThread`의 `gate` prop, 입력창 대신 안내 문구 표시)와 서버(`upsertReplyAction`의 실제 쓰기 거부) 양쪽이 재사용한다. 클라이언트 표시만으로 막지 않는다(SECURITY.md 원칙) — `gate` prop을 우회해 액션을 직접 호출해도 서버가 독립적으로 거부한다.
- 다른 4kind(`free`/`excerpt`/`choice`/`appendix`)의 reply는 이 게이트가 없다 — `session.status==='open'`이면 언제든 작성 가능.
- 이 게이팅과 `sessions.status === 'open'` 규칙은 **AND**로 결합한다 — 두 조건을 모두 만족해야 difficult 댓글을 쓸 수 있다(관리자도 예외 없음). 대신 관리자 화면이 `closed` 전환 직전 "댓글 없는 힘든 구절 N개" 경고를 띄운다(`countUnrepliedDifficultAnswersAction`, R1-c2에서 구현 완료). `DECISIONS.md`에 "다음 회차를 열기 전까지 이전 회차를 닫지 않는다"를 운영 원칙으로 기록.
- 이관 파서로 과거 회차를 백필할 때는 이 게이트를 적용하지 않는다(`confirmImportAction`의 direct insert는 `requireAdmin()`만 통과하면 되고, 라이브 쓰기 게이트를 거치지 않는다).

## `choice` 논제 상세 **[R1-e: 2단 구조로 전환, `docs/DECISIONS.md` "R1-e" 참고]**

- **상태 1(answers 행 없음)**: 참여자 누구나 "논제 올리기"로 게시물(구체적인 논제/장면, `answers.body`)을 올릴 수 있다. **[R1-f]** 게시물이 없어도 각자 입장(찬반)만 먼저 밝힐 수 있다 — 그 순간 `body=null`인 "앵커" `answers` 행이 생긴다(`upsertChoiceStanceAction`). "게시물이 아직 없다"의 실제 판정 기준은 "answers 행이 없다"가 아니라 "**있어도 `body`가 비어 있다**"이다.
- **상태 2(answers 행 1개, body 있음/없음 모두)**: 그 행을 상단에 보여준다. `body`가 비어 있으면(사전 입장만 있는 앵커) "아직 논제 게시물이 없습니다" 안내와 함께 누구든 canWrite면 처음 채워 넣을 수 있고, 그 순간 채운 사람이 작성자(`member_id`)로 확정된다. `body`가 이미 채워져 있으면 원 작성자만 수정할 수 있다(`upsertChoiceTopicAction`이 소유권을 확인). 어느 경우든 새로운 별도 게시물/앵커를 더 만들 수는 없다(같은 액션이 해당 `topic_id`에 이미 `answers` 행이 있는지 먼저 확인, 있으면 insert 대신 그 행을 재사용).
- 찬반 입장은 `topics.choice_options`(기본 `{찬성,반대}`) 중 하나를 자유 텍스트로 그 게시물에 대한 `replies.choice`에 저장한다(`upsertChoiceReplyAction`). DB 레벨 CHECK/FK로 `choice_options` 원소인지 강제하지 않지만(관리자가 선택지를 바꾸면 기존 응답과 어긋나는 edge case를 다뤄야 해서, 참여자 규모에 비해 과설계), 서버 액션이 매 호출마다 `topics.choice_options.includes(choice)`로 검증한다.
- 이유(`replies.body`)는 선택 입력 — "나는 {선택지}" 버튼 클릭은 그 즉시 입장만 반영하고(별 저장 없음, 별점과 같은 패턴), 이유는 별도 "이유 남기기/수정" 편집기로 같은 reply 행에 채운다.
- 한 사람당 한 게시물에 reply는 1개뿐이다 — `upsertChoiceReplyAction`이 `answer_id`+`member_id`로 기존 reply를 먼저 조회해 있으면 update, 없으면 insert한다.
- 화면 동작(`app/s/[id]/ChoiceView.tsx`)은 게시물 아래 집계 막대 + 진영별 이유 카드 나열이 핵심이며, 이유가 있는 reply만 카드로 보인다.
- **[R1-d]** R1-e가 미사용으로 남겨뒀던 `answers.choice` 컬럼은 `supabase/migrations/0005_drop_answers_choice.sql`로 drop했다 — 이 컬럼을 읽거나 쓰는 코드가 어디에도 없음을 확인한 뒤 진행(찬반 입장은 전부 `replies.choice`에 있다). 위 answers 테이블 정의에는 이미 반영됐다.

## 인덱스 및 성능 메모

**[R1에서 변경 없음]** — 트래픽이 극히 적어(월 1회, 5~8명) 인덱스를 과설계하지 않는다는 원칙 그대로. `slot` 전환은 유니크 제약의 "모양"만 바뀌는 것이라 `answers(topic_id)`의 FK 기본 인덱스로 조회 성능은 충분하다.

## 부록: R1-a 롤백 절차

`supabase/migrations/0003_r1a_schema.sql`은 적용됐다(위 "실사용 데이터 존재 시점" 참고). 아래는 **적용 후 실사용 데이터가 쌓인 뒤** 되돌려야 할 경우의 절차다(옛 `docs/MIGRATION_R1.md` 초안에서 옮김). `begin`/`commit`으로 묶여 있어 적용 도중 실패하면 자동 롤백된다(부분 적용 상태 없음) — 아래는 그와 별개로 이미 커밋된 마이그레이션을 나중에 되돌리는 경우다.

```sql
begin;

-- votes 테이블 복구(0001_init_schema.sql의 원본 정의 재사용)
create table votes (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references topics(id),
  member_id uuid not null references members(id),
  choice text not null,
  unique (topic_id, member_id)
);
alter table votes enable row level security;
-- ⚠ 이 시점까지 answers.choice에 실제로 쌓인 데이터는 이 새 빈 votes 테이블로
-- 자동 이관되지 않는다 — 백필이 필요하면 별도 스크립트로 사람이 판단해 옮긴다.

-- slot 기반 유니크를 (topic_id, member_id) 2컬럼으로 되돌림
-- ⚠ appendix 논제에 slot > 0인 다건 게시물이 실제로 쌓여 있으면 아래가 제약
-- 위반으로 실패한다. 먼저 위반 여부를 확인:
--   select topic_id, member_id, count(*) from answers
--   group by topic_id, member_id having count(*) > 1;
-- 위반 행이 있으면 appendix 게시물 중 어느 것을 남길지 사람이 판단해야 한다.
alter table answers drop constraint answers_topic_member_slot_key;
alter table answers add constraint answers_topic_id_member_id_key unique (topic_id, member_id);
alter table answers drop column slot;

-- 신규 컬럼 제거 — ⚠ 데이터 손실. title/choice/choice_options에 실제로 입력된
-- 내용이 있다면 이 시점에 전부 사라진다. 지우기 전에 반드시 백업:
--   create table answers_backup_r1 as
--   select id, title, choice from answers where title is not null or choice is not null;
-- ⚠ [R1-d] 0005_drop_answers_choice.sql이 이미 적용됐다면 answers.choice는
-- 이 시점에 이미 없다 — 아래 줄을 건너뛴다(이미 없는 컬럼을 drop하면 에러).
alter table topics drop column choice_options;
alter table answers drop column choice; -- 0005 적용 전이면 실행, 적용 후면 스킵
alter table answers drop column title;
alter table replies drop column choice; -- 0004_choice_reply_tag.sql 롤백분

-- 컬럼명 원복 — 값 손실 없음(메타데이터 연산)
alter table answers rename column quote_text to excerpt_text;
alter table answers rename column quote_reason to excerpt_reason;

-- kind CHECK 제약 축소
-- ⚠ 이 시점에 kind가 difficult/choice/appendix인 topics/topic_template_items
-- 행이 남아 있으면 이 ALTER 자체가 제약 위반으로 실패한다. 먼저 그 행들을
-- 지우거나 kind를 free/excerpt로 바꿔야 하는데, 어느 쪽이든 "그 kind로 쓰인
-- 논제들이 free/excerpt 의미로 재해석된다"는 실질적 데이터 손실이다.
alter table topic_template_items drop constraint topic_template_items_kind_check;
alter table topic_template_items add constraint topic_template_items_kind_check
  check (kind in ('free', 'excerpt', 'choice'));

alter table topics drop constraint topics_kind_check;
alter table topics add constraint topics_kind_check
  check (kind in ('free', 'excerpt', 'choice'));

commit;
```

사람 판단이 필요한 지점은 두 곳뿐이다: **(a)** `appendix` 논제에 다건 게시물이 실제로 쌓인 뒤의 slot 롤백, **(b)** 신규 kind(`difficult`/`choice`/`appendix`)가 실제로 쓰인 뒤의 kind CHECK 축소. 둘 다 "새 기능이 실제로 쓰이기 전"이라는 좁은 창 안에서는 완전 무손실 롤백이 가능하다.
