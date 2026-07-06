-- ============================================================
-- AURA OS — migration 0131: `discipline` shared dimension on procurement spend
-- ------------------------------------------------------------
-- ADR-0012 (Shared Dimensions): `discipline` was promoted to @aura/shared on its 2nd consumer
-- (Procurement, after Engineering) per the Rule of Three. Tag purchase orders + requests with the
-- trade/discipline so spend can be filtered/reported by discipline and gated by discipline-scoped
-- ABAC — one vocabulary shared with Engineering. Backfilled default 'other'.
-- ============================================================

alter table if exists public.aura_procurement_purchase_orders
  add column if not exists discipline text not null default 'other';

alter table if exists public.aura_procurement_purchase_requests
  add column if not exists discipline text not null default 'other';

create index if not exists idx_po_discipline on public.aura_procurement_purchase_orders (tenant_id, discipline);
create index if not exists idx_pr_discipline on public.aura_procurement_purchase_requests (tenant_id, discipline);
