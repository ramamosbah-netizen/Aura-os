# Module-depth vertical — Subcontractor Back-Charges (contra-charges)

**Date:** 2026-06-30
**Branch:** `claude/condescending-hopper-bb5e87`
**Module:** `@aura/subcontracts`
**Migration:** `0071_subcontract_back_charges.sql` (renumbered from 0065 on merge with `main`, which took 0065 for crm_quotations)

## What & why

The subcontracts module owned the *forward* money-flow (subcontract → progress
**claims** with retention) but had no way to charge costs **back** to a
subcontractor. Back-charges (contra-charges) are a standard contracting concept:
the main contractor incurs a cost that should be borne by the subcontractor —
plant/materials supplied on their behalf, rectification of defective work,
attendance, clean-up — adds an administrative handling markup, and recovers the
agreed amount by **deducting from the subcontractor's certified claims**.

This is the back-to-back mirror of the just-shipped main-contract IPC → AR loop:
where the contract side bills the *client* for certified work, the subcontract
side recovers costs *from* the subcontractor. The
`subcontracts.backcharge.recovered` event is the seam a future reactor can use to
post the deduction to finance AP, exactly as `contracts.ipc.certified` drives AR.

## Domain (`modules/subcontracts/src/domain/back-charge.ts`)

- `makeBackCharge` — pure: validates gross > 0 / markup ≥ 0, computes
  `markupAmount = gross × markup%`, `recoverableAmount = gross + markup`, starts
  `raised` with full outstanding.
- `applyRecovery(bc, amount)` — pure: only an **agreed** back-charge can be
  recovered; a recovery may never exceed the outstanding balance; flips to
  `recovered` when outstanding hits 0. Accumulates across partial recoveries.
- `summariseBackCharges` — totals (gross / markup / recoverable / recovered /
  outstanding) + counts by status; **excludes recovered & written-off from
  outstanding**.
- Status: `raised → agreed | disputed`, `disputed → agreed | written_off`,
  `agreed → recovered (via recovery) | written_off`.
- Events: `subcontracts.backcharge.raised | statusChanged | recovered`.

## Vertical (clones the module template)

- domain `back-charge.ts` + **14 unit tests**
- store: extended `SubcontractStore` port + in-memory + postgres impls (snapshots
  the subcontractor name — no join)
- migration `0071` — `aura_subcontracts_back_charges`, RLS-locked with
  `tenant_isolation_policy` (clones the IPC migration convention)
- service: `createBackCharge` (auto-refs BC-001, BC-002, …), `changeBackChargeStatus`,
  `recoverBackCharge`; emits on the spine
- API: `POST/GET /api/v1/subcontracts/back-charges`, `/back-charges/summary`,
  `/back-charges/:id/status`, `/back-charges/:id/recover` (literal routes ordered
  before `:id`)
- web: BFF routes + `/subcontracts/back-charges` page + client form/table + nav entry

## Verification

- `pnpm build` 22/22, `pnpm typecheck` 42/42, `pnpm test` 41/41 packages
  (subcontracts 16/16, **14 new**).
- **HTTP E2E** through the running API (in-memory store, `DATABASE_URL` unset):
  - raise BC-001 (gross 10,000 + 10% → recoverable 11,000, outstanding 11,000)
  - guard: recover-before-agreed → rejected; over-recover (12,000 > 11,000) → rejected
  - agree → partial recover 4,000 (outstanding 7,000, still agreed) → recover 7,000
    (outstanding 0 → **recovered**)
  - BC-002 auto-sequenced; dispute → write-off
  - summary: count 2, gross 15,000, markup 1,000, recovered 11,000, outstanding 0,
    byStatus {recovered:1, written_off:1}
  - spine: 2 `raised`, 3 `statusChanged`, 2 `recovered` events emitted.

> Live Supabase migration not run this session — the DB password is chat-pasted,
> not stored in the worktree. Migration `0071` follows the exact IPC-migration shape that
> was applied live, and the full path is proven end-to-end against the in-memory
> store. Apply with `pnpm db:migrate` when credentials are available.

## Next candidates

- Wire a reactor: `subcontracts.backcharge.recovered` → finance AP deduction
  (mirror of `contracts.ipc.certified` → AR).
- Net agreed-but-unrecovered back-charges into the subcontractor claim's payable.
