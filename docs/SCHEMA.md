# SCHEMA.md

독서토론 앱의 Postgres(Supabase) 스키마 명세. 실제 마이그레이션은 Phase 1에서 `supabase/migrations/`에 작성한다. 이 문서는 그 마이그레이션이 따라야 할 설계도다.

DB 접근 원칙(자세한 내용은 SECURITY.md 참고): 전 테이블 `ENABLE ROW LEVEL SECURITY`, 정책은 만들지 않는다(전면 거부). 모든 읽기/쓰기는 `lib/supabase/server.ts`의 service-role 클라이언트를 통해 Next.js 서버에서만 일어난다.

## 관계도 (텍스트)

```
books (1) ──< sessions (1) ──< topics (1) ──< answers (1) ──< replies
                  │                                │
                  │                                └──< (kind='choice'인 경우) votes
                  └──< ratings
members (1) ──< answers / replies / ratings / votes  (author)
members (1) ──< sessions.selector_member_id / host_member_id (역할)
```

- `sessions`는 `books`를 정확히 1권 참조한다(책 1권 = 회차 1개, 재독은 새 `books` 행 + 새 `sessions` 행으로 처리).
- `topics`는 `sessions`에 속하고 `order_no`로 정렬된다.
- `answers`는 `(topic_id, member_id)`가 사실상 유니크하다 — 논제당 참여자당 답변은 하나.
- `replies`는 `topic`이 아니라 `answer`에 달린다. 이것이 `excerpt` 유형의 핵심 구조다.
- `ratings`는 UI상 논제 1번 화면에 붙어 있지만 실제로는 `session_id` 단위 — 논제가 아니라 회차 평가다.
- `votes`는 v2(`choice` 유형) 전용. MVP에서는 테이블만 존재하고 쓰기 경로가 없다.

## 테이블 정의

### books

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| title | text | not null | |
| author | text | | |
| cover_url | text | | |
| memo | text | | 관리자 메모, 참여자에게 노출 여부는 UI 재량 |
| created_at | timestamptz | not null default now() | |

### members

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| id | uuid | PK | |
| name | text | not null, unique | 정식 이름 (예: "희진") |
| aliases | text[] | not null default '{}' | 축약형 (예: '{희}') |
| role | text | not null, check in ('member','admin') | |
| is_active | boolean | not null default true | 삭제 대신 비활성화 |
| pin_hash | text | nullable | `REQUIRE_MEMBER_PIN=true`일 때만 사용, bcrypt |
| created_at | timestamptz | not null default now() | |

주의: `aliases`에 다른 멤버의 `name`이나 `aliases`와 겹치는 값이 들어가면 파서/로그인 양쪽에서 모호해질 수 있다. **의도적으로 겹침 검증을 두지 않기로 결정했다**(DECISIONS.md 참고) — 참여자 규모가 작고 관리자가 직접 입력하므로 검증 비용이 실익보다 크다고 판단했다. DB 제약도, 저장 시점 애플리케이션 검증도 없다.

### sessions

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| id | uuid | PK | |
| book_id | uuid | FK -> books.id, not null | |
| meets_at | date | not null | 모임일 |
| deadline_at | date | | 작성 마감일 |
| selector_member_id | uuid | FK -> members.id, nullable | 책 선정자, 보통 논제 1번 담당 |
| host_member_id | uuid | FK -> members.id, nullable | 진행자 |
| status | text | not null default 'draft', check in ('draft','open','closed') | ★ 쓰기 권한의 단일 기준 |
| blind_enabled | boolean | not null default false | v2 스위치, MVP는 항상 false |
| created_at | timestamptz | not null default now() | |

정책(DECISIONS.md 참고, 확정됨): **answers/replies의 생성·수정·삭제는 `status === 'open'`일 때만 허용한다.** `draft`(아직 세팅 중)와 `closed`(마감됨) 둘 다 이 하나의 조건으로 자동으로 막힌다 — 상태별로 별도 분기를 두지 않는다. `draft`에서도 논제 조회는 허용하지만 작성 UI는 비활성화한다(SPEC.md).

### topics

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| id | uuid | PK | |
| session_id | uuid | FK -> sessions.id, not null | |
| order_no | integer | not null | 회차 내 정렬 순번, 화면 표기 번호와 별개로 관리 가능 |
| kind | text | not null, check in ('free','excerpt','choice') | ★ UI/파서 분기의 핵심 |
| title | text | not null | |
| body | text | | 안내문 |
| assigned_member_id | uuid | FK -> members.id, nullable | 담당자 (예: 책 선정자) |
| has_rating | boolean | not null default false | 별점 위젯 노출 여부 |
| created_at | timestamptz | not null default now() | |

제약: `UNIQUE (session_id, order_no)` 권장 — 같은 회차 안에서 순번 중복 방지.

### answers

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| id | uuid | PK | |
| topic_id | uuid | FK -> topics.id, not null | |
| member_id | uuid | FK -> members.id, not null | |
| body | text | | free: 소감 / choice: 근거(v2) |
| excerpt_text | text | | excerpt 전용: 발췌 원문 |
| excerpt_reason | text | | excerpt 전용: 고른 이유 |
| submitted_at | timestamptz | | 최초 제출 시각 (null이면 미작성) |
| updated_at | timestamptz | | |

제약: `UNIQUE (topic_id, member_id)` — 논제당 참여자당 답변 1개를 DB 레벨에서 강제한다.

CHECK 제약(애플리케이션 레벨 검증과 별개로 DB에도 두는 것을 권장): `topics.kind = 'excerpt'`인 answer는 `excerpt_text`가 비어 있으면 "미작성"으로 간주하고, `topics.kind = 'free'`인 answer는 `body`가 비어 있으면 "미작성"으로 간주한다. 이 판정 로직을 코드 여러 곳에 중복하지 말고 한 곳(예: `lib/topics.ts`류 헬퍼)에 모아둘 것 — Phase 1에서 최종 위치 결정.

### replies

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| id | uuid | PK | |
| answer_id | uuid | FK -> answers.id, not null, **ON DELETE CASCADE** | ★ topic이 아니라 answer에 달림 |
| member_id | uuid | FK -> members.id, not null | |
| body | text | not null | "사유 더하기" 본문 |
| created_at | timestamptz | not null default now() | |

정책(DECISIONS.md "Phase 0 후속 결정" 참고, 확정됨):
- `answer_id`에 `ON DELETE CASCADE`를 건다 — 참여자가 본인 answer를 삭제하면 하위 replies도 함께 삭제되도록 허용했기 때문. 삭제 UI는 삭제 전 하위 reply 개수를 경고로 보여준다(SPEC.md).
- 본인 answer에 본인이 reply를 다는 것은 허용한다(제약 없음).
- `topics.kind != 'excerpt'`인 topic의 answer에는 reply를 달 수 없다 — 단, DB 트리거가 아니라 **Server Action에서 검증**한다(SECURITY.md 체크리스트 참고). DB 레벨에는 이 제약을 강제하는 CHECK/트리거를 두지 않는다.

### ratings

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| id | uuid | PK | |
| session_id | uuid | FK -> sessions.id, not null | |
| member_id | uuid | FK -> members.id, not null | |
| stars | integer | not null, check between 1 and 5 | |

제약: `UNIQUE (session_id, member_id)`.

### votes (v2, 스키마만)

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| id | uuid | PK | |
| topic_id | uuid | FK -> topics.id, not null | `kind = 'choice'`인 topic만 유효 |
| member_id | uuid | FK -> members.id, not null | |
| choice | text | not null | 진영 값, v2에서 구체화 |

제약: `UNIQUE (topic_id, member_id)`.

### login_attempts

| 컬럼 | 타입 | 제약 | 비고 |
|---|---|---|---|
| id | uuid | PK | |
| ip | text | not null | |
| attempted_at | timestamptz | not null default now() | |
| success | boolean | not null | |

인덱스: `(ip, attempted_at)` — 10분 윈도우 조회가 빈번하므로 필요.

## `topics.kind`에 따른 answers/replies 사용 방식

| kind | answers 사용 | replies 사용 | 특수 컬럼 |
|---|---|---|---|
| `free` | 참여자당 1개, `body`만 사용 | 사용 안 함 | `excerpt_text`/`excerpt_reason`은 항상 null |
| `excerpt` | 참여자당 1개, `excerpt_text` + `excerpt_reason` 사용. `body`는 사용 안 함(또는 미사용 컬럼으로 둠) | 각 answer 아래 여러 개, "사유 더하기" | 2단 중첩의 부모가 topic이 아니라 answer라는 점이 반드시 UI/쿼리에 반영되어야 함 |
| `choice` (v2) | `body`에 근거 텍스트(예정) | 미정 | `votes` 테이블이 집계 담당, answers는 부가 근거용 |

이 표는 SPEC.md의 화면별 분기, 그리고 Phase 3 붙여넣기 파서의 판정 로직과 반드시 일치해야 한다.

## 시드 데이터 계획 (Phase 1에서 구현)

- 참여자 6명: 수열, 윤선, 희진, 선희, 용훈, 혜정. `aliases`에 선희→'선', 희진→'희', 혜정→'혜' 등 축약형 반영.
- 책 2권: 『독학력』(완료 회차, status='closed'), 『허삼관매혈기』(진행 중 회차, status='open').
- 『독학력』 회차: `free` 논제 2개 + `excerpt` 논제 1개, 답변과 사유더하기까지 채워서 UI가 "다 찬 상태"로 어떻게 보이는지 확인 가능하게 한다.
- 『허삼관매혈기』 회차: 논제만 있고 답변은 비움 — "이제 막 열린 회차"의 실제 상태를 재현한다.

## 인덱스 및 성능 메모

이 앱은 월 1회, 참여자 5~8명 규모로 트래픽이 극히 적다. 인덱스는 정확성(유니크 제약)과 `login_attempts` 조회 외에는 과설계하지 않는다. `topics(session_id, order_no)`, `answers(topic_id)`, `replies(answer_id)`에 FK 기본 인덱스면 충분하다.
