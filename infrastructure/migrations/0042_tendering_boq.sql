-- ============================================================
-- AURA OS — migration 0042: Tendering BOQ & Estimating
-- ------------------------------------------------------------
-- Mapped to aura_tendering_boqs and aura_tendering_boq_items.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.aura_tendering_boqs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      TEXT        NOT NULL,
  company_id     TEXT,
  tender_id      UUID        NOT NULL REFERENCES public.aura_tendering_tenders(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_boq_tender UNIQUE (tender_id)
);

CREATE TABLE IF NOT EXISTS public.aura_tendering_boq_items (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      TEXT        NOT NULL,
  company_id     TEXT,
  boq_id         UUID        NOT NULL REFERENCES public.aura_tendering_boqs(id) ON DELETE CASCADE,
  item_code      TEXT        NOT NULL, -- hierarchy like 1.1, 1.1.1
  description    TEXT        NOT NULL,
  unit           TEXT        NOT NULL, -- m3, ton, sqm, etc.
  quantity       NUMERIC     NOT NULL DEFAULT 0,
  rate           NUMERIC     NOT NULL DEFAULT 0,
  total_amount   NUMERIC     NOT NULL DEFAULT 0,
  ifc_guid       TEXT,                 -- BIM IFC GUID mapping link
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_aura_boq_tenant ON public.aura_tendering_boqs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_aura_boq_tender ON public.aura_tendering_boqs (tender_id);
CREATE INDEX IF NOT EXISTS idx_aura_boq_item_boq ON public.aura_tendering_boq_items (boq_id);
CREATE INDEX IF NOT EXISTS idx_aura_boq_item_code ON public.aura_tendering_boq_items (boq_id, item_code);

-- Enable RLS
ALTER TABLE public.aura_tendering_boqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_tendering_boq_items ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY tendering_boqs_rls ON public.aura_tendering_boqs
  FOR ALL USING (tenant_id = public.current_tenant_id());

CREATE POLICY tendering_boq_items_rls ON public.aura_tendering_boq_items
  FOR ALL USING (tenant_id = public.current_tenant_id());
