-- ============================================================
-- AURA OS — migration 0141: tender pricing sheet (cost & resource breakdown)
-- ------------------------------------------------------------
-- 1. Rate build-ups keep the STRUCTURED internal pricing sheet they were
--    compiled from (material supply, technician/engineer/PM manpower blocks,
--    transport, wastage %, accessories, subcontract) so the designer sheet
--    can be re-opened and edited — components stay the engine's source of truth.
-- 2. Quotations generated from a tender's pricing carry the source tender id
--    (reference, not a join), closing the loop: tender → internal costing →
--    client quotation.
-- ============================================================

alter table public.aura_tendering_rate_buildups
  add column if not exists resources jsonb;

alter table public.aura_crm_quotations
  add column if not exists source_tender_id uuid;

create index if not exists idx_crm_quotations_source_tender
  on public.aura_crm_quotations (tenant_id, source_tender_id)
  where source_tender_id is not null;

-- @DOWN
drop index if exists public.idx_crm_quotations_source_tender;
alter table public.aura_crm_quotations drop column if exists source_tender_id;
alter table public.aura_tendering_rate_buildups drop column if exists resources;
