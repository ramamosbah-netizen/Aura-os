# Cross-module reactor — Low-stock → auto-draft replenishment PR

**Date:** 2026-06-30
**Modules:** `@aura/inventory` (event) → `@aura/procurement` (reaction)
**Migration:** none (reactor + event-payload enrichment only)

## What & why

Closes the loop the reorder-levels vertical (`0074`) opened. Inventory could flag
items below their reorder level but nothing acted on it. Now, when an **issue**
drops on-hand from above the reorder level to at/below it, the cross-module
subscriber auto-drafts a **purchase request** for the suggested quantity — the
inventory→procurement counterpart of the existing `ipc.certified → AR` and
`backcharge.recovered → AP` reactors.

## Design

- **Event payload enriched** — `inventory.stock.movement_recorded` now carries
  `name`, `unit`, `reorderLevel`, `reorderQty` (alongside the existing
  `code`/`direction`/`quantity`/`balanceAfter`/`avgCost`), so the reactor is
  self-contained (no lookup/join).
- **Reactor** (`apps/api/src/events/cross-module-subscriber.ts`) on
  `inventory.stock.movement_recorded`:
  - only `direction === 'out'` with a policy (`reorderLevel > 0`);
  - fires **only on the threshold crossing** — `before > reorderLevel && balanceAfter ≤ reorderLevel`
    (where `before = balanceAfter + quantity`) — so exactly one PR per dip, not one
    per subsequent issue while already low;
  - `suggestedQty = reorderQty || (reorderLevel − balanceAfter)`;
  - drafts `PurchaseRequestService.create` with `reference = PR-RO-<code>`, a
    descriptive title, and `value = suggestedQty × avgCost` (WAC estimate), status `draft`.
- Injected `PurchaseRequestService` (already exported by `ProcurementModule`).

## Verification

- `pnpm typecheck` **42/42**; inventory tests **20/20** (unchanged — reactor is api-layer).
- **Live-DB E2E** (Supabase, API on :4141): item on-hand 100 @ WAC 5 → `PATCH /reorder`
  (level 20, qty 80) → issue 85 (on-hand 15, crosses 20) → reactor logged
  `⚡ stock low → auto-drafted replenishment PR "PR-RO-…" for 80 m (value 400)`; PR
  present in procurement with **value 400** (80 × 5). Second issue of 5 (on-hand 10,
  already below) drafted **no** new PR → PR count stays **1**.

## Gotcha recorded (the stale workspace-dist trap, again)

The first E2E silently no-op'd: the API runs `@aura/inventory`'s **dist**, and
`pnpm --filter @aura/api build` does **not** rebuild workspace deps — so the enriched
payload wasn't present at runtime (`reorderLevel` arrived as `0` → reactor returned
early). Fix: `pnpm --filter @aura/inventory... build` before restarting the API.
Same lesson as the fleet/subcontracts sessions — **rebuild the edited dep's dist**, not
just the consumer.

Note: reorder policy is set via `PATCH /inventory/stock/:id/reorder` (matching the UI),
not at item creation — the create endpoint ignores reorder fields by design.

## Next candidates

- COGS→GL posting on issue (still open from `0073`; `movement_recorded` carries `unitCost`/`valueAfter`).
- De-dupe guard: skip if an open `PR-RO-<code>` already exists (currently one-per-crossing only).
