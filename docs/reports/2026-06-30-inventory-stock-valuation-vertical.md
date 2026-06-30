# Module-depth vertical — Inventory Stock Valuation (WAC)

**Date:** 2026-06-30
**Module:** `@aura/inventory`
**Migration:** `0073_inventory_stock_valuation.sql` (applied live → DB at 73)

## What & why

Inventory tracked on-hand quantity but carried **no cost**, so there was no
inventory value and issues posted no COGS rate — a gap flagged across the audits
(competitor matrix: "Inventory valuation FIFO/WAC ✗"). This adds **moving
weighted-average cost (WAC)** as a backward-compatible extension of the existing
stock vertical (no parallel module):

- a **receipt** re-averages: `avg = (prevQty·prevAvg + inQty·inCost)/(prevQty+inQty)`
- an **issue** leaves the average unchanged and draws down at the running WAC
  (the movement's `unitCost` is the COGS rate)
- inventory **value** = on-hand × WAC, per item and as a grand total

## Changes (minimum diff, extends the stock vertical)

- **domain `stock.ts`** — `StockItem.avgCost`; `StockMovement.unitCost`/`valueAfter`;
  `NewStockItem.openingCost`, `NewStockMovement.unitCost`; pure `computeWac()` +
  `summariseValuation()`. `makeStockMovement` gained a `newAvgCost` param (defaulted,
  backward-compatible).
- **stores** — postgres persists `avg_cost`/`unit_cost`/`value_after`; in-memory
  unchanged (spreads full objects).
- **service** — `recordMovement` threads `unitCost` → `computeWac`; new
  `valuation(filter)`; movement event payload carries cost/value.
- **migration `0073`** — `ALTER ... ADD COLUMN IF NOT EXISTS` on the two existing
  stock tables (avg_cost, unit_cost, value_after), all defaulted 0 (safe on live rows).
- **API** — `GET /api/v1/inventory/stock/valuation` (literal before `:id`);
  `openingCost` on create, `unitCost` on movement.
- **web** — stock page/client: Cost/unit inputs, Avg cost + Value columns,
  per-movement Unit cost + Value, and a **Total inventory value (WAC)** banner.

## Verification

- `pnpm typecheck` **42/42**. `pnpm --filter @aura/inventory test` **16/16** (5 new:
  openingCost seed, `computeWac` re-average/issue/first-receipt, `summariseValuation`,
  service moving-average + valuation).
- **HTTP E2E** (in-memory store, `DATABASE_URL` unset, API on :4137):
  - create 100 @ 5 → `avgCost 5`
  - receive 100 @ 7 → WAC re-averages to **6**, `valueAfter 1200` (200×6), movement `unitCost 7`
  - issue 50 → avg stays **6**, COGS `unitCost 6`, `valueAfter 900` (150×6)
  - `/valuation` → `grandTotal 900`
  - over-issue → **HTTP 400** (insufficient stock)

## Live-DB verification (Supabase)

`apps/api/.env.local` configured → `pnpm db:migrate` applied `0073` (**1 applied,
73 current**). API booted against the live session-pooler; full lifecycle re-run on
the Postgres store: create 100 @ 5 → receive 100 @ 7 (WAC **6**, value 1200) →
issue 50 (COGS unit cost **6**, value 900); **re-fetched from the DB** confirming
persistence (`avgCost 6`, on-hand 150); `/valuation` line totalValue 900; over-issue
→ **400**. Test rows left in place (disposable `VAL-<ts>`).

## Next candidates

- FIFO/layered costing as an alternative method (WAC is the default).
- Post COGS to finance GL on issue (the `movement_recorded` event carries `unitCost`/`valueAfter` — the reactor seam).
- Reorder points / min-max → auto-PR.
