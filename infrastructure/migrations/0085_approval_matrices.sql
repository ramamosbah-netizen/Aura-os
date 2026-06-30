-- ============================================================
-- AURA OS — migration 0085: Approval matrices (threshold rules)
-- ------------------------------------------------------------
-- Persists the approval-matrix rule sets per (tenant, entity_type)
-- that drive threshold-based approver enforcement (e.g. PO/PR value
-- bands → required approvers). Rules stored as JSONB.
-- ============================================================

create table if not exists public.aura_approval_matrices (
  tenant_id    text        not null,
  entity_type  text        not null,
  rules        jsonb       not null default '[]'::jsonb,
  updated_at   timestamptz not null default now(),
  primary key (tenant_id, entity_type)
);

alter table public.aura_approval_matrices enable row level security;
drop policy if exists tenant_isolation_policy on public.aura_approval_matrices;
create policy tenant_isolation_policy on public.aura_approval_matrices
  for all using (tenant_id = public.current_tenant_id());
