-- ============================================================
-- AURA OS — migration 0224: QA/QC NCR corrective-action workflow
-- ------------------------------------------------------------
-- Turns the NCR from a settable status into a governed corrective-action loop and adds the
-- close-out verification audit trail.
--   * aura_quality_ncrs gains IR provenance + workflow-stamp columns. `status` stays free-text
--     (existing raised|corrected|closed rows remain valid); the machine
--     (raised → action_planned → corrected → closed, reject loops back) is enforced in the domain.
--     The corrective action reuses the existing `proposed_correction` column — no new column.
--   * aura_quality_ncr_verifications — the immutable QA verification record (accepted ⇒ closed,
--     rejected ⇒ re-correct), FORCE-RLS tenant-isolated like every business table.
-- ============================================================

alter table public.aura_quality_ncrs add column if not exists source_ir_id      uuid;
alter table public.aura_quality_ncrs add column if not exists source_ir_number  text;
alter table public.aura_quality_ncrs add column if not exists action_planned_at timestamptz;
alter table public.aura_quality_ncrs add column if not exists corrected_by      text;
alter table public.aura_quality_ncrs add column if not exists corrected_at      timestamptz;
alter table public.aura_quality_ncrs add column if not exists verified_by       text;
alter table public.aura_quality_ncrs add column if not exists verified_at       timestamptz;
alter table public.aura_quality_ncrs add column if not exists closed_at         timestamptz;

create table if not exists public.aura_quality_ncr_verifications (
  id           uuid        primary key,
  tenant_id    text        not null,
  company_id   text,
  ncr_id       uuid        not null,
  ncr_number   text        not null,
  project_id   text        not null,
  verified_by  text,
  verified_at  timestamptz not null default now(),
  outcome      text        not null, -- accepted | rejected
  note         text
);

create index if not exists idx_quality_ncr_verifications_ncr on public.aura_quality_ncr_verifications (tenant_id, ncr_id);

alter table public.aura_quality_ncr_verifications enable row level security;
alter table public.aura_quality_ncr_verifications force row level security;

drop policy if exists tenant_isolation on public.aura_quality_ncr_verifications;
create policy tenant_isolation on public.aura_quality_ncr_verifications
  using (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null)
  with check (tenant_id::text = public.current_tenant_id() and public.current_tenant_id() is not null);

-- @DOWN
drop table if exists public.aura_quality_ncr_verifications;
alter table public.aura_quality_ncrs drop column if exists source_ir_id;
alter table public.aura_quality_ncrs drop column if exists source_ir_number;
alter table public.aura_quality_ncrs drop column if exists action_planned_at;
alter table public.aura_quality_ncrs drop column if exists corrected_by;
alter table public.aura_quality_ncrs drop column if exists corrected_at;
alter table public.aura_quality_ncrs drop column if exists verified_by;
alter table public.aura_quality_ncrs drop column if exists verified_at;
alter table public.aura_quality_ncrs drop column if exists closed_at;
