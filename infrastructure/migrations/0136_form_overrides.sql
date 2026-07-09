-- ============================================================
-- AURA OS — migration 0136: Form overrides (Form Designer P1)
-- ------------------------------------------------------------
-- Per-tenant sparse patches over code-registered form schemas
-- (Vol 15 §2.4): field labels, hints, placeholders, required
-- flags, visibility. Applied by @aura/shared applyFormOverrides
-- in BOTH the web renderer and the API's assertFormValid, so the
-- admin's configuration is exactly what gets enforced.
-- ============================================================

create table if not exists public.aura_form_overrides (
  tenant_id  text        not null,
  schema_id  text        not null, -- e.g. 'hr.employee', 'crm.quotation'
  overrides  jsonb       not null default '{"fields":{}}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, schema_id)
);

alter table public.aura_form_overrides enable row level security;
drop policy if exists tenant_isolation_policy on public.aura_form_overrides;
create policy tenant_isolation_policy on public.aura_form_overrides
  for all using (tenant_id = public.current_tenant_id());

-- @DOWN
drop table if exists public.aura_form_overrides;
