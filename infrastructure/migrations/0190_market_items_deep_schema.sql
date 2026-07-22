-- ============================================================
-- AURA OS — migration 0190: Market Intelligence, deeper
-- ------------------------------------------------------------
-- Turns the catalogue from a price list into a market KNOWLEDGE base. Adds the
-- facts an estimator and the Copilot actually need: exact identity (SKU,
-- manufacturer, model, origin), the price SPREAD (min/max/avg — not one number),
-- delivery & productivity (lead time, warranty, crew size), the knowledge graph
-- (alternatives, datasheet, image), and a CONFIDENCE score so a shaky benchmark is
-- not quoted as gospel. All nullable — existing rows keep working, enriched over time.
-- ============================================================

alter table public.aura_crm_market_items
  add column if not exists sku                text,
  add column if not exists manufacturer       text,
  add column if not exists model              text,
  add column if not exists country_of_origin  text,
  add column if not exists min_price          numeric(18,2),
  add column if not exists max_price          numeric(18,2),
  add column if not exists avg_price          numeric(18,2),
  add column if not exists lead_time_days      integer,
  add column if not exists warranty_months     integer,
  add column if not exists crew_size           integer,
  add column if not exists alternative_ids     jsonb not null default '[]'::jsonb,
  add column if not exists datasheet_url       text,
  add column if not exists image_url           text,
  add column if not exists confidence          integer not null default 60;

-- @DOWN
alter table public.aura_crm_market_items
  drop column if exists sku,
  drop column if exists manufacturer,
  drop column if exists model,
  drop column if exists country_of_origin,
  drop column if exists min_price,
  drop column if exists max_price,
  drop column if exists avg_price,
  drop column if exists lead_time_days,
  drop column if exists warranty_months,
  drop column if exists crew_size,
  drop column if exists alternative_ids,
  drop column if exists datasheet_url,
  drop column if exists image_url,
  drop column if exists confidence;
