-- ============================================================
-- AURA OS — migration 0357: a discount declares WHICH KIND of discount it is (PO-01)
-- ------------------------------------------------------------
-- PO-01 gave quotation lines and purchase-order lines a discount, and answered the question that
-- forced: what is a discounted line worth when only part of it arrives? Pro rata — a reduction of
-- the line, earned with the quantity delivered.
--
-- That answer is correct for the kind of discount AURA records today, and ONLY for that kind. It is
-- not a general truth about discounts, and the field as it stood invited it to be read as one:
--
--   a HEADER discount          belongs to the order, not to any line, and pushing it down invents a
--                              per-item cost nobody quoted — the same reason freight is never
--                              allocated across lines
--   a CONDITIONAL rebate       is earned on a condition (annual volume, a framework tier) that is
--                              not known at receipt, so it cannot reduce a line at delivery
--   an EARLY-PAYMENT discount  is earned by PAYING early, not by receiving. It never belongs in the
--                              goods value at all; it is a financing term
--
-- Each would need its own answer about receipt, matching and cost. So the kind is declared on the
-- row rather than assumed by whoever reads it next, and the check constraint admits exactly one
-- value today: introducing a second kind is a schema change, which is a decision somebody has to
-- make on purpose.
-- ============================================================

alter table public.aura_procurement_quotation_lines
  add column if not exists line_discount_basis text;
alter table public.aura_procurement_purchase_order_lines
  add column if not exists line_discount_basis text;

-- NULL iff there is no discount. A discount without a declared kind, or a kind with no discount, is
-- a half-stated commercial term, and half-stated is how a wrong reading gets in.
alter table public.aura_procurement_quotation_lines
  drop constraint if exists aura_quotation_line_discount_basis;
alter table public.aura_procurement_quotation_lines
  add constraint aura_quotation_line_discount_basis check (
    (line_discount is null and line_discount_basis is null)
    or (line_discount is not null and line_discount_basis = 'line_unconditional_prorata')
  );

alter table public.aura_procurement_purchase_order_lines
  drop constraint if exists aura_po_line_discount_basis;
alter table public.aura_procurement_purchase_order_lines
  add constraint aura_po_line_discount_basis check (
    (line_discount is null and line_discount_basis is null)
    or (line_discount is not null and line_discount_basis = 'line_unconditional_prorata')
  );

-- Rows captured before the kind existed carry an unconditional line discount, because that is the
-- only kind the capture surface could express. Stated rather than left NULL: NULL would mean "no
-- discount", and these rows have one.
update public.aura_procurement_quotation_lines
   set line_discount_basis = 'line_unconditional_prorata'
 where line_discount is not null and line_discount_basis is null;
update public.aura_procurement_purchase_order_lines
   set line_discount_basis = 'line_unconditional_prorata'
 where line_discount is not null and line_discount_basis is null;

comment on column public.aura_procurement_purchase_order_lines.line_discount_basis is
  'WHICH KIND of discount line_discount is. Only line_unconditional_prorata exists: a reduction of this line, earned pro rata with the quantity delivered. A header discount, a conditional rebate and an early-payment discount are NOT this and must not be recorded here.';
comment on column public.aura_procurement_quotation_lines.line_discount_basis is
  'WHICH KIND of discount line_discount is. See the purchase-order-line column of the same name.';

-- @DOWN
alter table public.aura_procurement_purchase_order_lines
  drop constraint if exists aura_po_line_discount_basis;
alter table public.aura_procurement_quotation_lines
  drop constraint if exists aura_quotation_line_discount_basis;
alter table public.aura_procurement_purchase_order_lines
  drop column if exists line_discount_basis;
alter table public.aura_procurement_quotation_lines
  drop column if exists line_discount_basis;
