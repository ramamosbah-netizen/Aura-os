-- Wave 4 — a supplier quotation carries the SUPPLIER it came from, and the terms it was given under.
--
-- A quotation was a header with a free-text `supplier_name`, one scalar `amount`, and a lead time.
-- Two separate problems live in that row.
--
-- IDENTITY. A supplier master already exists (code, name, category, trade licence, TRN, status) and
-- the quotation typed a name instead of referencing it. That is the same defect `BUY-01` fixed for
-- materials and 0304 fixed for a material approval's supplier: two suppliers share a name, one
-- supplier gets typed three ways, and every downstream link silently misses. `supplier_id` is added
-- here and validated on write.
--
-- TERMS. `amount` alone cannot support a decision. A price means nothing without the currency it is
-- in, whether tax is inside or outside it, what freight was quoted separately, how long the offer
-- stands, and on what payment terms — and a comparison built on the bare number silently ranks an
-- offer excluding freight and VAT above one that includes both. These are the QUOTATION-level facts
-- (SUP-06, SUP-07, SUP-08, SUP-10, SUP-12); the per-item facts live on the line (0344).
--
-- ORIGINAL FACTS, PRESERVED AS GIVEN. Nothing here is normalised, converted or recomputed. The
-- supplier's own currency and terms are kept exactly as quoted, and any comparable value is DERIVED
-- from them later against the Finance FX authority with its own provenance. A normalised number
-- stored beside the original would be a second commercial truth free to disagree with it.
--
-- EVERY COLUMN IS NULLABLE AND NOTHING IS BACKFILLED. NULL means the fact was not recorded, which is
-- UNKNOWN and is not zero, not "tax exclusive", and not "no freight". A quotation that cannot say
-- what currency it is in is not comparable, and later slices must refuse to compare it rather than
-- assume the base currency. Existing rows predate all of this and are left exactly as they are.

alter table public.aura_procurement_rfq_quotes
  add column if not exists supplier_id     uuid,
  -- The currency the offer is made in. NULL is UNKNOWN, never the company's base currency.
  add column if not exists currency        text,
  -- 'exclusive' | 'inclusive' | 'exempt'. NULL is UNKNOWN: whether tax sits inside the price or
  -- outside it changes what the price MEANS, and guessing makes two offers look comparable.
  add column if not exists tax_treatment   text,
  add column if not exists tax_rate_pct    numeric(9,4),
  -- Freight quoted as a separate charge for the whole quotation, with the terms it was given under
  -- (an incoterm, or the supplier's own wording). A quote-level charge belongs here rather than
  -- being spread across lines, which would invent an allocation the supplier never made.
  add column if not exists freight_amount  numeric(18,4),
  add column if not exists freight_terms   text,
  add column if not exists payment_terms   text,
  -- How long the offer stands. An expired quotation is a fact about the offer, not a defect.
  add column if not exists validity_date   date;

alter table public.aura_procurement_rfq_quotes
  drop constraint if exists aura_rfq_quotes_tax_treatment;
alter table public.aura_procurement_rfq_quotes
  add constraint aura_rfq_quotes_tax_treatment
  check (tax_treatment is null or tax_treatment in ('exclusive','inclusive','exempt'));

comment on column public.aura_procurement_rfq_quotes.supplier_id is
  'Canonical supplier. NULL = a legacy quotation that named its supplier in free text only; never backfilled by matching names.';
comment on column public.aura_procurement_rfq_quotes.currency is
  'The currency this offer is made in. NULL = UNKNOWN and NOT the base currency — an offer with no currency is not comparable.';

create index if not exists idx_aura_rfq_quotes_supplier
  on public.aura_procurement_rfq_quotes (tenant_id, supplier_id)
  where supplier_id is not null;

-- @DOWN
DROP INDEX IF EXISTS idx_aura_rfq_quotes_supplier;
ALTER TABLE public.aura_procurement_rfq_quotes DROP CONSTRAINT IF EXISTS aura_rfq_quotes_tax_treatment;
ALTER TABLE public.aura_procurement_rfq_quotes
  DROP COLUMN IF EXISTS supplier_id,
  DROP COLUMN IF EXISTS currency,
  DROP COLUMN IF EXISTS tax_treatment,
  DROP COLUMN IF EXISTS tax_rate_pct,
  DROP COLUMN IF EXISTS freight_amount,
  DROP COLUMN IF EXISTS freight_terms,
  DROP COLUMN IF EXISTS payment_terms,
  DROP COLUMN IF EXISTS validity_date;
