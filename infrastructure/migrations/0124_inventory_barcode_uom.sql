-- ============================================================
-- AURA OS — migration 0124: inventory barcode + multi-UOM
-- ------------------------------------------------------------
-- Stock items get a scannable barcode (unique per tenant when set) and a jsonb set of
-- alternative UOMs ({unit, factor} = base units per 1 alt unit). Movements entered in an
-- alt unit convert to base in the service.
-- ============================================================

alter table public.aura_inventory_stock_items
  add column if not exists barcode text,
  add column if not exists alt_units jsonb not null default '[]'::jsonb;

create unique index if not exists uq_stock_items_tenant_barcode
  on public.aura_inventory_stock_items (tenant_id, barcode)
  where barcode is not null;
