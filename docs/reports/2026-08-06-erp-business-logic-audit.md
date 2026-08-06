# ERP Business-Logic & Completeness Audit — running report

**Started:** 2026-08-06 · **Status:** 🟢 CURRENT · **Branch:** `claude/fx-revaluation-regression-test-ad2574`

A per-module audit in two halves, run module by module:

1. **Business logic** — read the real control path of every service and domain rule, and try to
   *disprove* each suspected gap before writing it down. Every claimed defect below has a failing
   scenario and a regression test that now covers it.
2. **Completeness** — what a working ELV/MEP contractor needs that is simply not built: missing
   functions, workflows, pages, reports, integrations. Recorded in the completion matrix, not
   silently implemented.

Numbers here are from runs on this branch on 2026-08-06 (project report-integrity rule: no
unmeasured scores).

---

## Defects found and fixed

| # | Module · site | Root cause | Failure it caused | Severity | Commit |
|---|---|---|---|---|---|
| F-1 | Finance · `domain/ap-aging.ts` `buildApAging` | Aged the full invoice value; a partly-paid AP invoice stays `approved` and was never netted | Payables report and cash forecast overstated by every progress payment made — and it invites paying twice | High | `2d7d4d1` |
| F-2 | Finance · `invoice.service.ts` `fxRevaluation` | Hardcoded `amountPaid: 0` on the comment "AP has no partial payments", which is false | Unrealized FX gain/loss and its GL journal overstated on every partly-paid foreign-currency payable | Medium | `2d7d4d1` |
| C-1 | Contracts · `payment-certificate.service.ts` `changeStatus` | Applied any target status from any current status — no transition guard | Re-certifying an already-certified/paid IPC re-fires `contracts.ipc.certified`, the AR billing trigger, so Finance raises a **second client invoice for the same work**. Also let a rejected certificate be revived, corrupting the `previousCertifiedNet` baseline | High | `58b3731` |
| C-2 | Contracts · `contract.service.ts` `changeStatus` | Same class, no state machine | `status='active'` emits `contract.signed`, which auto-creates the delivery Project. Re-sending it created a **duplicate project** (and duplicate cost structure); re-sending `completed` re-fired the completion reactors | High | `dccbda8` |
| C-3 | Contracts · `contract.service.ts` `update` | `value` was an ungoverned PATCH field | Signing enforces `approvalLimit` cover for the value, and the AR cap refuses to bill past it. Sign a 30k contract inside your limit, then PATCH it to 5m: **both controls bypassed**. A completed contract's value was mutable too | High | `2fda46e` |
| C-4 | Contracts · `domain/contract-obligation.ts` `setObligationStatus` | Only *set* `completedDate` on met/waived; never cleared it | An obligation walked back from met → open kept its completion date: it sat in the reminder feed (which filters on status) while every register and export showed it completed on a date it was not | Medium | `2fda46e` |
| C-5 | Contracts · `bond.service.ts` `act` | `expire` mapped to no event type | A performance/advance bond lapsing — the register's most commercially significant change — moved with **no audit trail at all** | Low | `2fda46e` |

Both Finance defects share one root cause: the AR/AP data-model asymmetry (AR carries `amountPaid`;
AP derives paid from the payment ledger). C-1 and C-2 share another: event-emitting status setters
written without a state machine, where every re-send re-fires cross-module automation.

## Verified sound (audited, no defect)

- **IPC certification math** — telescoping is correct (`netThisCertificate` = cumulative net − prior
  certified net), retention cap applies as % of contract value, advance recovery nets correctly.
  Retention-on-work-only (excluding materials on site) is a documented contract choice, not a bug.
- **AR aging** (nets `amountPaid`, ages by due date), **VAT engine** (reverse charge both sides, tax-point
  filing, inclusive/exclusive), **revenue recognition** (cost-to-cost POC + IAS 37 onerous provision),
  **financial statements** (TB/P&L/BS balance via retained-earnings roll-in; cash flow nets per journal).
- **AR billing cap** — two cumulative bounds (contract value, net certified), correctly cumulative
  rather than per-invoice, VAT-exclusive on both sides.
- **Bond domain guards** — only an `active` bond can be released/called/expired; amount, kind and
  date validation present.
- **Tenant isolation on Contracts** — the by-id service reads have no tenant guard, but every
  contracts table carries an RLS `tenant_isolation_policy` and the runtime binds the tenant GUC, so
  this is a defence-in-depth gap, **not** a live cross-tenant leak. Recorded, not claimed as a defect.

## Test results (2026-08-06, this branch)

| Suite | Result |
|---|---|
| `@aura/contracts` | 44 / 44 (+6 this phase) |
| `@aura/finance` | 260 / 260 (+5 the Finance phase) |
| `@aura/api` unit (incl. error-taxonomy fitness) | 65 / 65 |
| e2e — `sod`, `chains`, `ar-contract-cap`, `quantity-ledger`, `cost-ledger` | 25 / 25 |
| `@aura/api` typecheck | clean |

---

## Module completion matrix

| Module | Business logic | Missing functions | Missing pages | Missing reports | Priority | Complete? |
|---|---|---|---|---|---|---|
| **Finance** | ✅ audited, 2 defects fixed | Credit notes (only invoice cancel exists); multi-invoice payment allocation (one payment settles one invoice); customer refunds | Credit-note screen; receipt-allocation UI | — (AR/AP aging, TB, P&L, BS, cash flow, VAT return all present) | Medium | logic ✅ · completeness ⚠️ (3) |
| **Contracts** | ✅ audited, 5 defects fixed | **Retention release** (retention accrues on every IPC; nothing releases it at PC / end of DLP); final account / closeout statement; bond auto-expiry (expiry is manual, only a watchlist exists) | **Clause library** — service + API + store exist with no UI and no web proxy route (bonds and obligations *are* surfaced in Contract 360) | Contract-level retention & bond exposure statement | High (retention release) | logic ✅ · completeness ⚠️ (4) |

### Cross-module integration gap (verified)

**Approved project variation → contract value is not wired.** Variations live in the Projects module
and roll up into a *derived* "revised contract value" read there. The AR cap adapter
(`apps/api/src/wiring/contract-cap.adapter.ts`) reads `contract.value` directly, so an approved
variation does **not** raise the billing ceiling — someone must patch the contract value by hand.
As of `2fda46e` that hand-patch at least requires approval authority for the new value, but the
automatic link is missing. This is the seam Finance's own cap doc points at ("billing above the
contract is a commercial claim… it needs a variation first").

---

## Next

Contracts is closed on the business-logic half. Next module in the reprioritized order, then the
same two halves again.
