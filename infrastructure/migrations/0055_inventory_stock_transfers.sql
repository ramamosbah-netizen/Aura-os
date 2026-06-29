-- Stock transfers between warehouses
CREATE TABLE IF NOT EXISTS public.aura_inventory_stock_transfers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text NOT NULL,
  source_item_id uuid NOT NULL REFERENCES public.aura_inventory_stock_items(id),
  dest_item_id  uuid NOT NULL REFERENCES public.aura_inventory_stock_items(id),
  quantity      numeric(18,4) NOT NULL CHECK (quantity > 0),
  reason        text NOT NULL DEFAULT 'warehouse transfer',
  status        text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','cancelled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_tenant ON public.aura_inventory_stock_transfers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_source ON public.aura_inventory_stock_transfers(source_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_dest   ON public.aura_inventory_stock_transfers(dest_item_id);
