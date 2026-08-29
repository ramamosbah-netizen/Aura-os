-- ============================================================
-- AURA OS — migration 0266: Radar bounded-query indexes
-- ------------------------------------------------------------
-- Supports the canonical tenant-scoped Radar ordering and the most common
-- owner queue query. Search remains an ILIKE capability; no speculative
-- trigram index is added before production query-plan evidence exists.
-- ============================================================

create index if not exists idx_crm_signals_tenant_detected
  on public.aura_crm_signals (tenant_id, detected_at desc, id desc);

create index if not exists idx_crm_signals_tenant_owner_detected
  on public.aura_crm_signals (tenant_id, owner_id, detected_at desc, id desc);

-- @DOWN
drop index if exists public.idx_crm_signals_tenant_owner_detected;
drop index if exists public.idx_crm_signals_tenant_detected;
