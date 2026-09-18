-- ============================================================
-- AURA OS — migration 0354: a purchase order preserves the supplier's own terms (SUP-14)
-- ------------------------------------------------------------
-- The award raised a purchase order from a single header number and nothing else: no lines, no
-- currency beyond the column's default, no tax treatment, no freight, no payment terms, and no trace
-- of which quotation it came from. SUP-14's own criterion — "the resulting PO preserves item costs
-- and terms without retyping" — was not met by the path that existed.
--
-- THE PO IS THE SUPPLIER'S CONTRACT, NOT THE COMPARISON. This is the distinction the whole record
-- turns on: a USD 100/unit offer becomes a purchase order at USD 100/unit. SUP-06's normalised
-- AED 367.25 is a DECISION value — it exists so a buyer could weigh offers against each other, and
-- writing it onto the order would silently redenominate a supplier's contract into a currency they
-- never quoted. The comparison rate and its provenance belong in the recommendation and the audit
-- trail; they are not the order's commercial authority.
--
-- So the header carries the terms the offer was made on, and `sourcing_recommendation_id` records
-- the governed decision that produced it — a purchase order that cannot say which approved
-- recommendation raised it is a spend nobody can trace back to an authority.
-- ============================================================

alter table public.aura_procurement_purchase_orders
  -- The governed decision this order came from. NULL = raised outside a sourcing recommendation.
  add column if not exists sourcing_recommendation_id uuid,
  -- The offer revision it was awarded from, so the order's terms can be read against their source.
  add column if not exists quotation_revision_id      uuid,
  -- The SUPPLIER'S own reference for the quotation, as they wrote it.
  add column if not exists supplier_quotation_ref     text,
  -- Commercial terms, carried across exactly as quoted. NULL is UNKNOWN throughout, never a default:
  -- an order whose tax treatment nobody stated must not read as tax-exclusive by accident.
  add column if not exists tax_treatment              text,
  add column if not exists tax_rate_pct               numeric(9,4),
  add column if not exists freight_amount             numeric(18,4),
  add column if not exists freight_terms              text,
  add column if not exists payment_terms              text;

alter table public.aura_procurement_purchase_orders
  drop constraint if exists aura_po_tax_treatment;
alter table public.aura_procurement_purchase_orders
  add constraint aura_po_tax_treatment
  check (tax_treatment is null or tax_treatment in ('exclusive','inclusive','exempt'));

create index if not exists idx_aura_po_sourcing_recommendation
  on public.aura_procurement_purchase_orders (tenant_id, sourcing_recommendation_id)
  where sourcing_recommendation_id is not null;

-- A line keeps the discount and the per-item lead time the supplier quoted. Lead time is per item
-- because one overall figure cannot say when each item arrives (migration 0346).
alter table public.aura_procurement_purchase_order_lines
  add column if not exists line_discount  numeric(18,4),
  add column if not exists lead_time_days integer;

comment on column public.aura_procurement_purchase_orders.sourcing_recommendation_id is
  'The approved sourcing recommendation that raised this order (SUP-13). NULL = raised outside one.';
comment on column public.aura_procurement_purchase_orders.currency is
  'The SUPPLIER''S quoted currency, carried across unchanged. Never the comparison currency: a normalised value is a decision aid, not the contract.';

-- @DOWN
drop index if exists public.idx_aura_po_sourcing_recommendation;
alter table public.aura_procurement_purchase_order_lines
  drop column if exists lead_time_days,
  drop column if exists line_discount;
alter table public.aura_procurement_purchase_orders
  drop constraint if exists aura_po_tax_treatment;
alter table public.aura_procurement_purchase_orders
  drop column if exists payment_terms,
  drop column if exists freight_terms,
  drop column if exists freight_amount,
  drop column if exists tax_rate_pct,
  drop column if exists tax_treatment,
  drop column if exists supplier_quotation_ref,
  drop column if exists quotation_revision_id,
  drop column if exists sourcing_recommendation_id;
