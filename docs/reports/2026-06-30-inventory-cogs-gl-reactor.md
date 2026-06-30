# Cross-module reactor — Perpetual-inventory GL posting (COGS)

**Date:** 2026-06-30
**Modules:** `@aura/inventory` (event) → `@aura/finance` (reaction)
**Migration:** none (reactor + a one-line `AccountService.getByCode` accessor)

## What & why

Completes the inventory-valuation accounting loop opened by `0073`. Stock carried a
moving-average cost but issues posted no cost of sales and the balance sheet had no
inventory asset movement. Now every **costed** stock movement posts a balanced GL
journal, making inventory a real perpetual subledger — the inventory counterpart of
the existing `ipc.certified → AR`, `backcharge.recovered → AP`, and
`low-stock → PR` reactors.

## Design

Reactor on `inventory.stock.movement_recorded` (a second handler alongside the
replenishment one) in `apps/api/src/events/cross-module-subscriber.ts`:

- amount = `quantity × unitCost` (receipt price for `in`; the WAC/COGS rate for `out`); skips zero-cost moves.
- **receipt** → Dr **Inventory (1300, asset)** / Cr **GRNI (2150, liability — goods received not invoiced)**
- **issue** → Dr **COGS (5010, expense)** / Cr **Inventory (1300)**
- accounts resolved by well-known code, created on first use (mirrors `payment.service`)
  via a new public `AccountService.getByCode` + a private `ensureAccount` helper.
- posts through `JournalService.post`, so the DB double-entry trigger (`0050`) enforces balance.

Note the import alias: the subscriber already injects CRM's `AccountService` as
`accounts`; finance's is imported as `FinanceAccountService` (`financeAccounts`) to
avoid the name clash.

## Verification

- `pnpm typecheck` **42/42**; `pnpm test` **41/41** tasks. Finance now **75/75** —
  the previously-skipped `postgres-journal-store` double-entry **integration** tests
  now run live and pass (see env note).
- **Live-DB E2E** (Supabase, API on :4142): item → receipt 100 @ 5 → issue 30 (WAC 5):
  - `INV-…` receipt journal: **1300 Dr 500 / 2150 Cr 500**
  - `INV-…` issue journal: **5010 Dr 150 / 1300 Cr 150**
  - net Inventory 1300 = **350** (= 70 on-hand × WAC 5) — perpetual subledger ties out.

## Env note (build hygiene)

Configuring `apps/api/.env.local` activated `postgres-journal-store.test.ts` (it
self-loads that file). Its naive parser doesn't strip quotes, so a **quoted**
`DATABASE_URL` was mis-parsed (host → `base`). Fix: store `DATABASE_URL`/`DIRECT_URL`
**unquoted** in `.env.local` — dotenv (migrate runner + Nest) reads unquoted fine, and
the integration test now connects and passes.

## Next candidates

- GRNI clearing on AP invoice (Dr GRNI / Cr AP) to close the receipt→invoice loop.
- COGS by cost-centre/project (carry projectId on the issue movement).
- De-dupe guard on the low-stock PR reactor (open `PR-RO-<code>` already exists).
