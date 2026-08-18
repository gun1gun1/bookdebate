-- 0003_r1a_schema.sql
-- R1-a: topics.kind에 'difficult'/'choice'/'appendix' 추가(choice는 이번에 정식
-- 구현 대상으로 승격), answers 컬럼 리네임 + 신규 컬럼, slot 기반 유니크 전환,
-- votes 테이블 제거.
-- 설계 근거: docs/REFACTOR_PLAN.md, docs/MIGRATION_R1.md, docs/SCHEMA_R1_DRAFT.md.
--
-- ⚠ 아직 실행되지 않았다. R1-c 코드 배포와 같은 배포 창에서 적용할 것
-- (docs/MIGRATION_R1.md 4절 "배포 순서" 참고) — 이 마이그레이션 적용 직후
-- 곧바로 R1-c 코드가 배포되지 않으면, 그 사이에 살아있는 구 코드가
-- excerpt_text 컬럼/votes 테이블에 접근하려다 즉시 오류를 낸다.

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
--    R1-c 코드 배포와 같은 배포 창에서 적용할 것 — docs/MIGRATION_R1.md 4절 참고.
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
--    처리해야 한다. 2026-08-17 기준 라이브 DB에서 votes는 0행으로 직접 확인 —
--    무손실 drop.
-- ============================================================
drop table votes;

commit;
