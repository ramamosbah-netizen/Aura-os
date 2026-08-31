-- AURA OS — migration 0272: PD-5A immutable Contract → Project handover envelope
-- Additive only. The application must populate these fields from an accepted/signed source bundle;
-- this migration does not infer historical lineage or backfill mutable Tender/Quotation state.

alter table public.aura_contracts_contracts
  add column if not exists source_opportunity_id text,
  add column if not exists currency text,
  add column if not exists commercial_scope_revision_id text,
  add column if not exists boq_revision_id text,
  add column if not exists estimate_revision_id text,
  add column if not exists accepted_quotation_id text,
  add column if not exists accepted_quotation_revision_id text,
  add column if not exists award_acceptance_type text,
  add column if not exists award_acceptance_evidence jsonb;

alter table public.aura_projects_projects
  add column if not exists origin text not null default 'legacy',
  add column if not exists handover_id uuid,
  add column if not exists handover_snapshot_hash text,
  add column if not exists handover_snapshot jsonb,
  add column if not exists handover_locked_at timestamptz,
  add column if not exists source_opportunity_id text,
  add column if not exists source_tender_id text,
  add column if not exists commercial_scope_revision_id text,
  add column if not exists boq_revision_id text,
  add column if not exists estimate_revision_id text,
  add column if not exists accepted_quotation_id text,
  add column if not exists accepted_quotation_revision_id text,
  add column if not exists commercial_baseline_id text,
  add column if not exists original_contract_value numeric,
  add column if not exists currency text,
  add column if not exists award_acceptance_type text,
  add column if not exists award_acceptance_evidence jsonb;

create unique index if not exists uq_aura_projects_handover_contract
  on public.aura_projects_projects (tenant_id, contract_id)
  where contract_id is not null;

alter table public.aura_projects_cbs_nodes
  add column if not exists source_revision_id text,
  add column if not exists handover_locked boolean not null default false;

-- Existing rows remain explicitly legacy; only the signed-event path may stamp a governed handover.
do $$ begin
  alter table public.aura_projects_projects
    add constraint aura_projects_origin_ck
    check (origin in ('commercial_handover', 'internal', 'legacy'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.aura_projects_projects
    add constraint aura_projects_handover_evidence_ck
    check (
      origin <> 'commercial_handover'
      or (contract_id is not null and handover_id is not null and handover_locked_at is not null
          and handover_snapshot_hash is not null and handover_snapshot is not null)
    );
exception when duplicate_object then null;
end $$;

-- @DOWN
drop index if exists public.uq_aura_projects_handover_contract;
alter table public.aura_projects_projects
  drop constraint if exists aura_projects_handover_evidence_ck,
  drop constraint if exists aura_projects_origin_ck;
alter table public.aura_projects_cbs_nodes
  drop column if exists handover_locked,
  drop column if exists source_revision_id;
alter table public.aura_projects_projects
  drop column if exists award_acceptance_evidence,
  drop column if exists award_acceptance_type,
  drop column if exists currency,
  drop column if exists original_contract_value,
  drop column if exists commercial_baseline_id,
  drop column if exists accepted_quotation_revision_id,
  drop column if exists accepted_quotation_id,
  drop column if exists estimate_revision_id,
  drop column if exists boq_revision_id,
  drop column if exists commercial_scope_revision_id,
  drop column if exists source_tender_id,
  drop column if exists source_opportunity_id,
  drop column if exists handover_locked_at,
  drop column if exists handover_snapshot,
  drop column if exists handover_snapshot_hash,
  drop column if exists handover_id,
  drop column if exists origin;
alter table public.aura_contracts_contracts
  drop column if exists award_acceptance_evidence,
  drop column if exists award_acceptance_type,
  drop column if exists accepted_quotation_revision_id,
  drop column if exists accepted_quotation_id,
  drop column if exists estimate_revision_id,
  drop column if exists boq_revision_id,
  drop column if exists commercial_scope_revision_id,
  drop column if exists currency,
  drop column if exists source_opportunity_id;
