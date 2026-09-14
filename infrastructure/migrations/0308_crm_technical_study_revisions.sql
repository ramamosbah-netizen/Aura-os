-- ============================================================
-- 0308 — Governed Pre-Award technical-study revisions
--
-- The study is owned by the canonical Pre-Award package. Engineering facts are stored separately
-- from the commercial basis, estimate and pricing so approval of technical truth never approves a
-- selling decision. Every revision records its input revision, author, independent reviewer and
-- immutable review outcome. Content is structured JSONB and validated by the shared CRM domain.
-- ============================================================

create table if not exists public.aura_crm_technical_study_revisions (
  id                uuid primary key,
  tenant_id         text not null,
  company_id        text,
  package_id        uuid not null references public.aura_crm_pre_award_packages(id) on delete restrict,
  revision_no       integer not null,
  parent_study_id   uuid,
  title             text not null,
  input_revision    text not null,
  status            text not null default 'draft',
  content           jsonb not null default '{}'::jsonb,
  author_id         text not null,
  reviewer_id       text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  submitted_at      timestamptz,
  reviewed_by       text,
  reviewed_at       timestamptz,
  review_comment    text,
  constraint technical_study_revision_no_chk check (revision_no > 0),
  constraint technical_study_status_chk check (status in ('draft','in_review','changes_requested','approved','superseded')),
  constraint technical_study_segregation_chk check (author_id <> reviewer_id),
  constraint uq_technical_study_revision unique (package_id, revision_no),
  constraint uq_technical_study_package_id unique (package_id, id),
  constraint technical_study_parent_same_package_fk foreign key (package_id, parent_study_id)
    references public.aura_crm_technical_study_revisions(package_id, id) on delete restrict
);

create index if not exists idx_technical_study_tenant on public.aura_crm_technical_study_revisions (tenant_id);
create index if not exists idx_technical_study_package on public.aura_crm_technical_study_revisions (package_id, revision_no desc);

alter table public.aura_crm_technical_study_revisions enable row level security;
alter table public.aura_crm_technical_study_revisions force row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname='public' and tablename='aura_crm_technical_study_revisions'
       and policyname='tenant_isolation_policy'
  ) then
    create policy tenant_isolation_policy on public.aura_crm_technical_study_revisions
      for all
      using (tenant_id = public.current_tenant_id() and public.current_tenant_id() is not null)
      with check (tenant_id = public.current_tenant_id() and public.current_tenant_id() is not null);
  end if;
end $$;

-- @DOWN
drop table if exists public.aura_crm_technical_study_revisions;
