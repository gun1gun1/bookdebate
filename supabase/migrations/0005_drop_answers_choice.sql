-- 0005_drop_answers_choice.sql
-- R1-e(0004_choice_reply_tag.sql)가 choice 논제를 "발제 게시물 + 찬반 reply"
-- 2단 구조로 바꾸면서 answers.choice는 사용이 중단됐다(찬반 입장은 이제
-- replies.choice에 담긴다) — 그 시점 커밋 메시지가 "정리는 별도 턴"으로 미룬
-- 작업이 이것이다. R1-d(구 코드/문서 잔재 정리)에서 마저 정리한다.
-- 설계 근거: docs/DECISIONS.md "R1-e: choice 논제 2단 구조 전환" 절.
--
-- 무손실 확인: 이 컬럼에 값이 쓰인 시기는 R1-c1(평평한 투표 설계, 아직 아무도
-- 참여하지 않은 상태로 확인됨)뿐이고, R1-e부터는 애초에 이 컬럼에 쓰지 않는다
-- (app/s/[id]/actions.ts 어디에도 answers 테이블에 choice를 insert/update하는
-- 코드가 없다 — upsertAnswerAction/upsertChoiceTopicAction 모두 payload에서
-- 이 키를 생략한다). 롤백은 nullable 컬럼을 다시 추가하면 되고, 그 시점엔
-- 어차피 이 컬럼을 읽는 코드가 없으므로 값 손실을 신경 쓸 대상도 없다.

begin;

alter table answers drop column choice;

commit;
