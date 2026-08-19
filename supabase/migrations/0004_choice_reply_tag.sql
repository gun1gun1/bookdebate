-- 0004_choice_reply_tag.sql
-- choice 논제를 "평평한 투표"에서 "발제자 게시물 1개 + 참여자 찬반 reply" 2단
-- 구조로 전환하면서, 각 reply가 어느 입장(찬성/반대 등 topics.choice_options
-- 값 중 하나)에 대한 반응인지 태그할 컬럼이 필요해졌다.
-- 설계 근거: docs/DECISIONS.md "R1-e: choice 논제 2단 구조 전환" 절.
--
-- answers.choice 컬럼은 그대로 둔다(리네임/삭제 없음) — choice kind는 이제 이
-- 컬럼을 쓰지 않지만, 정리는 별도 턴에서 한다. 이 마이그레이션은 replies에
-- 컬럼 하나를 추가할 뿐이라 무손실이고, 실행 전 라이브 DB에 choice 논제
-- reply가 하나도 없는 상태(찬반을 남긴 사람이 아직 없음)라 되돌릴 데이터도 없다.
--
-- ⚠ 아직 실행되지 않았다. 사용자가 직접 지난번과 같은 방식(백업 → 실행 →
-- 검증 → 즉시 머지·배포)으로 반영한다.

begin;

alter table replies add column choice text null;

commit;
