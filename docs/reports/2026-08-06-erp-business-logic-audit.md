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
| F-3 | Finance · `tax.service.ts` `setReturnStatus` / `generateReturn` | VAT return status setter applied any target from any state, and generateReturn had no duplicate-period guard | draft→paid marked a return paid that was never filed; re-filing a filed return overwrote its FTA submission timestamp; paid→filed reverted a settled liability; and a period could be filed twice, double-declaring the liability | Medium | `c5f12ac` |
| F-4 | Finance · `payment.service.ts` `doRecord` | Settlement journal posted with no `postedAt`, so `makeJournal` stamped it at entry time even though payments can be back-dated | A back-dated payment recorded its cash movement in the current open GL period while the payment sub-ledger carried the real date — AP sub-ledger and GL diverged by period and never reconciled; the period lock did not apply to the cash movement | Medium | `d2c744d` |

Both original Finance defects share one root cause: the AR/AP data-model asymmetry (AR carries
`amountPaid`; AP derives paid from the payment ledger). C-1 and C-2 share another: event-emitting
status setters written without a state machine, where every re-send re-fires cross-module
automation — the *same* class as F-3's VAT return setter. F-3 and F-4 are the deeper (wave-3)
Finance pass: the module was already hardened twice, so these are the residual lifecycle- and
period-cutoff defects a deeper read surfaced.

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
| `@aura/contracts` | 44 / 44 (+6 earlier phase) |
| `@aura/finance` | 269 / 269 (+7 across Finance phases: +5 VAT lifecycle, +2 payment date) |
| `@aura/api` unit (incl. error-taxonomy fitness) | 65 / 65 |
| e2e (full suite) | 174 / 174 |
| `@aura/api` + `@aura/web` typecheck | clean |

---

## Module completion matrix

| Module | Business logic | Missing functions | Missing pages | Missing reports | Priority | Complete? |
|---|---|---|---|---|---|---|
| **Finance** | ✅ audited, 2 defects fixed | Credit notes (only invoice cancel exists); multi-invoice payment allocation (one payment settles one invoice); customer refunds | Credit-note screen; receipt-allocation UI | — (AR/AP aging, TB, P&L, BS, cash flow, VAT return all present) | Medium | logic ✅ · completeness ⚠️ (3 open) |
| **Contracts** | ✅ audited, 5 defects fixed | ✅ retention release · ✅ lapsed-bond sweep — open: final account / closeout statement | ✅ clause library | Contract-level retention & bond exposure statement | — | logic ✅ · completeness ⚠️ (2 open) |

---

## Completeness build — Contracts (2026-08-06)

Four of the six Contracts gaps are built, each domain → service → store + migration → API → BFF →
UI → tests, and verified in the running app (screens exercised against a live API, not just tests).

| Gap | Built | Where |
|---|---|---|
| **Retention release** | Retention withheld on every IPC now has a return path: a derived position (held − released − pending = releasable, drafts reserving so two claims cannot spend the same money), conventional tranches (half at practical completion, balance at end of DLP), IPC-grade approval controls (preparer ≠ approver, value ceiling), a terminal state machine, and `contracts.retention.released` → auto-drafted client AR invoice. The AR cap's certified bound now allows released retention — retention was withheld *from* the certified net, so releasing it necessarily bills above it. | `13f50ee`, migration 0221, Retention tab on Contract 360 |
| **Approved variation → contract value** | The cap said "raise a variation before billing above the contract"; that advice was unfollowable. Migration 0222 splits `original_value` (award) from `value` (live), so the roll-up is a recompute — a redelivered approval cannot inflate the contract twice. Omissions net off. | `eb1dde8`, reactor on `projects.variation.approved` |
| **Clause library UI** | Service, store and full API existed with no UI and no web proxy at all. Now a real screen: search, category filter, expandable clause text, retire/restore, create — plus its nav entry. | `5d25b93`, `/contracts/clauses` |
| **Bond auto-expiry** | A lapsed performance bond still read `active`, so exposure reports counted security that no longer existed. `expireLapsed` is idempotent, exposed as `POST /contracts/bonds/expire-lapsed` for an operator or external scheduler, and offered on the bonds tab only when something has actually lapsed. There is no in-app scheduler, so this is deliberately an explicit operation rather than invented cron. | `5d25b93` |

**Verified in the running app** (API on in-memory stores, web dev server, seeded through the real
HTTP API): the clause library lists and expands real clauses; Contract 360's Retention tab showed
held 50,000 / releasable 25,000; approving RET-001 moved the position to released 25,000 and drafted
AR invoice `AR-RET-001-…` for 25,000 (26,250 with VAT) alongside the IPC's own `AR-IPC-001-…` for
450,000; the bond sweep marked the lapsed PB-2026-0042 expired and active bond exposure fell to 0.
That pass also surfaced a React styling error on every Contract 360 rerender (`border` shorthand vs
`borderColor` longhand), fixed in `d3bc7cd`.

**Still open (Contracts):** final account / closeout statement, and a contract-level retention &
bond exposure report. Neither is started.

---

## Next

Contracts is closed on the business-logic half and has 4 of 6 completeness gaps built. Remaining
work is the two Contracts reports above and the three Finance capabilities (credit notes,
multi-invoice payment allocation, customer refunds) — none of the Finance three is started.
