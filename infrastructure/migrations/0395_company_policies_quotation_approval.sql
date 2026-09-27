-- ============================================================
-- AURA OS — migration 0395: company policies (versioned) and quotation approval runs
-- ------------------------------------------------------------
-- EST-17: quotation approval is a tenant's COMPANY POLICY (Settings → Company Policies → Quotation
-- Approval), not code. The owner's decisions are the default, and an Admin changes them.
--
--   aura_company_policies          one row per policy VERSION; a draft is edited, an active version
--                                  is frozen, one active version per tenant and policy key;
--   aura_company_policy_changes    append-only: who changed which version, when, why, before/after;
--   aura_crm_quotation_approval_runs
--                                  an offer's approval, pinned to the policy version it STARTED
--                                  under, with the plan that version produced for it;
--   aura_crm_quotation_step_approvals
--                                  append-only: each approver's decision on a step of a run.
--
-- A later policy version never reaches an approval already started, and an issued quotation and
-- its decisions are never rewritten: the run carries its own plan.
-- ============================================================

create table if not exists public.aura_company_policies (
  id            uuid        primary key,
  tenant_id     text        not null,
  policy_key    text        not null,
  version       integer     not null,
  status        text        not null,
  body          jsonb       not null,
  created_by    text        not null,
  created_at    timestamptz not null,
  updated_at    timestamptz not null,
  activated_by  text,
  activated_at  timestamptz,
  retired_at    timestamptz,
  constraint aura_cp_version check (version >= 1),
  constraint aura_cp_status check (status in ('draft', 'active', 'retired')),
  constraint aura_cp_key check (coalesce(length(btrim(policy_key)), 0) > 0),
  constraint aura_cp_body check (jsonb_typeof(body) = 'object'),
  constraint aura_cp_one_version unique (tenant_id, policy_key, version),
  constraint aura_cp_activation check ((status = 'draft') = (activated_at is null))
);
create unique index if not exists idx_aura_cp_one_active on public.aura_company_policies (tenant_id, policy_key) where status = 'active';

-- A version that has been active is history: its body never changes again.
create or replace function public.aura_company_policy_guard() returns trigger
language plpgsql as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'company policy versions are kept: version % of % can only be retired, never deleted', old.version, old.policy_key;
  end if;
  if old.status <> 'draft' and new.body is distinct from old.body then
    raise exception 'company policy version % of % is % and can no longer be edited — start a new draft', old.version, old.policy_key, old.status;
  end if;
  if old.status = 'retired' and new.status <> 'retired' then
    raise exception 'a retired company policy version can only stay retired — start a new draft';
  end if;
  return new;
end $fn$;
drop trigger if exists aura_company_policy_guard on public.aura_company_policies;
create trigger aura_company_policy_guard before update or delete on public.aura_company_policies
  for each row execute function public.aura_company_policy_guard();

create table if not exists public.aura_company_policy_changes (
  id            uuid        primary key,
  tenant_id     text        not null,
  policy_key    text        not null,
  version       integer     not null,
  action        text        not null,
  actor_id      text        not null,
  reason        text        not null,
  previous      jsonb,
  next          jsonb,
  at            timestamptz not null,
  constraint aura_cpc_action check (action in ('draft_created', 'draft_updated', 'activated', 'retired')),
  constraint aura_cpc_actor check (coalesce(length(btrim(actor_id)), 0) > 0),
  constraint aura_cpc_reason check (coalesce(length(btrim(reason)), 0) >= 3)
);
create index if not exists idx_aura_cpc_policy on public.aura_company_policy_changes (tenant_id, policy_key, at);

create table if not exists public.aura_crm_quotation_approval_runs (
  id              uuid        primary key,
  tenant_id       text        not null,
  quotation_id    uuid        not null references public.aura_crm_quotations(id) on delete restrict,
  policy_key      text        not null,
  policy_version  integer     not null,
  amount          numeric(18,2) not null,
  amount_basis    text        not null,
  currency        text        not null,
  plan            jsonb       not null,
  status          text        not null,
  started_by      text        not null,
  started_at      timestamptz not null,
  closed_at       timestamptz,
  constraint aura_qar_status check (status in ('open', 'completed', 'returned', 'closed')),
  constraint aura_qar_basis check (amount_basis in ('net', 'gross')),
  constraint aura_qar_plan check (jsonb_typeof(plan) = 'array'),
  constraint aura_qar_closed check ((status = 'open') = (closed_at is null))
);
create unique index if not exists idx_aura_qar_one_open on public.aura_crm_quotation_approval_runs (tenant_id, quotation_id) where status = 'open';

create table if not exists public.aura_crm_quotation_step_approvals (
  id            uuid        primary key,
  tenant_id     text        not null,
  run_id        uuid        not null references public.aura_crm_quotation_approval_runs(id) on delete restrict,
  step_id       text        not null,
  approver_id   text        not null,
  decided_at    timestamptz not null,
  constraint aura_qsa_once unique (run_id, step_id, approver_id),
  constraint aura_qsa_approver check (coalesce(length(btrim(approver_id)), 0) > 0)
);

-- The two logs are append-only: a decision or a policy change is never edited or removed.
create or replace function public.aura_append_only_guard() returns trigger
language plpgsql as $fn$
begin
  raise exception '% is append-only', tg_table_name;
end $fn$;
drop trigger if exists aura_cpc_append_only on public.aura_company_policy_changes;
create trigger aura_cpc_append_only before update or delete on public.aura_company_policy_changes
  for each row execute function public.aura_append_only_guard();
drop trigger if exists aura_qsa_append_only on public.aura_crm_quotation_step_approvals;
create trigger aura_qsa_append_only before update or delete on public.aura_crm_quotation_step_approvals
  for each row execute function public.aura_append_only_guard();

do $rls$
declare t text;
begin
  foreach t in array array['aura_company_policies', 'aura_company_policy_changes', 'aura_crm_quotation_approval_runs', 'aura_crm_quotation_step_approvals'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format('create policy tenant_isolation on public.%I using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null) with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)', t);
  end loop;
end $rls$;

do $grant$ begin
  if exists (select 1 from pg_roles where rolname = 'aura_app') then
    grant select, insert, update on public.aura_company_policies to aura_app;
    grant select, insert on public.aura_company_policy_changes to aura_app;
    grant select, insert, update on public.aura_crm_quotation_approval_runs to aura_app;
    grant select, insert on public.aura_crm_quotation_step_approvals to aura_app;
  end if;
end $grant$;

-- @DOWN
drop trigger if exists aura_qsa_append_only on public.aura_crm_quotation_step_approvals;
drop trigger if exists aura_cpc_append_only on public.aura_company_policy_changes;
drop table if exists public.aura_crm_quotation_step_approvals;
drop table if exists public.aura_crm_quotation_approval_runs;
drop table if exists public.aura_company_policy_changes;
drop trigger if exists aura_company_policy_guard on public.aura_company_policies;
drop function if exists public.aura_company_policy_guard();
drop table if exists public.aura_company_policies;
drop function if exists public.aura_append_only_guard();
