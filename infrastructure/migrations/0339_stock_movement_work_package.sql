-- BUY-07 — a stock movement can name the WORK PACKAGE it was delivered to.
--
-- A movement already carried `project_id`, `cbs_node_id` and `boq_item_id`. It could say which
-- project consumed the material and which measured item and cost line it belonged to, but never
-- which WORK PACKAGE it was delivered to — `wbs_node_id` appears nowhere in the Inventory module.
-- Meanwhile a requisition line (0335) and a purchase order line (0336) both carry the work package
-- faithfully, so procurement knows what material was bought FOR a package and inventory cannot say
-- what was delivered TO one. The coding is captured at the requisition and consumed by nobody.
--
-- THE HANDOFF STARTS AT THE ISSUE, NOT AT THE RECEIPT. Material arriving at a warehouse has not
-- reached a work package; the issue is the movement that physically crosses Store -> Site. So this
-- is the record that has to carry the destination.
--
-- NULLABLE, AND DELIBERATELY NOT BACKFILLED.
--
--   A project issue does not inherently mean delivery to a work package. `BUY-06` established a
--   legitimate authority -- material issued against a project and a BOQ item -- that claims no
--   particular work-package destination, and that authority is extended here rather than redefined.
--
--   NULL therefore has an honest meaning of its own: NO WORK-PACKAGE DESTINATION WAS DECLARED. It is
--   never zero delivery, and it is never a "legacy delivery" to be guessed at. There is deliberately
--   no LEGACY discriminator: a selectable one would let somebody choose the unmeasured shape for new
--   work, and inventing one for history would write a guess into a provenance column.
--
--   ABOVE ALL IT IS NEVER INFERRED FROM `boq_item_id`. Resolving a delivery by finding the WBS nodes
--   whose `boq_item_id` matches the movement's would convert missing provenance into manufactured
--   provenance, and is plainly wrong the moment two packages measure against the same BOQ item.
--   The column exists precisely so the destination is recorded rather than reconstructed.
--
-- Ownership is unchanged. Inventory stores a validated destination reference, exactly as it already
-- stores `project_id`; the work-package structure remains Projects' (ADR-0004), and Inventory
-- validates through a declared port rather than importing it.

alter table public.aura_inventory_stock_movements
  add column if not exists wbs_node_id text;

comment on column public.aura_inventory_stock_movements.wbs_node_id is
  'Work package this movement was delivered to. NULL = no work-package destination declared (UNKNOWN), never zero and never inferred from boq_item_id.';

-- The BUY-07 read is "what reached THIS work package", so the index is on the destination and only
-- covers rows that actually declare one -- the NULLs are a different question, answered at project
-- level as "issued to project, work package not specified".
create index if not exists aura_stock_movements_wbs_node_idx
  on public.aura_inventory_stock_movements (tenant_id, wbs_node_id)
  where wbs_node_id is not null;

-- @DOWN
DROP INDEX IF EXISTS aura_stock_movements_wbs_node_idx;
ALTER TABLE public.aura_inventory_stock_movements DROP COLUMN IF EXISTS wbs_node_id;
