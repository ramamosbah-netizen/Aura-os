# 09 — Finance / ERP Logic Audit

Finance is the second-deepest module (6 controllers, 15 Postgres stores, 15 services, **33 tests**, 21 pages) and contains **real computation with test coverage**, not display-only figures.

## Verified financial capabilities (`VERIFIED_IMPLEMENTED`)

Evidence: `modules/finance/src/domain/*.ts` (+ matching `*.test.ts`).

| Capability | File | Notes |
|---|---|---|
| Customer/AR invoicing | `customer-invoice.ts`, `invoice.ts` | draft→approved→paid lifecycle |
| Payments | `payment.ts` | AR/AP payment application |
| Journals / GL | `journal.ts`, `account.ts` | double-entry accounts |
| AR aging | `ar-aging.ts` | real bucketing (`current/1-30/31-60/61-90/90+`), `daysBetween` |
| AP aging | `ap-aging.ts` | payables aging |
| FX revaluation | `fx-revaluation.ts` + `core/.../exchange-rate.service.ts` | multi-currency revaluation |
| Tax / VAT | `tax.ts`, `TaxService` | tax codes/lines/returns |
| Budgets & commitments | `budget.ts` | budget lines, commitment tracking (PO reactor) |
| Cost/Profit centers | `cost-center.ts`, `profit-center.ts` | dimensional accounting |
| Revenue recognition | `revenue-recognition.ts` | recognition logic |
| Financial statements | `statements.ts` | P&L projection (`projections/profit-loss.projection.ts`) |
| Period close | `period-close.ts` | close controls |
| Petty cash / PDC / Bank guarantees | `petty-cash.ts`, `post-dated-cheque.ts`, `bank-guarantee.ts` | region-specific instruments (UAE) |
| Bank reconciliation | `bank-transaction.ts`, `BankReconciliationService` | statement matching |
| Consolidation / eliminations | `dist/domain/consolidation.test`, `eliminations.test` | multi-company rollup (tested) |
| Contract cap enforcement | `contract-cap.ts` | caps invoicing at contract value (cross-context via `PO_MATCH_PORT`/`contract-cap.port`) |

## Financial flow integrity (traced)

- **Commitment → actual:** `procurement.po.created` → budget commitment; `inventory.grn.created` → 3-way match → finance actual cost (`03` reactors 12–17). This is a real commitment/actual accounting chain.
- **Progress → revenue:** `contracts.ipc.certified` → finance recognition; `site.labour.logged`/`site.plant.logged` → actual cost. EVM roll-up in projects (`10`).
- **Cash:** `finance.invoice.paid` → receivable/cash update.

## Cost Engine / Transaction Ledger (`VERIFIED_IMPLEMENTED`, evolving)

`modules/projects/src/domain/cost-transaction.ts` + `cbs.ts` implement an append-only cost ledger between ERP sources and the Cost Breakdown Structure (SAP CO / Unifier sub-ledger pattern): CBS = SUM(ledger), reversals = negative entries. PO create→committed and PO cancel→−reversal are wired and idempotent.

## Gaps / risks

| Finding | Status | Evidence |
|---|---|---|
| No formal GL trial-balance / double-entry *enforcement* proof audited | `IMPLEMENTED_BUT_UNVERIFIED` | `journal.ts` present; balanced-posting invariant not verified here |
| Tax multi-jurisdiction breadth | `PARTIALLY_IMPLEMENTED` | VAT present; other jurisdictions unverified |
| Reporting numbers real-time vs cached | `PARTIALLY_IMPLEMENTED` | P&L via projection; freshness model not fully traced (`24-reporting` in `13`) |
| Rounding/precision policy | `NOT VERIFIED` | `toFixed(2)` used in places; no central money type observed |

## Findings

- Finance is a **genuine ERP finance engine**, not a CRUD façade — the presence of aging, FX revaluation, consolidation, revenue recognition, and a cost ledger *with tests* is strong evidence.
- Recommend: prove the double-entry balancing invariant in a test; introduce a money/decimal type to avoid float rounding drift; document report freshness.

**Finance/ERP maturity score: 80/100.**
