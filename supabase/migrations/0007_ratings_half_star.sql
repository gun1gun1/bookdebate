-- 0007_ratings_half_star.sql
-- 별점을 0.5 단위(반점)로 허용하도록 ratings.stars 타입을 정수 → numeric(2,1)로
-- 바꾼다. 설계 근거: 실사용 피드백 — 5단계 정수로는 표현력이 부족하다는 의견.
-- 기존 정수 값(1~5)은 numeric(2,1)로 그대로 캐스팅되므로 무손실이다.
--
-- 실행 시점: 이 파일은 작성만 됐고 프로덕션 DB에는 아직 실행되지 않았다 —
-- 0005_drop_answers_choice.sql, 0006_all_members_admin.sql과 함께 사람이
-- 직접 확인 후 실행한다.

begin;

alter table ratings
  alter column stars type numeric(2,1) using stars::numeric(2,1);

-- 기존 체크(정수 1~5)를 그대로 두면 숫자 범위만 검사할 뿐 0.5 배수 여부를
-- 걸러내지 못한다 — 드롭 후 0.5 단위 제약으로 교체한다.
alter table ratings
  drop constraint ratings_stars_check;

alter table ratings
  add constraint ratings_stars_check
  check (stars >= 0.5 and stars <= 5.0 and (stars * 10) % 5 = 0);

commit;
