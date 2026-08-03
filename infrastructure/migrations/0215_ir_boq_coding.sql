-- ============================================================
-- AURA OS — migration 0215: code inspection requests to a BOQ item (the APPROVED quantity strand)
-- ------------------------------------------------------------
-- The Quantity Ledger's Approved position. An Inspection Request (IR) can name the BOQ (measured)
-- item it covers, plus the quantity presented for approval + unit. When the IR is APPROVED,
-- quality.ir.approved posts +approved to the Quantity Ledger — the item's Approved position is
-- SUM(this). The gap Installed − Approved is the inspection backlog; Approved − Invoiced is what is
-- billable but not yet certified. All nullable + additive. Owned by quality.
-- ============================================================

alter table public.aura_quality_irs add column if not exists boq_item_id text;
alter table public.aura_quality_irs add column if not exists approved_quantity numeric;
alter table public.aura_quality_irs add column if not exists unit text;

-- @DOWN
alter table public.aura_quality_irs drop column if exists unit;
alter table public.aura_quality_irs drop column if exists approved_quantity;
alter table public.aura_quality_irs drop column if exists boq_item_id;
