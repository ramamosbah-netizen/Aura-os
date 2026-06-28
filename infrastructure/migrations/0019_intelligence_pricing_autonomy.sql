-- Migration: Intelligence & Optimization layer tables
-- IEC pricing engine sources/calibrations + autonomy proposal queue + vector store

-- pgvector for embedding-based semantic search (Supabase supports this natively).
CREATE EXTENSION IF NOT EXISTS vector;

-- Historical pricing observations from POs, quotes, subcontracts — the raw evidence
-- the IEC calibrator uses to compute trust-weighted calibrated rates.
CREATE TABLE IF NOT EXISTS public.aura_pricing_sources (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   TEXT NOT NULL,
  item_code   TEXT NOT NULL,
  description TEXT,
  source_type TEXT NOT NULL DEFAULT 'po',          -- po | quote | subcontract | manual
  unit_price  NUMERIC(14,4) NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'AED',
  quantity    NUMERIC(14,4) NOT NULL DEFAULT 1,
  supplier_id TEXT,
  project_id  TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pricing_sources_tenant ON public.aura_pricing_sources (tenant_id, item_code);

-- Calibrated rates — the output of the IEC 4-layer pricing algorithm. Each row is the
-- latest calibrated truth for one item_code within a tenant.
CREATE TABLE IF NOT EXISTS public.aura_pricing_calibrations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        TEXT NOT NULL,
  item_code        TEXT NOT NULL,
  description      TEXT,
  calibrated_price NUMERIC(14,4) NOT NULL,
  reality_gap      NUMERIC(8,4) NOT NULL DEFAULT 0,    -- % gap vs original estimate
  source_count     INT NOT NULL DEFAULT 0,
  avg_trust_score  NUMERIC(6,4) NOT NULL DEFAULT 1,
  currency         TEXT NOT NULL DEFAULT 'AED',
  calibrated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, item_code)
);

-- Autonomy proposals — the queue of AI-suggested actions pending review or auto-execution.
-- Each row represents a single proposal from the Intelligence layer to a business module.
CREATE TABLE IF NOT EXISTS public.aura_autonomy_proposals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  category      TEXT NOT NULL DEFAULT 'general',       -- pricing | cost | approval | risk
  severity      TEXT NOT NULL DEFAULT 'info',          -- info | warning | critical
  mode          TEXT NOT NULL DEFAULT 'suggest',       -- observe | suggest | assist | operate
  target_module TEXT,                                  -- e.g. finance, procurement, projects
  target_action TEXT,                                  -- e.g. approve_invoice, adjust_price
  target_id     TEXT,                                  -- aggregate id to act on
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  value_amount  NUMERIC(14,2),                         -- monetary value for safety threshold
  status        TEXT NOT NULL DEFAULT 'pending',       -- pending | approved | rejected | executed
  decided_by    TEXT,
  decided_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autonomy_proposals_tenant ON public.aura_autonomy_proposals (tenant_id, status);

-- Vector store for RAG-based semantic search and cognitive memory.
CREATE TABLE IF NOT EXISTS public.aura_vector_store (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  TEXT NOT NULL,
  content    TEXT NOT NULL,
  metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding  vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vector_store_tenant ON public.aura_vector_store (tenant_id);
