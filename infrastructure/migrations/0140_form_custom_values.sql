-- ============================================================
-- AURA OS — migration 0140: Form Designer P2 — custom-field values
-- ------------------------------------------------------------
-- Per-record values for designer-added (`cf_*`) fields. The global
-- ValidationPipe strips unknown keys from decorated DTOs, so the
-- enforced endpoints validate the RAW body against the merged
-- published schema and capture the cf_* values here after create,
-- keyed by the new record's id. Read seam:
-- GET /forms/:id/values/:recordId.
-- ============================================================

create table if not exists public.aura_form_custom_values (
  tenant_id    text        not null,
  schema_id    text        not null, -- e.g. 'hr.employee'
  record_id    text        not null, -- the created entity's id
  field_values jsonb       not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  primary key (tenant_id, schema_id, record_id)
);

alter table public.aura_form_custom_values enable row level security;
drop policy if exists tenant_isolation_policy on public.aura_form_custom_values;
create policy tenant_isolation_policy on public.aura_form_custom_values
  for all using (tenant_id = public.current_tenant_id());

-- @DOWN
drop table if exists public.aura_form_custom_values;
