# Module-depth vertical — Inventory Reorder Levels (min/max replenishment)

**Date:** 2026-06-30
**Module:** `@aura/inventory`
**Migration:** `0074_inventory_reorder_levels.sql` (applied live → DB at 74)

## What & why

Stock tracked on-hand and (since `0073`) value, but had no **replenishment policy**,
so nothing told the buyer when to reorder — a gap flagged in the audits ("reorder
points / min-max"). This adds a per-item reorder policy and a watch-list, extending
the existing stock vertical (no parallel module):

- `reorderLevel` — trigger threshold; when on-hand ≤ level the item needs reordering (0 = no policy)
- `reorderQty` — suggested order quantity when triggered (0 = top up to the level)

## Changes (extends the stock vertical)

- **domain `stock.ts`** — `StockItem.reorderLevel`/`reorderQty`; `NewStockItem` inputs;
  pure `isBelowReorder()`, `suggestedReorderQty()`, `summariseReorder()` (triggered items,
  shortest-deficit first). New event `inventory.stock.reorder_policy_set`.
- **stores** — postgres persists `reorder_level`/`reorder_qty` (insert + update); in-memory unchanged.
- **service** — `setReorderPolicy(id, level, qty)` (emits) + `reorderReport(filter)`.
- **migration `0074`** — `ADD COLUMN IF NOT EXISTS` (both defaulted 0; safe on live rows).
- **API** — `GET /api/v1/inventory/stock/reorder` (literal before `:id`),
  `PATCH /api/v1/inventory/stock/:id/reorder`; `reorderLevel`/`reorderQty` on create.
- **web** — stock client: reorder-policy setter in the item detail, a "reorder" badge
  on triggered rows, and a "N items at/below reorder level" banner; BFF routes for both endpoints.

## Verification

- `pnpm typecheck` **42/42**. `pnpm --filter @aura/inventory test` **20/20** (4 new:
  `isBelowReorder`, `suggestedReorderQty`, `summariseReorder`, service set-policy+report+clear).
- **Live-DB E2E** (Supabase, API on :4139): create on-hand 8 → set policy (level 10,
  qty 40) → `/reorder` lists it with `suggestedQty 40` → receive 50 (on-hand 58) →
  watch-list **clears** → negative level → **400**.

## Next candidates

- Reactor: `reorder_policy_set` / low-stock on `movement_recorded` → auto-draft a PR
  in procurement (the `suggestedQty` is the seam; mirrors the COGS→GL idea from `0073`).
- COGS→GL posting on issue (still open from the valuation vertical).
