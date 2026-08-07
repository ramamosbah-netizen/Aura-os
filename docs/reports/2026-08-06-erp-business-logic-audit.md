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
| F-5 | Finance · AR invoicing not wired to the GL (`cross-module-subscriber.ts`) | `StatementsService` folds every statement from the journal ledger alone, but AR invoices posted **no** journal — only inventory, AP payment and FX reval touched the GL | **Revenue never reached the P&L and the receivable never reached the balance sheet.** Budget-vs-actual (which folds the GL) and consolidation were blind to sales | High | `db092ec` |
| F-6 | Finance · AP invoice approval not wired to the GL (`cross-module-subscriber.ts`) | AP payment posted Dr AP / Cr Bank, but nothing credited AP at approval — the payable was never booked | Supplier expense never reached the P&L, and every AP payment posted against a payable that did not exist (a dangling Dr AP). The AP cycle did not articulate | High | `8654a7b` |
| P-1 | Procurement · `purchase-order.service.ts` `changeStatus`/`transition` | No state machine — any status from any state (the status DTO is only `@IsString`) | **Un-cancelling** a PO left it live while its committed cost stayed reversed off the CBS (project commitments understated); reviving a closed PO, backward moves, and invalid statuses all accepted; approve/submit could move an issued/closed PO back to approved | High | `f9b9de3` |
| P-2 | Procurement · `purchase-request.service.ts` `changeStatus` | Same class, and approving a PR auto-creates a draft PO | Re-sending `approved` to an already-approved PR spawned a **second PO** (and, once coded, a second committed cost) — a rejected PR could also be flipped straight to approved | High | `0435fe2` |
| P-3 | Finance · `invoice.service.ts` `checkThreeWayMatch` | The 3-way match was per-invoice, not cumulative — it ignored invoices already approved on the same PO | Two 100k invoices against a 100k PO with 100k received both passed (each ≤ 100k), **double-paying the supplier** for one delivery. The read view summed cumulatively; the enforcement did not | High | `ee2edb5` |
| P-4 | Finance · `invoice.service.ts` create handler | AP invoice auto-generated a unique reference, but a caller-supplied reference (the supplier's invoice number) had no uniqueness check | Re-entering the same supplier invoice raised a second payable for one bill — the supplier could be **paid twice**. The AR side already guarded its number; AP did not | High | `8159ab5` |
| P-5 | Procurement · `rfq.service.ts` `addQuote`/`send`/`award` | RFQ had no lifecycle guard — quotes accepted regardless of status or due date | A bid could be submitted after the RFQ was **awarded** (or after everyone else's price was known / past the due date), and re-awarding a decided RFQ re-fired the tendering price-restamp reactor | Medium | `37dce73` |
| P-6 | Procurement · `makePurchaseRequest`/`makePurchaseOrder` | Coerced garbage to 0 but accepted a negative value; PO stored a negative/NaN ordered quantity verbatim | A negative PO value posts a negative committed cost to the CBS and falls under the auto-approve threshold (escapes the matrix); a negative/NaN ordered quantity corrupts the Quantity Ledger | Medium | `692e1b4` |
| P-7 | Inventory · `makeGoodsReceipt` | Same class — accepted a negative value and a negative/NaN received quantity | A negative received value corrupts the 3-way match's received ceiling; a negative/NaN received quantity corrupts the Quantity Ledger's received position | Medium | `6e08281` |

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
| `@aura/finance` | 296 / 296 (+7 VAT/payment, +7 credit-note, +14 allocation, +6 refund) |
| `@aura/api` unit (incl. error-taxonomy fitness) | 65 / 65 |
| e2e (full suite) | 189 / 189 (+3 credit-note, +4 allocation, +4 refund over AR/AP-GL) |
| `@aura/api` + `@aura/web` typecheck | clean |

### GL integration (F-5 / F-6) — what changed structurally

The single biggest accounting gap: the sub-ledgers did not post to the GL, so the GL-derived
statements were structurally incomplete. Now, following the existing inventory-GL reactor pattern,
the cross-module subscriber posts base-currency double entries:

| Event | GL entry |
|---|---|
| AR invoice **issued** | Dr Accounts Receivable (1200) / Cr Revenue (4010) / Cr VAT Output (2100) |
| AR **receipt** | Dr Bank (1010) / Cr Accounts Receivable (1200) |
| AR invoice **cancelled** (if issued) | reverse the issue posting |
| AP invoice **approved** | Dr Supplier & Subcontract Costs (5020) / Cr Accounts Payable (2010) |
| AP **payment** (pre-existing) | Dr Accounts Payable (2010) / Cr Bank (1010) |

Revenue now reaches the P&L, receivables/payables reach the balance sheet, the AP cycle articulates
(approval books the payable the payment clears), and budget-vs-actual + consolidation see real
figures. **Still open on the GL side (follow-ups):** AR/AP VAT settlement postings on VAT-return
filing, and AP cancellation reversal (approved→cancelled).

---

## Module completion matrix

| Module | Business logic | Missing functions | Missing pages | Missing reports | Priority | Complete? |
|---|---|---|---|---|---|---|
| **Finance** | ✅ audited, 4 defects fixed (+GL integration F-5/F-6) | ✅ credit notes · ✅ multi-invoice receipt allocation · ✅ customer refunds | ✅ credit-note, receipt-allocation & refund screens | — (AR/AP aging, TB, P&L, BS, cash flow, VAT return all present) | Medium | **logic ✅ · completeness ✅ (module closed)** |
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

## Completeness build — Finance credit notes (2026-08-06)

The first of the three Finance completeness gaps, built as a full vertical (domain → service →
store + migration → API → BFF → UI → tests) and verified in the running app.

A credit note is the mirror of a sales invoice — it reduces a customer's receivable after the
invoice is issued (over-billing, a return, a price adjustment, or crediting an invoice already
part-paid). Issuing one posts **Dr Revenue (4010) / Dr VAT Output (2100) / Cr Accounts Receivable
(1200)** and applies the credit to the target invoice, so the GL and the AR sub-ledger (balance +
aging) stay consistent. Guards: cumulative net credit ≤ invoice net (409), no double-issue,
per-tenant unique number. `credited_total` on the customer invoice makes `balance = total − paid −
credited`. Screen at `/finance/credit-notes`; commits `0dfce90` (backend) + `088cd28` (UI).

Verified live: drafting CN-DEMO-1 (30,000 net) against a 200,000 invoice and issuing it dropped the
P&L revenue 200,000 → 170,000 and set the invoice's `creditedTotal` to 31,500, all through the real
UI's BFF path.

## Completeness build — Finance receipt allocation & customer refunds (2026-08-06)

The remaining two Finance gaps, each a full vertical, verified in the running app.

- **Multi-invoice receipt allocation** (`dd1b2d9`) — one customer receipt clears several open
  invoices at once (was: one payment settles one invoice). `allocateOldestFirst` /
  `validateAllocations` split the amount oldest-first or by an explicit set; each slice records a
  receipt (posting Dr Bank / Cr AR), over-payment returns as `unapplied`. Screen at
  `/finance/receipt-allocation`. Verified live: a 150,000 receipt cleared AR-AL-1 (105,000) and
  part-paid AR-AL-2 (45,000).
- **Customer refunds** (`c9fed21`) — return cash to a customer; paying a refund posts **Dr Accounts
  Receivable / Cr Bank** (the mirror of a receipt), migration 0224, screen at
  `/finance/customer-refunds`. Verified live: RF-DEMO-1 (15,000) paid posted Dr AR 15,000 / Cr Bank
  15,000.

**Finance is now closed** on both halves: business logic (4 defects + GL integration F-5/F-6) and
completeness (all three AR capabilities built, each with UI and tests).

## Next

Finance is closed (logic + completeness). Contracts is closed on the business-logic half with 4 of 6
completeness gaps built; the two remaining are the closeout statement and the retention/bond exposure
report. After that, the next module on the priority list is **Procurement**.
