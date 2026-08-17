# MIGRATION_R1.md — R1-a 마이그레이션 초안 (미적용)

`docs/REFACTOR_PLAN.md`가 참조하는 실제 DDL 초안. **아직 `supabase/migrations/`에 파일로 만들지 않았고, 실제 DB에도 적용하지 않았다.** 실행 단계 표기는 `REFACTOR_PLAN.md` 2절의 `R1-a`에 해당하며, 실행 순서는 `R1-b → R1-a → R1-c`다(R1-b는 DB 무관, R1-a 적용 직후 곧바로 R1-c 코드가 이어져야 한다 — 아래 4절 "배포 순서" 참고).

**v2 개정**: v1 초안은 `choice`를 스키마만 유지하고 `answers_topic_id_member_id_key` UNIQUE 제약을 완전히 제거하는 안이었다. 사용자 확인을 거쳐 아래로 바뀌었다:

- `choice`를 정식 5번째 kind로 승격 — `answers.choice`/`topics.choice_options` 컬럼 추가, `votes` 테이블 drop.
- UNIQUE 제약 완전 제거 대신 **`slot` 컬럼 + 3컬럼 UNIQUE**로 전환(appendix만 다건 허용, 나머지는 DB가 계속 1인 1답변을 강제).
- `excerpt_text`/`excerpt_reason`을 `quote_text`/`quote_reason`으로 RENAME(`excerpt`/`difficult`가 공유).

**v3 정정**: v2는 difficult의 "2단계"를 위해 `answers.reflection_text`/`reflection_updated_at` 컬럼 추가를 포함했다. 사용자가 실제 과거 원문(힘든 구절 논제 2건)을 제공해 확인한 결과, "같이 생각하니…" 아래에는 별도 필드가 아니라 다른 참여자들의 이름+댓글이 나열되는 **reply 목록**이 있었다 — `replies` 테이블로 이미 표현 가능한 구조였다. **이 두 컬럼은 이번 초안에서 제거**했다(`REFACTOR_PLAN.md` 4.3.1절 참고). 그 결과 이 마이그레이션이 `answers`에 추가하는 신규 컬럼은 `title`/`choice`/`slot` 3개로 줄었다.

라이브 DB(`bookdebate` 프로젝트, `gfayjvddrlhjgkunjlnt`, `ap-northeast-2`, Postgres 17.6)를 실제로 조회해 확인한 제약 이름:

```
topics.topics_kind_check                              CHECK (kind = ANY (ARRAY['free','excerpt','choice']))
topic_template_items.topic_template_items_kind_check   CHECK (kind = ANY (ARRAY['free','excerpt','choice']))
answers.answers_topic_id_member_id_key                 UNIQUE (topic_id, member_id)
```

현재 행 수(2026-08-17 기준, 직접 조회): `answers` 16 / `replies` 6 / `topics` 5 / `sessions` 2 / `members` 6 / `books` 2 / **`votes` 0** — 전부 `supabase/seed.sql` 값과 일치, 실사용 데이터 없음. `votes`가 0행이라는 사실이 이번 drop 결정의 직접적 근거다. R1-a가 실제 적용될 시점에는 실데이터가 있을 수 있다는 전제로 아래 영향 분석과 롤백 절차를 작성했다.

---

## 1. SQL 초안

파일명 제안: `supabase/migrations/0003_r1a_schema.sql`

```sql
-- 0003_r1a_schema.sql (초안 — 검토 후 적용)
-- R1-a: topics.kind에 'difficult'/'choice'/'appendix' 추가(choice는 이번에 정식
-- 구현 대상으로 승격), answers 컬럼 리네임 + 신규 컬럼, slot 기반 유니크 전환,
-- votes 테이블 제거.
-- 설계 근거: docs/REFACTOR_PLAN.md, docs/SCHEMA_R1_DRAFT.md.

begin;

-- ============================================================
-- 1. topics.kind CHECK 제약 확장
--    이전: free/excerpt/choice(스키마만) → 이후: 5종 전부 정식 kind
-- ============================================================
alter table topics
  drop constraint topics_kind_check;
alter table topics
  add constraint topics_kind_check
  check (kind in ('free', 'excerpt', 'choice', 'difficult', 'appendix'));

-- ============================================================
-- 2. topic_template_items.kind CHECK 제약도 동일하게 확장
-- ============================================================
alter table topic_template_items
  drop constraint topic_template_items_kind_check;
alter table topic_template_items
  add constraint topic_template_items_kind_check
  check (kind in ('free', 'excerpt', 'choice', 'difficult', 'appendix'));

-- ============================================================
-- 3. answers 컬럼 리네임 — excerpt 전용 이름을 kind-중립 이름으로.
--    excerpt와 difficult가 이 두 컬럼을 공유한다(REFACTOR_PLAN.md 6-1절).
--    RENAME COLUMN은 메타데이터 연산이라 값 손실 없음, 즉시 적용.
--
--    ⚠ 이 리네임은 기존 코드(아직 quote_text를 모르는 코드)를 즉시 깨뜨린다.
--    R1-c 코드 배포와 같은 배포 창에서 적용할 것 — 이 문서 4절 참고.
-- ============================================================
alter table answers rename column excerpt_text to quote_text;
alter table answers rename column excerpt_reason to quote_reason;

-- ============================================================
-- 4. answers 신규 컬럼
--    title   : appendix 전용, 게시물 짧은 제목.
--    choice  : choice 전용, 이 사람이 고른 입장 (topics.choice_options 값 중
--              하나, 자유 텍스트로 저장 — FK나 CHECK로 choice_options를
--              참조하도록 강제하지 않는다. 배열 원소를 FK 대상으로 삼는 것은
--              Postgres에서 번거롭고, 참여자 5~8명 규모에 비해 과설계다).
--    difficult 2단계("같이 생각하니…")는 별도 컬럼을 두지 않는다 — 실제
--    원문(사용자 제공 2건) 확인 결과 그건 별도 필드가 아니라 다른 참여자들의
--    이름+댓글 목록(replies)이었다. R1이 이미 모든 kind에 reply를 허용하므로
--    기존 replies 테이블로 충분하다 — 이 마이그레이션은 이를 위한 컬럼을
--    추가하지 않는다(REFACTOR_PLAN.md 4.3.1절 참고).
-- ============================================================
alter table answers add column title text;
alter table answers add column choice text;

-- ============================================================
-- 5. topics 신규 컬럼 — choice 선택지 목록
--    관리자가 "찬성/반대" 대신 "A안/B안" 등으로 바꿀 수 있도록 배열로 둔다.
-- ============================================================
alter table topics
  add column choice_options text[] not null default '{찬성,반대}';

-- ============================================================
-- 6. answers의 (topic_id, member_id) UNIQUE 제약을 slot 기반으로 전환
--    이유: appendix만 한 사람이 같은 논제에 여러 게시물을 올릴 수 있어야 한다.
--    기존 행은 전부 (topic_id, member_id)가 유니크했으므로, slot을 기본값 0으로
--    추가해도 아래 3컬럼 유니크 제약을 위반할 수 없다 — 안전한 전환이다.
--    free/excerpt/difficult/choice는 계속 slot=0 하나만 쓰므로 DB가 계속
--    "1인 1답변"을 강제한다(Server Action 검사가 실수로 빠져도 DB가 막아준다 —
--    Codex/Gemini CLI 등 여러 도구가 이 저장소를 함께 고치므로 DB 레벨 방어선을
--    유지하기로 했다). appendix만 slot을 늘려가며 다건을 허용한다.
-- ============================================================
alter table answers
  add column slot smallint not null default 0;

alter table answers
  drop constraint answers_topic_id_member_id_key;
alter table answers
  add constraint answers_topic_member_slot_key
  unique (topic_id, member_id, slot);

-- ============================================================
-- 7. votes 테이블 제거
--    입장(choice)과 근거(body)가 항상 함께 쓰이고 함께 보이므로 answers.choice로
--    합친다 — votes를 유지하면 "입장만 있음"/"근거만 있음" 상태를 양쪽에서 따로
--    처리해야 한다. 2026-08-17 기준 라이브 DB에서 votes는 0행으로 직접 확인—
--    무손실 drop.
-- ============================================================
drop table votes;

commit;
```

RLS는 별도 조치 불필요 — 모든 대상 테이블이 이미 `ENABLE ROW LEVEL SECURITY` + 정책 0개이고, 새 컬럼도 자동으로 같은 "전면 거부" 아래 들어간다. `votes` drop으로 그 테이블의 RLS 설정도 테이블과 함께 사라진다(별도 처리 불필요).

### 시드 데이터 갱신 (구현 턴, `supabase/seed.sql`)

- 기본 템플릿을 5논제 구성으로 갱신(REFACTOR_PLAN.md 4.6절).
- `difficult` 논제 1개 — 일부만 작성(선택 참여 재현). 1명은 `quote_text`/`quote_reason`만 쓰고 아직 아무 댓글도 없는 상태("모임 전"), 다른 1명은 `quote_text`/`quote_reason`에 더해 2~3명이 "같이 생각하니…" 댓글(`replies`)을 단 상태("모임 후")를 재현 — 4.10절 "댓글 없는 힘든 구절" 경고 조건도 함께 확인할 수 있게.
- `choice` 논제 1개 — 몇 명은 입장만, 몇 명은 입장+근거, 나머지는 미참여 상태를 재현. `topics.choice_options`는 기본값(`{찬성,반대}`) 그대로 두거나 커스텀 값("A안","B안") 케이스도 하나 넣어 확인.
- `appendix` 논제 1개 — 같은 멤버가 서로 다른 `title`로 2개 게시물(`slot=0`, `slot=1`)을 올린 상태 재현.

## 2. 기존 데이터에 미치는 영향

| 변경 | 기존 행에 미치는 영향 | 위험도 |
|---|---|---|
| `topics_kind_check` / `topic_template_items_kind_check` 확장 | 없음 — 허용 값만 넓어짐. | 낮음 |
| `excerpt_text`→`quote_text`, `excerpt_reason`→`quote_reason` RENAME | 값 손실 없음(메타데이터 연산, 즉시 적용). **가용성 위험**: 아직 새 컬럼명을 모르는 구 코드가 이 시점에 살아 있으면 그 요청은 즉시 실패한다(500 에러 등) — 데이터가 사라지는 게 아니라 일시적으로 쓰기/조회가 안 되는 것. 4절 "배포 순서" 참고. | 낮음(가용성 한정) |
| `answers.title`/`choice`, `topics.choice_options` 추가 | 없음 — nullable 또는 기본값 있는 `ADD COLUMN`은 Postgres에서 테이블 재작성 없이 즉시 처리된다(락 시간 매우 짧음, PG 11+). | 낮음 |
| `answers.slot` 추가 + `answers_topic_member_slot_key` 전환 | 기존 행은 전부 `(topic_id, member_id)`가 유니크했으므로 `slot=0` 기본값으로도 새 3컬럼 유니크 제약을 **위반할 수 없다** — 마이그레이션 자체가 실패할 가능성이 없는 안전한 전환. 이후로도 `appendix`가 아닌 kind는 DB가 계속 "1인 1답변"을 강제한다(v1 초안에서 "DB 안전망이 사라진다"고 표시했던 위험이 이 설계로 사실상 해소됨). | 낮음 |
| `votes` 테이블 drop | 0행 확인됨(직접 조회) — 무손실. | 없음 |

## 3. 롤백 방법

`begin`/`commit`으로 묶여 있어 적용 도중 실패하면 자동 롤백된다(부분 적용 상태 없음). 아래는 **적용 후, 실사용 데이터가 새로 쌓인 뒤** 되돌려야 하는 경우의 절차다.

```sql
begin;

-- 7의 역순: votes 테이블 복구 (0001_init_schema.sql의 원본 정의 재사용)
create table votes (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references topics(id),
  member_id uuid not null references members(id),
  choice text not null,
  unique (topic_id, member_id)
);
alter table votes enable row level security;
-- ⚠ 이 시점까지 answers.choice에 실제로 쌓인 데이터는 이 새 빈 votes 테이블로
-- 자동 이관되지 않는다. votes 재도입이 필요하다면 별도 백필 스크립트가 필요하다
-- (사람이 "무엇을 어느 쪽 votes 행으로 옮길지" 판단할 부분은 없음 — 기계적
-- 이관이므로 위험도는 낮지만 반드시 별도 단계로 수행해야 한다는 점은 남는다).

-- 6의 역순: slot 기반 유니크를 (topic_id, member_id) 2컬럼으로 되돌림
-- ⚠ 이 단계는 실제로 appendix 논제에 slot > 0인 다건 게시물이 쌓여 있으면
-- 실패한다(제약 위반). 아래로 위반 여부를 먼저 확인:
--   select topic_id, member_id, count(*)
--   from answers
--   group by topic_id, member_id
--   having count(*) > 1;
-- 위반 행이 있다면 appendix 게시물 중 어느 것을 남기고 어느 것을 지울지 사람이
-- 판단해야 한다(자동 병합 스크립트를 돌리지 않는다 — 어느 게시물이 "대표"인지는
-- DB가 알 수 없다). v1 초안 대비 이 위험은 appendix 하나로 범위가 좁아졌다.
alter table answers drop constraint answers_topic_member_slot_key;
alter table answers add constraint answers_topic_id_member_id_key unique (topic_id, member_id);
alter table answers drop column slot;

-- 5, 4의 역순: 신규 컬럼 제거
-- ⚠ 데이터 손실 — title/choice/choice_options에 실제로 입력된 내용이 있다면
-- 이 시점에 전부 사라진다. 컬럼을 지우기 전에 반드시 백업:
--   create table answers_backup_r1 as
--   select id, title, choice
--   from answers
--   where title is not null or choice is not null;
alter table topics drop column choice_options;
alter table answers drop column choice;
alter table answers drop column title;

-- 3의 역순: 컬럼명 원복
-- 값 손실 없음(메타데이터 연산). 단, 이 시점에 quote_text/quote_reason을 쓰는
-- R1-c 코드가 아직 배포돼 있다면 리네임 직후 그 코드가 즉시 깨진다 — 정방향
-- 적용 때와 동일한 "배포 순서" 주의가 롤백에도 그대로 적용된다.
alter table answers rename column quote_text to excerpt_text;
alter table answers rename column quote_reason to excerpt_reason;

-- 2, 1의 역순: kind CHECK 제약 축소
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

**요약**: v1 대비 롤백 안전성이 전반적으로 개선됐다 — slot 전환(6번)은 이제 "적용 시점에는 실패할 수 없는" 무손실 연산이고, 컬럼 리네임(3번)도 값 손실이 없다(가용성 문제로만 남음). 여전히 사람 판단이 필요한 지점은 두 곳뿐이다: **(a)** `appendix` 논제에 다건 게시물이 실제로 쌓인 뒤의 slot 롤백, **(b)** 신규 kind(`difficult`/`choice`/`appendix`)가 실제로 쓰인 뒤의 kind CHECK 축소. 둘 다 "새 기능이 실제로 쓰이기 전"이라는 좁은 창 안에서는 완전 무손실 롤백이 가능하다.

## 4. 배포 순서 (중요)

`REFACTOR_PLAN.md` 2절에서 지정한 실행 순서는 `R1-b → R1-a → R1-c`다. R1-a(이 마이그레이션)는 `excerpt_text`/`excerpt_reason` 리네임과 `votes` drop처럼 **기존에 배포되어 있는 코드를 즉시 깨뜨리는 변경**을 포함한다.

**따라서 이 마이그레이션은 R1-c 코드가 병합되어 배포될 준비가 된 시점에, R1-c 배포 직전(또는 같은 배포 파이프라인 안)에 적용한다.** R1-a만 먼저 적용해 놓고 R1-c 배포를 나중으로 미루면, 그 사이에 살아있는 구 코드(R1-b까지만 반영된 상태)가 `excerpt_text` 컬럼과 `votes` 테이블에 접근하려다 즉시 오류를 낸다. 이 앱은 트래픽이 극히 적어(월 1회 사용) 짧은 유지보수 창을 잡기 쉬우므로, 실무적으로는 "R1-a 마이그레이션 적용 → 곧바로 R1-c 코드 배포"를 한 묶음의 작업으로 취급한다.

## 5. 이 마이그레이션이 다루지 않는 것 (의도적으로 범위 밖)

- `replies` 테이블 스키마는 변경하지 않는다 — "모든 kind에서 reply 허용"은 `app/s/[id]/actions.ts`의 `upsertReplyAction` 안 kind 검사 분기를 삭제하는 것만으로 충분하다.
- `topic_template_items`에 `choice_options` 컬럼은 추가하지 않는다 — 템플릿에서 choice 항목을 적용하면 회차의 `topics.choice_options`는 DB 기본값(`{찬성,반대}`)을 받고, 필요하면 관리자가 회차별로 논제 수정 화면에서 바꾼다(REFACTOR_PLAN.md 4.6절).
- `answers.choice`를 `topics.choice_options` 배열 원소로 강제하는 CHECK/FK는 만들지 않는다 — 참여자 규모에 비해 과설계이고, 관리자가 선택지를 바꾸면 기존 응답과 어긋나는 edge case를 다뤄야 해서 오히려 복잡도가 늘어난다.
