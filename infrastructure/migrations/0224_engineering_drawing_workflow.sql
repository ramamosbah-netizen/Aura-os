-- ============================================================
-- AURA OS — migration 0224: Engineering shop-drawing workflow (G-32)
-- ------------------------------------------------------------
-- Turns the drawing register from a status field into a controlled state machine with an
-- immutable revision lineage and audit-grade submission + review transactions.
--   * aura_engineering_drawings gains revision-lineage + workflow-stamp columns. The `status`
--     column stays free-text (no CHECK) so existing rows (draft|pending_approval|approved|rejected)
--     remain valid; the state machine is enforced in the domain layer. Each (project, code, revision)
--     is one immutable row — revising creates the NEXT row and marks the source `superseded`.
--   * aura_engineering_drawing_submissions — the review-transaction record (who submitted which
--     revision, to whom, why, by when).
--   * aura_engineering_drawing_reviews — the reviewer's immutable decision (+ verbatim comments).
-- Both new tables carry tenant_id and are FORCE-RLS tenant-isolated like every business table.
-- ============================================================

-- 1. Drawing revision lineage + workflow stamps (additive; existing rows unaffected).
alter table public.aura_engineering_drawings add column if not exists previous_revision   text;
alter table public.aura_engineering_drawings add column if not exists reason_for_revision text;
alter table public.aura_engineering_drawings add column if not exists file_url            text;
alter table public.aura_engineering_drawings add column if not exists submitted_by        text;
alter table public.aura_engineering_drawings add column if not exists submitted_at        timestamptz;
alter table public.aura_engineering_drawings add column if not exists reviewed_by         text;
alter table public.aura_engineering_drawings add column if not exists reviewed_at         timestamptz;
alter table public.aura_engineering_drawings add column if not exists decided_by          text;
alter table public.aura_engineering_drawings add column if not exists decided_at          timestamptz;
alter table public.aura_engineering_drawings add column if not exists transmittal_ref     text;
alter table public.aura_engineering_drawings add column if not exists transmitted_at      timestamptz;
alter table public.aura_engineering_drawings add column if not exists closed_at           timestamptz;

create index if not exists idx_aura_eng_drawings_code on public.aura_engineering_drawings (tenant_id, project_id, code);

-- 2. Submissions — the review-transaction record.
create table if not exists public.aura_engineering_drawing_submissions (
  id            uuid        primary key,
  tenant_id     text        not null,
  company_id    text,
  drawing_id    uuid        not null,
  drawing_code  text        not null,
  revision      text        not null,
  project_id    text        not null,
  submitted_by  text,
  submitted_at  timestamptz not null default now(),
  recipient     text,
  purpose       text,
  due_date      date,
  comments      text
);

create index if not exists idx_eng_drawing_submissions_drawing on public.aura_engineering_drawing_submissions (tenant_id, drawing_id);
create index if not exists idx_eng_drawing_submissions_code    on public.aura_engineering_drawing_submissions (tenant_id, project_id, drawing_code);

alter table public.aura_engineering_drawing_submissions enable row level security;
alter table public.aura_engineering_drawing_submissions force row level security;

drop policy if exists tenant_isolation on public.aura_engineering_drawing_submissions;
create policy tenant_isolation on public.aura_engineering_drawing_submissions
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- 3. Reviews — the reviewer's immutable decision.
create table if not exists public.aura_engineering_drawing_reviews (
  id            uuid        primary key,
  tenant_id     text        not null,
  company_id    text,
  drawing_id    uuid        not null,
  drawing_code  text        not null,
  revision      text        not null,
  project_id    text        not null,
  reviewed_by   text,
  reviewed_at   timestamptz not null default now(),
  outcome       text        not null,
  comments      text
);

create index if not exists idx_eng_drawing_reviews_drawing on public.aura_engineering_drawing_reviews (tenant_id, drawing_id);
create index if not exists idx_eng_drawing_reviews_code    on public.aura_engineering_drawing_reviews (tenant_id, project_id, drawing_code);

alter table public.aura_engineering_drawing_reviews enable row level security;
alter table public.aura_engineering_drawing_reviews force row level security;

drop policy if exists tenant_isolation on public.aura_engineering_drawing_reviews;
create policy tenant_isolation on public.aura_engineering_drawing_reviews
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- @DOWN
drop table if exists public.aura_engineering_drawing_reviews;
drop table if exists public.aura_engineering_drawing_submissions;
alter table public.aura_engineering_drawings drop column if exists previous_revision;
alter table public.aura_engineering_drawings drop column if exists reason_for_revision;
alter table public.aura_engineering_drawings drop column if exists file_url;
alter table public.aura_engineering_drawings drop column if exists submitted_by;
alter table public.aura_engineering_drawings drop column if exists submitted_at;
alter table public.aura_engineering_drawings drop column if exists reviewed_by;
alter table public.aura_engineering_drawings drop column if exists reviewed_at;
alter table public.aura_engineering_drawings drop column if exists decided_by;
alter table public.aura_engineering_drawings drop column if exists decided_at;
alter table public.aura_engineering_drawings drop column if exists transmittal_ref;
alter table public.aura_engineering_drawings drop column if exists transmitted_at;
alter table public.aura_engineering_drawings drop column if exists closed_at;
