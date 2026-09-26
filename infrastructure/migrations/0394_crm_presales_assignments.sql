-- ============================================================
-- AURA OS — migration 0394: the Pre-Sales study assignment, as a record of its own
-- ------------------------------------------------------------
-- STU-01, the owner's decision of 2026-09-26: a study Sales assigns is BOUND to its assignment
-- (engineer, reviewer, input revision); the engineer ACCEPTS or DECLINES it with a reason; nobody
-- closes it by hand — the approved study completes it and Sales takes receipt. Direct route only.
--
-- Before this, the assignment was two deal-team rows and an ordinary task that bound nothing. This
-- row is the package: one per opportunity, reissued as a new VERSION when Sales changes it, with
-- every act kept in its history.
-- ============================================================

create table if not exists public.aura_crm_presales_assignments (
  id               uuid        primary key,
  tenant_id        text        not null,
  company_id       text,
  opportunity_id   uuid        not null references public.aura_crm_opportunities(id) on delete restrict,
  version          integer     not null,
  assignee_id      text        not null,
  reviewer_id      text        not null,
  input_revision   text        not null,
  due_date         date        not null,
  deliverables     jsonb       not null,
  status           text        not null,
  decline_reason   text,
  assigned_by      text        not null,
  assigned_at      timestamptz not null,
  accepted_at      timestamptz,
  declined_at      timestamptz,
  completed_at     timestamptz,
  study_id         uuid,
  acknowledged_at  timestamptz,
  history          jsonb       not null,
  created_at       timestamptz not null,
  updated_at       timestamptz not null,
  constraint aura_psa_one_per_opportunity unique (tenant_id, opportunity_id),
  constraint aura_psa_version check (version >= 1),
  constraint aura_psa_status check (status in ('assigned','accepted','declined','completed')),
  constraint aura_psa_independent check (assignee_id <> reviewer_id),
  constraint aura_psa_people check (coalesce(length(btrim(assignee_id)), 0) > 0 and coalesce(length(btrim(reviewer_id)), 0) > 0 and coalesce(length(btrim(assigned_by)), 0) > 0),
  constraint aura_psa_input check (coalesce(length(btrim(input_revision)), 0) > 0),
  constraint aura_psa_deliverables check (jsonb_typeof(deliverables) = 'array' and jsonb_array_length(deliverables) > 0),
  constraint aura_psa_history check (jsonb_typeof(history) = 'array' and jsonb_array_length(history) > 0),
  -- Each state carries exactly the facts that put it there.
  constraint aura_psa_accepted check (status <> 'accepted' or accepted_at is not null),
  constraint aura_psa_declined check ((status = 'declined') = (declined_at is not null) and (status <> 'declined' or coalesce(length(btrim(decline_reason)), 0) > 0)),
  constraint aura_psa_completed check ((status = 'completed') = (completed_at is not null and study_id is not null)),
  constraint aura_psa_received check (acknowledged_at is null or status = 'completed')
);

create index if not exists idx_aura_psa_assignee on public.aura_crm_presales_assignments (tenant_id, assignee_id, status);
create index if not exists idx_aura_psa_assigner on public.aura_crm_presales_assignments (tenant_id, assigned_by, status);

alter table public.aura_crm_presales_assignments enable row level security;
alter table public.aura_crm_presales_assignments force row level security;
drop policy if exists tenant_isolation on public.aura_crm_presales_assignments;
create policy tenant_isolation on public.aura_crm_presales_assignments
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

do $grant$ begin
  if exists (select 1 from pg_roles where rolname = 'aura_app') then
    grant select, insert, update on public.aura_crm_presales_assignments to aura_app;
  end if;
end $grant$;

-- @DOWN
drop table if exists public.aura_crm_presales_assignments;
