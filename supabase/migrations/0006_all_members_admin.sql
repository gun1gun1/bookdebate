-- 0006_all_members_admin.sql
-- 전원 admin 부여 + 신규 멤버 기본 role을 admin으로 변경.
-- 설계 근거: docs/DECISIONS.md "전원 관리자 권한 부여" 절, docs/SECURITY.md
-- "권한 매트릭스" 상단 주석.
--
-- 배경: 2026-08-22 실제 모임에서 admin이 아닌 5명이 /admin에 접근했을 때
-- requireAdmin()/proxy.ts가 안내 없이 홈으로 리다이렉트해 "관리자 화면에서
-- 다른 멤버가 안 보인다"는 원인 불명의 혼란으로 이어졌다(같은 턴에 이
-- 리다이렉트 자체는 /forbidden 안내 페이지로 고쳤다). 6명 사적 모임이고
-- 매달 다른 사람이 책을 선정해 회차를 만드므로 role을 나눌 이유가 없어,
-- role 컬럼/체크 제약은 그대로 두되(스키마 변경 최소화, 훗날 재도입 여지
-- 보존) 값만 전원 admin으로 통일한다.
--
-- 주의: 이 이후로는 참여자 전원이 서로의 answer/reply를 수정·삭제할 수
-- 있다 — 의도된 결정이다. 6명이 서로 아는 사적 모임이라는 전제에서만
-- 유효하므로, 참여 인원 성격이 바뀌면(예: 낯선 사람 참여) 재검토할 것.
--
-- 적용됨(2026-08-22, 프로덕션 DB에 실행 완료 — members.role 기본값 'admin',
-- 전 회원 role='admin' 확인됨).

begin;

update members set role = 'admin' where role <> 'admin';
alter table members alter column role set default 'admin';

commit;
