# SCHEMA_R1_DRAFT.md — `docs/SCHEMA.md` 갱신안 (미적용 초안)

**이 문서는 초안이다.** 실제 `docs/SCHEMA.md`를 아직 이 내용으로 교체하지 않았다 — `docs/REFACTOR_PLAN.md`/`docs/MIGRATION_R1.md`와 함께 검토한 뒤, 구현 턴(R1-a)에서 `docs/SCHEMA.md`에 반영한다. 이 문서는 "R1-a 마이그레이션(`MIGRATION_R1.md`)이 적용된 이후의 스키마"를 기술한다. 원본 대비 변경된 부분에는 **[R1]** 표시를 달았다.

**v2 개정**: v1 초안은 `choice`를 "스키마만, UI 없음"으로 전제했으나, 과거 구글 문서 대부분에 실제로 "4. 찬반 논제"가 있었다는 사실이 확인되어 **`choice`는 R1에서 정식 5번째 kind로 구현한다.** 이 문서 전체를 그 전제로 다시 썼다.

**v3 정정**: v2는 difficult의 "2단계"를 위해 `answers.reflection_text`/`reflection_updated_at` 컬럼을 두는 설계였다. 사용자가 제공한 실제 과거 원문(힘든 구절 논제 2건)을 확인한 결과, "같이 생각하니…" 아래에는 별도 필드가 아니라 다른 참여자들의 이름+댓글이 나열되는 **reply 목록**이 있었다 — R1이 이미 모든 kind에 reply를 허용하기로 했으므로 기존 `replies` 테이블로 충분하다. **이 두 컬럼은 이번 초안에서 제거**했다. 이 문서 전체에서 관련 부분을 정정했다.

DB 접근 원칙(SECURITY.md 참고): 전 테이블 `ENABLE ROW LEVEL SECURITY`, 정책 0개(전면 거부). 모든 읽기/쓰기는 `lib/supabase/server.ts`의 service-role 클라이언트를 통해서만. **[R1에서도 변경 없음]**

## 관계도 (텍스트)

```
books (1) ──< sessions (1) ──< topics (1) ──< answers (1) ──< replies
                  └──< ratings
members (1) ──< answers / replies / ratings  (author)
members (1) ──< sessions.selector_member_id / host_member_id (역할)
```

- `sessions`는 `books`를 정확히 1권 참조한다.
- `topics`는 `sessions`에 속하고 `order_no`로 정렬된다. **[R1]** `kind`가 5종(`free`/`excerpt`/`difficult`/`choice`/`appendix`)으로 늘었다 — 이전에는 3종(`choice`는 스키마만).
- **[R1]** `answers`는 이전에 `(topic_id, member_id)`가 유니크했지만(DB 제약), R1부터는 **`slot` 컬럼이 추가되어 `(topic_id, member_id, slot)`이 유니크**하다. `free`/`excerpt`/`difficult`/`choice`는 항상 `slot = 0`(즉 이전과 동일하게 1인 1답변이 DB 레벨에서 계속 강제된다), `appendix`만 한 사람이 여러 `slot`(0, 1, 2, …)을 가질 수 있다.
- `replies`는 `topic`이 아니라 `answer`에 달린다. **[R1]** 이전에는 `kind = 'excerpt'`인 answer에만 reply를 달 수 있었지만, R1부터는 **모든 kind의 answer에 reply를 달 수 있다.** UI 레이블은 kind마다 다르다(하나로 통일하지 않는다) — `excerpt`는 "사유 더하기"(기존 유지), `difficult`는 "같이 생각하니…"(원문 그대로, KST 게이트 적용), `free`/`choice`/`appendix`는 "의견 남기기"(신규 유형이라 일반화한 문구). 자세한 근거는 `DECISIONS.md` "R1: 논제 유형별 reply 레이블 정책" 참고.
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
| meets_at | date | not null | 모임일. **[R1]** difficult 논제의 "같이 생각하니…" 댓글(reply)이 이 값을 KST 기준 게이트로 쓴다(아래 절 참고). |
| deadline_at | date | | |
| selector_member_id | uuid | FK -> members.id, nullable | |
| host_member_id | uuid | FK -> members.id, nullable | |
| status | text | not null default 'draft', check in ('draft','open','closed') | ★ 쓰기 권한의 단일 기준. **[R1]** difficult 논제에 대한 reply("같이 생각하니…")도 예외 없이 이 규칙을 따른다 — 대신 회차를 `closed`로 바꾸기 직전 관리자 화면이 "댓글 없는 힘든 구절 N개" 경고를 띄운다(REFACTOR_PLAN.md 4.10절). `DECISIONS.md`에 "다음 회차를 열기 전까지 이전 회차를 닫지 않는다"를 운영 원칙으로 기록. |
| blind_enabled | boolean | not null default false | |
| created_at | timestamptz | not null default now() | |

### topics

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| id | uuid | PK | |
| session_id | uuid | FK -> sessions.id, not null | |
| order_no | integer | not null | |
| kind | text | not null, **[R1] check in ('free','excerpt','choice','difficult','appendix')** | ★ UI/파서 분기의 핵심. 5종 전부 정식 UI를 갖는다(v1 초안과 달리 `choice`도 스키마만이 아니다). |
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
| body | text | | free: 소감 / choice: 근거(선택 입력) |
| **quote_text** | text | | **[R1] `excerpt_text`를 리네임.** excerpt: 발췌 원문 / difficult: 힘든 구절. 두 kind가 공유. |
| **quote_reason** | text | | **[R1] `excerpt_reason`을 리네임.** excerpt: 고른 이유 / difficult: 그 이유. |
| **title** | text | **[R1 신규]** | appendix 전용: 게시물 짧은 제목. 다른 kind는 항상 null. |
| **choice** | text | **[R1 신규]** | choice 전용: 이 사람이 고른 입장, `topics.choice_options`의 값 중 하나(자유 텍스트로 저장, DB 레벨에서 `choice_options` 원소인지 강제하지 않음 — 과설계 방지). 다른 kind는 항상 null. |
| **slot** | smallint | **[R1 신규] not null default 0** | appendix가 1인 다건을 가질 때 순번(0, 1, 2, …). 다른 kind는 항상 0. |
| submitted_at | timestamptz | | |
| updated_at | timestamptz | | |

**[R1] 제약 변경**: 이전에는 `UNIQUE (topic_id, member_id)`로 "논제당 참여자당 답변 1개"를 DB가 강제했다. R1부터는 `UNIQUE (topic_id, member_id, slot)`로 바뀐다:

- `topic.kind !== 'appendix'`인 경우: `slot`은 항상 `0`으로 고정 — 실질적으로 이전과 동일하게 **DB가 계속 1인 1답변을 강제한다.** `upsert(..., {onConflict: "topic_id,member_id,slot"})`로 기존 upsert 패턴을 그대로 유지할 수 있다.
- `topic.kind === 'appendix'`인 경우: 새 게시물을 만들 때 `slot = coalesce(max(slot)+1, 0)`(같은 `topic_id, member_id` 안에서 계산)로 insert. 동시 제출 경합으로 unique 위반이 나면 slot을 재계산해 1회 재시도한다.

CHECK 제약(애플리케이션 레벨과 별개로 DB에도 두는 것을 권장): `kind='excerpt'` 또는 `kind='difficult'`인 answer는 `quote_text`가 비면 "미작성", `kind='free'`인 answer는 `body`가 비면 "미작성", **[R1]** `kind='choice'`인 answer는 `choice`가 `null`이면 "미작성"(근거 `body`는 무관 — 입장만 밝혀도 완료로 본다)으로 간주. `kind='appendix'`는 "미작성" 개념이 없다(있으면 목록에, 없으면 없음). 이 판정은 `lib/topics.ts`의 `isAnswerComplete()` 한 곳에 모은다.

### replies

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| id | uuid | PK | |
| answer_id | uuid | FK -> answers.id, not null, **ON DELETE CASCADE** | |
| member_id | uuid | FK -> members.id, not null | |
| body | text | not null | **[R1]** kind마다 UI 레이블이 다르다(컬럼/의미는 동일) — `excerpt` "사유 더하기"(유지), `difficult` "같이 생각하니…"(원문 그대로), `free`/`choice`/`appendix` "의견 남기기". `DECISIONS.md` "R1: 논제 유형별 reply 레이블 정책" 참고. |
| created_at | timestamptz | not null default now() | |

정책: 본인 answer 삭제 시 하위 replies도 CASCADE 삭제. 본인 answer에 본인이 reply 허용. **[R1]** `kind != 'excerpt'`면 reply 금지하던 제한이 **삭제**됐다 — 이제 5종 전부의 answer에 reply를 달 수 있다. 이 검사는 원래도 Server Action에서 했으므로(트리거 없음) `upsertReplyAction`의 조건 분기를 삭제하는 것만으로 반영된다 — 스키마 변경 없음.

### ratings / login_attempts / topic_templates

**[R1에서 변경 없음]** — 원본과 동일.

### votes — **[R1: 테이블 제거]**

이전에는 `choice` 논제 전용 집계 테이블이었다(`topic_id`, `member_id`, `choice`, `UNIQUE(topic_id, member_id)`). R1에서 `choice`가 정식 kind로 구현되면서, 입장과 근거를 한 행(`answers.choice` + `answers.body`)에 합치는 편이 "입장만 있음"/"근거만 있음" 상태를 양쪽 테이블에서 따로 다루지 않아도 되므로 이 테이블은 **drop**한다. 2026-08-17 기준 라이브 DB에서 0행으로 직접 확인했다 — 무손실 제거.

### topic_template_items — kind 컬럼 갱신

| 컬럼(topic_template_items) | 타입 | 제약 | 비고 |
|---|---|---|---|
| kind | text | not null, **[R1] check in ('free','excerpt','choice','difficult','appendix')** | |

`choice_options`는 `topic_template_items`에는 추가하지 않는다 — 템플릿에서 `choice` 항목이 회차에 적용되면 `topics.choice_options`는 DB 기본값(`{찬성,반대}`)을 받고, 필요시 관리자가 회차별로 논제 수정 화면에서 바꾼다. 그 외 컬럼 정의는 원본과 동일.

## `topics.kind`에 따른 answers/replies 사용 방식 **[R1로 전면 갱신]**

| kind | answers 사용 | replies 사용 | 특수 컬럼 |
|---|---|---|---|
| `free` | 참여자당 1개(`slot=0`), `body`만 사용 | 모든 answer에 reply 가능, 레이블 **"의견 남기기"** | `quote_text`/`quote_reason`/`title`/`choice`는 항상 null |
| `excerpt` | 참여자당 1개(`slot=0`), `quote_text` + `quote_reason` 사용 | 모든 answer에 reply 가능, 레이블 **"사유 더하기"**(기존 유지) | `body`/`title`/`choice`는 사용 안 함 |
| `difficult` | 참여자당 최대 1개(`slot=0`, 선택 참여). `quote_text`(힘든 구절)+`quote_reason`(그 이유, 입력 라벨 "저는 이리 생각했는데…") | 모든 answer에 reply 가능, 레이블 **"같이 생각하니…"**(원문 그대로) — 단 모임일 KST 0시부터(아래 게이팅 절, [v3] 별도 필드가 아니라 reply) | `body`/`title`/`choice`는 사용 안 함 |
| `choice` | 참여자당 최대 1개(`slot=0`, 선택 참여). `choice`(입장, 즉시 저장) + `body`(근거, 선택 입력) | 모든 answer에 reply 가능, 레이블 **"의견 남기기"** | `quote_text`/`quote_reason`/`title`는 사용 안 함 |
| `appendix` | 참여자당 여러 개 허용(`slot=0,1,2,…`, 선택 참여, 제한 없음), `title`(짧은 제목) + `body`(본문) 사용 | 모든 answer에 reply 가능, 레이블 **"의견 남기기"** | `quote_text`/`quote_reason`/`choice`는 사용 안 함 |

레이블 정책의 근거는 `DECISIONS.md` "R1: 논제 유형별 reply 레이블 정책" 참고 — 원문 표현이 있는 kind(`excerpt`/`difficult`)는 그대로 쓰고, 신규 유형(`free`/`choice`/`appendix`)만 일반화한 "의견 남기기"를 쓴다.

이 표는 SPEC.md의 화면별 분기, 이관 파서의 판정 로직과 반드시 일치해야 한다. **[R1]** 파서는 5종 전부를 판정 대상으로 삼는다(REFACTOR_PLAN.md 4.8절) — `choice`의 입장(`answers.choice`)은 파서가 채우지 않고 관리자가 미리보기에서 지정한다. **[v3]** `difficult`의 참여자별 원문 줄 형식(이름 줄+"힘든 구절" 라벨, "저는 이리 생각했는데…"/"같이 생각하니…" 고정 라벨)은 실제 원문 2건으로 확정됐다. `appendix`의 원문 구조만 아직 검증되지 않아 잠정 규칙으로 남아 있다.

## difficult 댓글("같이 생각하니…") 게이팅 — Asia/Seoul 기준 **[v3 정정]**

v2까지는 이 절이 `answers.reflection_text`라는 별도 컬럼의 쓰기 게이트를 기술했다. 사용자가 제공한 실제 과거 원문(힘든 구절 논제 2건) 확인 결과, "같이 생각하니…" 아래에는 별도 필드가 아니라 다른 참여자들의 이름+댓글이 나열되는 **reply 목록**이 있었다 — `replies` 테이블로 이미 표현 가능하다(R1이 모든 kind에 reply를 허용하기로 했으므로). 따라서 게이팅 대상은 **필드 쓰기가 아니라 "difficult-kind answer에 대한 reply(=댓글) 작성"**이다:

- `difficult` kind의 answer에 달리는 reply는 **모임 당일 0시(Asia/Seoul) 이후**에만 작성할 수 있다. Vercel 서버 런타임은 UTC로 동작하므로 반드시 KST로 변환한 뒤 비교한다.
- 판정 대상: 해당 answer가 속한 `topic.session_id`의 `sessions.meets_at`(date).
- 판정: "지금 시각을 KST로 변환했을 때의 날짜" ≥ `meets_at`.
- 구현 위치: `lib/topics.ts`의 `isPostMeetingOpen(meetsAt: string): boolean`(v2의 `isReflectionOpen`에서 개명) — 클라이언트(댓글 입력창 안내 문구)와 `upsertReplyAction`(실제 쓰기 거부) 양쪽이 재사용. 클라이언트 표시만으로 막지 않는다(SECURITY.md 원칙).
- 다른 4kind(`free`/`excerpt`/`choice`/`appendix`)의 reply는 이 게이트가 없다 — `session.status==='open'`이면 언제든 작성 가능.
- **[R1 확정]** 이 게이팅과 `sessions.status === 'open'` 규칙은 **AND**로 결합한다 — 두 조건을 모두 만족해야 difficult 댓글을 쓸 수 있다. 별도 예외를 만들지 않고 SECURITY.md의 "단일 규칙" 원칙을 유지하는 대신, 관리자 화면이 `closed` 전환 직전 "댓글 없는 힘든 구절 N개" 경고를 띄워 완화한다(REFACTOR_PLAN.md 4.10절). `DECISIONS.md`에 "다음 회차를 열기 전까지 이전 회차를 닫지 않는다"를 운영 원칙으로 기록.
- 이관 파서로 과거 회차를 백필할 때는 이 게이트를 적용하지 않는다(REFACTOR_PLAN.md 4.8절 — 라이브 쓰기 제약과 관리자의 과거 데이터 일괄 이관은 다른 맥락).
- **[v4]** 이 댓글의 UI 레이블은 "같이 생각하니…"(원문 그대로, `quote_reason` 입력 라벨은 "저는 이리 생각했는데…") — 이관 파서의 인식 정규식과 동일한 표현을 쓴다. `DECISIONS.md` "R1: 논제 유형별 reply 레이블 정책" 참고.

## `choice` 논제 상세

- 입장(`answers.choice`)은 `topics.choice_options`(기본 `{찬성,반대}`) 중 하나를 자유 텍스트로 저장한다. DB 레벨 CHECK/FK로 `choice_options` 원소인지 강제하지 않는다(관리자가 선택지를 바꾸면 기존 응답과 어긋나는 edge case를 다뤄야 해서, 참여자 규모에 비해 과설계).
- 근거(`body`)는 선택 입력 — 입장만 밝히고 근거 없이도 완료로 간주한다(위 `isAnswerComplete` 절 참고).
- 화면 동작(`ChoiceView`)은 REFACTOR_PLAN.md 7절 참고. 집계·진영별 근거 카드 나열이 핵심이며, "의견 남기기"는 각 근거 카드 아래 붙는다(카드가 없는, 즉 근거 없이 입장만 밝힌 경우는 "의견 남기기" 대상도 없음 — 근거 카드 자체가 안 생기므로).

## 시드 데이터 계획 **[R1 추가분]**

원본 시드(참여자 6명, 책 2권, `free`+`excerpt` 위주)는 유지하고, R1 검증용으로 아래를 추가한다(자세한 내용은 `MIGRATION_R1.md` "시드 데이터 갱신" 절):

- 기본 템플릿을 5논제 구성으로 갱신.
- `difficult` 논제 1개 — 일부만 작성(선택 참여 재현). 1명은 `quote_text`/`quote_reason`만 있고 댓글 없음("모임 전"), 다른 1명은 댓글(`replies`) 2~3개까지 재현("모임 후").
- `choice` 논제 1개 — 입장만/입장+근거/미참여 상태를 함께 재현, 커스텀 `choice_options` 케이스 1건 포함.
- `appendix` 논제 1개 — 한 멤버가 서로 다른 제목으로 2개 게시물(`slot=0,1`)을 올린 상태 재현.

## 인덱스 및 성능 메모

**[R1에서 변경 없음]** — 트래픽이 극히 적어(월 1회, 5~8명) 인덱스를 과설계하지 않는다는 원칙 그대로. `slot` 전환은 유니크 제약의 "모양"만 바뀌는 것이라 `answers(topic_id)`의 FK 기본 인덱스로 조회 성능은 충분하다.
