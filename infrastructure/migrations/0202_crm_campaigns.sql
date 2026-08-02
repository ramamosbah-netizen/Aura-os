-- ============================================================
-- AURA OS — migration 0202: CRM marketing campaigns
-- ------------------------------------------------------------
-- The top-of-funnel register — email blasts, events, referral pushes, paid ads — with the budget
-- spent and the pipeline it produced (leads generated + won revenue attributed). Answers the
-- marketing ROI question: "which spend actually generated business." Owned by crm.
-- ============================================================

create table if not exists public.aura_crm_campaigns (
  id              uuid        primary key,
  tenant_id       text        not null,
  company_id      text,
  name            text        not null,
  -- email | event | referral | web | social | paid_ads | other
  channel         text        not null default 'other',
  -- planned | active | completed
  status          text        not null default 'planned',
  budget          numeric     not null default 0,
  start_date      date,
  end_date        date,
  target_leads    integer     not null default 0,
  leads_generated integer     not null default 0,
  won_value       numeric     not null default 0,
  notes           text,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_aura_crm_campaigns_tenant
  on public.aura_crm_campaigns (tenant_id, status);

alter table public.aura_crm_campaigns enable row level security;
alter table public.aura_crm_campaigns force row level security;

drop policy if exists tenant_isolation on public.aura_crm_campaigns;
create policy tenant_isolation on public.aura_crm_campaigns
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- @DOWN
drop table if exists public.aura_crm_campaigns;
