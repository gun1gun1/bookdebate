-- 회차 템플릿 (docs/DECISIONS.md "Phase 3" 참고)
-- 독서토론앱.md C절 데이터 모델에는 없던 테이블이다 — 템플릿 기능은 Phase 0
-- 후속 결정으로 추가됐지만 스키마가 빠져 있었다. Phase 3에서 처음 설계한다.

-- ============================================================
-- topic_templates
-- ============================================================
create table topic_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

alter table topic_templates enable row level security;

-- ============================================================
-- topic_template_items
-- assigned_role: 특정 멤버가 아니라 "그 회차의 선정자/진행자"라는 역할을
-- 저장한다. 템플릿을 회차에 적용할 때 그 회차의 selector_member_id /
-- host_member_id로 해석해 topics.assigned_member_id를 채운다.
-- ============================================================
create table topic_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references topic_templates(id) on delete cascade,
  order_no integer not null,
  kind text not null check (kind in ('free', 'excerpt', 'choice')),
  title text not null,
  body text,
  assigned_role text check (assigned_role in ('selector', 'host')),
  has_rating boolean not null default false,
  unique (template_id, order_no)
);

alter table topic_template_items enable row level security;
