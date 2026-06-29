-- Procurement supplier (vendor) master — the approved-vendor registry behind POs/RFQs
CREATE TABLE IF NOT EXISTS public.aura_procurement_suppliers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     text NOT NULL,
  company_id    text,
  code          text NOT NULL,
  name          text NOT NULL,
  category      text NOT NULL DEFAULT 'materials' CHECK (category IN ('materials','subcontractor','services','equipment','other')),
  trade_license text,
  trn           text,
  contact_name  text,
  email         text,
  phone         text,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','suspended')),
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON public.aura_procurement_suppliers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_status ON public.aura_procurement_suppliers(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_suppliers_category ON public.aura_procurement_suppliers(tenant_id, category);
