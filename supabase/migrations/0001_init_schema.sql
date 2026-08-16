-- 독서토론 앱 초기 스키마
-- 설계 근거: docs/SCHEMA.md, docs/SECURITY.md, docs/DECISIONS.md 참고.
-- 전 테이블 RLS 활성화 + 정책 없음(전면 거부). 모든 접근은 service-role 키를 쓰는
-- Next.js 서버(lib/supabase/server.ts)를 통해서만 이뤄진다.

create extension if not exists pgcrypto;

-- ============================================================
-- books
-- ============================================================
create table books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text,
  cover_url text,
  memo text,
  created_at timestamptz not null default now()
);

alter table books enable row level security;

-- ============================================================
-- members
-- ============================================================
create table members (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  aliases text[] not null default '{}',
  role text not null default 'member' check (role in ('member', 'admin')),
  is_active boolean not null default true,
  pin_hash text,
  created_at timestamptz not null default now()
);

alter table members enable row level security;

-- ============================================================
-- sessions
-- ============================================================
create table sessions (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references books(id),
  meets_at date not null,
  deadline_at date,
  selector_member_id uuid references members(id),
  host_member_id uuid references members(id),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  blind_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

alter table sessions enable row level security;

-- ============================================================
-- topics
-- ============================================================
create table topics (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id),
  order_no integer not null,
  kind text not null check (kind in ('free', 'excerpt', 'choice')),
  title text not null,
  body text,
  assigned_member_id uuid references members(id),
  has_rating boolean not null default false,
  created_at timestamptz not null default now(),
  unique (session_id, order_no)
);

alter table topics enable row level security;

-- ============================================================
-- answers
-- 논제당 참여자당 답변 1개. free는 body, excerpt는 excerpt_text/excerpt_reason 사용
-- (docs/SCHEMA.md의 kind별 사용 방식 표 참고).
-- ============================================================
create table answers (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references topics(id),
  member_id uuid not null references members(id),
  body text,
  excerpt_text text,
  excerpt_reason text,
  submitted_at timestamptz,
  updated_at timestamptz,
  unique (topic_id, member_id)
);

alter table answers enable row level security;

-- ============================================================
-- replies ("사유 더하기")
-- topic이 아니라 answer에 달린다. 참여자가 본인 answer를 삭제하면 하위 replies도
-- 함께 삭제되도록 허용했으므로 ON DELETE CASCADE (docs/DECISIONS.md 참고).
-- "topics.kind = 'excerpt'인 answer에만 reply를 달 수 있다"는 규칙은 DB 제약이
-- 아니라 Server Action에서 검증한다(docs/SECURITY.md 참고).
-- ============================================================
create table replies (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references answers(id) on delete cascade,
  member_id uuid not null references members(id),
  body text not null,
  created_at timestamptz not null default now()
);

alter table replies enable row level security;

-- ============================================================
-- ratings
-- 화면상 논제 1번에 붙어 있지만 실질은 회차 단위 평가.
-- ============================================================
create table ratings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id),
  member_id uuid not null references members(id),
  stars integer not null check (stars between 1 and 5),
  unique (session_id, member_id)
);

alter table ratings enable row level security;

-- ============================================================
-- votes (v2용, 스키마만 반영. kind='choice' 논제 전용)
-- ============================================================
create table votes (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references topics(id),
  member_id uuid not null references members(id),
  choice text not null,
  unique (topic_id, member_id)
);

alter table votes enable row level security;

-- ============================================================
-- login_attempts (무차별 대입 방지, docs/SECURITY.md 참고)
-- ============================================================
create table login_attempts (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  attempted_at timestamptz not null default now(),
  success boolean not null
);

create index login_attempts_ip_attempted_at_idx on login_attempts (ip, attempted_at);

alter table login_attempts enable row level security;
