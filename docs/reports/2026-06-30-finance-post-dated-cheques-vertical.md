# Module-depth vertical — Finance Post-Dated Cheques (PDC) register

**Date:** 2026-06-30
**Branch:** `claude/condescending-hopper-bb5e87`
**Module:** `@aura/finance`
**Migration:** `0072_finance_post_dated_cheques.sql` (applied live)

## What & why

Post-dated cheques are how UAE trade actually settles — customers pay with a strip of
forward-dated cheques and suppliers are paid the same way — yet finance had no register
for them (it had bank-guarantees, petty-cash, invoices, payments, but not PDCs). This
adds the register: track every cheque by **direction** (`received` = customer receivable
we hold; `issued` = our cheque to a supplier, a payable) and **maturity date**, move it
through its life, and watch the ones coming due.

## Domain (`modules/finance/src/domain/post-dated-cheque.ts`)

- `makePostDatedCheque` — validates direction, amount > 0, `YYYY-MM-DD` dates, maturity ≥ issue.
- Lifecycle (pure transition fns, each guards its source status):
  `pending → deposited → cleared | bounced`; `bounced → deposited` (re-present,
  `bounceCount++`) or `bounced → cancelled` (write off); `pending → cancelled` (stop payment).
  `applyChequeAction(c, action)` dispatches `deposit|clear|bounce|represent|cancel`.
- `daysToMaturity` / `isMaturingSoon` — the watch-list predicate (pending cheques due
  within N days, **including overdue** so nothing is missed).
- `summariseCheques` — open receivable vs payable exposure + maturing/bounced counts.
- Events: `finance.post_dated_cheque.created | status_changed`.

## Vertical (clones the bank-guarantee vertical shape)

- domain `post-dated-cheque.ts` + **15 unit tests**
- store: port + in-memory + postgres (`date::text` reads; `ON CONFLICT DO UPDATE`)
- migration `0072` — `aura_finance_post_dated_cheques`, RLS-locked (`tenant_isolation_policy`)
- service `PostDatedChequeService` — create / changeStatus / `maturingSoon` / `summary`;
  emits on the spine. Registered + exported in `FinanceModule`.
- API on `FinanceController`: `POST/GET /api/v1/finance/post-dated-cheques`,
  `/post-dated-cheques/maturing`, `/post-dated-cheques/summary`,
  `/post-dated-cheques/:id` (literal routes before `:id`), `/:id/status`
- web: BFF routes + `/finance/post-dated-cheques` page + client (summary cards,
  status-aware action buttons, maturity flagging) + nav entry

## Verification

- `pnpm build` 22/22, `pnpm typecheck` 42/42, `pnpm test` 41/41 packages
  (finance 75/75, **15 new**).
- Migration `0072` applied to live Supabase via `pnpm db:migrate` (1 applied, 72 current).
- **LIVE E2E** (single clean API instance, Postgres store):
  - received PDC 100200 (50,000) + issued PDC 500900 (30,000) created `pending`
  - lifecycle on 100200: deposit → bounce → represent (`bounceCount` 1) → clear
  - guard: clearing a cleared cheque → **HTTP 400** (finance controller wraps domain
    errors as `BadRequestException`)
  - summary: receivable 0 (the received cheque cleared/closed), payable 30,000 (open issued)
  - watch-list (60d) surfaces the issued cheque maturing 2026-08-01

## Next candidates

- Reactor: `finance.post_dated_cheque.status_changed`(cleared) on a `received` cheque →
  settle the linked AR invoice; on an `issued` cheque → mark the linked AP invoice paid.
- Net agreed-but-unrecovered subcontract back-charges into the claim payable (still open).
