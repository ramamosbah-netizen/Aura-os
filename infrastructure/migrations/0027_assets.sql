-- Migration 0027: Assets, Warranties, Calibrations & Inspections
-- Up

CREATE TABLE IF NOT EXISTS public.aura_assets (
  id                    UUID PRIMARY KEY,
  tenant_id             TEXT NOT NULL,
  company_id            TEXT,
  name                  TEXT NOT NULL,
  serial_number         TEXT NOT NULL UNIQUE,
  category              TEXT NOT NULL,
  purchase_date         DATE NOT NULL,
  purchase_cost         NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  status                TEXT NOT NULL DEFAULT 'active', -- active, maintenance, inactive, disposed
  warranty_expiry       DATE,
  next_calibration_date DATE,
  next_inspection_date  DATE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.aura_asset_maintenance (
  id            UUID PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  company_id    TEXT,
  asset_id      UUID NOT NULL REFERENCES public.aura_assets(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  description   TEXT NOT NULL,
  cost          NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  status        TEXT NOT NULL DEFAULT 'scheduled', -- scheduled, completed
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.aura_asset_inspections (
  id            UUID PRIMARY KEY,
  tenant_id     TEXT NOT NULL,
  company_id    TEXT,
  asset_id      UUID NOT NULL REFERENCES public.aura_assets(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  inspector     TEXT NOT NULL,
  result        TEXT NOT NULL DEFAULT 'pass', -- pass, fail
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.aura_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_asset_maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aura_asset_inspections ENABLE ROW LEVEL SECURITY;
