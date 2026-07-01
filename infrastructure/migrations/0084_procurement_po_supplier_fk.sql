-- ============================================================
-- AURA OS — migration 0084: PO → supplier-master FK
-- ------------------------------------------------------------
-- A PO may bind to an approved supplier in the master (enforced
-- in the service). Nullable for legacy/free-text POs.
-- ============================================================

alter table public.aura_procurement_purchase_orders
  add column if not exists supplier_id uuid references public.aura_procurement_suppliers(id);

create index if not exists idx_proc_po_supplier on public.aura_procurement_purchase_orders(tenant_id, supplier_id);
