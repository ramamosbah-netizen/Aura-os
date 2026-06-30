# AURA OS — Module Depth Gap Analysis

> **Date:** 2026-06-29
> **Branch:** `claude/clever-haibt-aea67f`
> **Method:** On-disk inventory of all 17 modules (domain entities, services, stores) + web page coverage + targeted grep verification of key construction-ERP features. No assumptions — every "gap" below was confirmed absent in the domain layer.
> **Scope:** This audits *vertical depth* (does each module cover the real-world process end to end?), not architecture conformance (covered in `2026-06-29-session-report-gaps-actions.md`).

---

## 1. Current depth per module (what exists on disk today)

| Module | Domain entities present | Dedicated UI | Depth |
|---|---|---|---|
| **crm** | account, lead, opportunity | accounts, leads | 🟡 mid |
| **tendering** | tender, boq | tenders (+[id]) | 🟡 mid |
| **contracts** | contract | contracts | 🔴 thin |
| **projects** | project, wbs, cbs, variation, delay-eot | projects, variations | 🟢 deep |
| **procurement** | purchase-request, rfq, purchase-order, supplier | PRs, RFQs, POs, suppliers | 🟢 deep |
| **inventory** | goods-receipt, stock, transfer | grns, stock, transfers | 🟢 deep |
| **finance** | account/GL, journal, invoice(AP), customer-invoice(AR), payment, tax/VAT, vat-return, petty-cash, bank-guarantee, bank-reconciliation, AR/AP aging | ledger, invoices, customer-invoices, tax, vat-returns, petty-cash, bank-guarantees, ar/ap-aging | 🟢 very deep |
| **hr** | employee, leave, payroll-run, eosb, expense-claim, staff-advance, timesheet | control(emp/leave/payroll), eosb, expense-claims, staff-advances, timesheets | 🟢 deep |
| **fleet** | vehicle, fuel-log, maintenance, traffic-fine | control(veh/fuel/maint), fines | 🟢 deep |
| **assets** | asset, depreciation | control, depreciation | 🟡 mid |
| **hse** | hse-incident, capa-action, permit-to-work | control | 🟡 mid |
| **quality** | inspection-request, ncr, snag | control | 🟡 mid |
| **engineering** | drawing, rfi, submittal | engineering | 🟡 mid |
| **doccontrol** | correspondence, transmittal | documents/control | 🟡 mid |
| **site** | daily-report, delay-log, material-consumption | control | 🟡 mid |
| **subcontracts** | subcontract, claim (IPC + retention) | subcontracts | 🟡 mid |
| **amc** | service-contract, support-ticket, work-order | amc | 🟡 mid |

Aggregate: ~30 first-class business entities live, 51 web pages, 64 migrations. Finance/Procurement/Inventory/HR/Projects/Fleet are genuinely deep. The thinner half is the **construction-delivery & compliance** side (contracts, quality, hse, engineering, site, doccontrol, subcontracts, amc).

---

## 2. The highest-value gaps (ranked by business impact for a UAE contracting ERP)

### 🔴 P0 — Core contracting money-flow is incomplete

1. **Main-contract progress billing / Interim Payment Certificates (IPC).** *Confirmed absent.* Subcontracts have claims-with-retention (the subcontractor-side IPC), but there is **no client-facing progress application → certification → retention → IPC** against a main contract. `finance/customer-invoice` is generic AR — it does not bill against contract progress, hold retention, or certify work done. This is the single biggest hole: it's the heart of contracting revenue.
2. **Retention accounting (main contract).** Retention exists only on subcontract claims + bank guarantees. There's no retention ledger on the receivable side (retention held, retention release on DLP completion).
3. **Contracts module is thin (single `contract` entity).** Missing: payment terms / milestone schedule, variations linkage (variations live in `projects`, not tied to the contract value), LD clauses, insurances & guarantees register, DLP / defects-liability tracking, contract documents.

### 🟠 P1 — UAE compliance & revenue recognition

4. **WPS (Wage Protection System).** *Confirmed absent (0 hits).* Payroll-run exists but produces no WPS SIF bank file — mandatory for UAE payroll.
5. **Employee document-expiry tracking (visa / labour card / Emirates ID / passport).** HR `employee` carries visa fields but there is **no expiry dashboard or renewal workflow** — a core MoHRE-compliance need.
6. **IFRS-15 / revenue recognition (WIP, POC).** *Confirmed absent (0 hits).* No percentage-of-completion revenue, no WIP / over-under billing. Projects has EVM (PV/EV/AC) but it doesn't post recognized revenue to the GL.
7. **Quality ITP / Material Approval (MAR) / Method Statements.** *Confirmed absent.* Quality has inspection-request/ncr/snag but no Inspection & Test Plan, no MAR, no WIR workflow — the actual QA/QC document spine on site.

### 🟡 P2 — Module-completeness gaps (each module's missing limbs)

| Module | Notable missing depth |
|---|---|
| **finance** | Financial statements (P&L / BS / cash-flow), budgeting & budget-vs-actual, cost-center P&L, cash-flow forecast, credit/debit notes, multi-currency, **bank-reconciliation has a service + BFF routes but no UI page** (quick win). |
| **fleet** | Salik (toll), Mulkiya/insurance renewal tracking, driver-licence expiry, GPS/telematics, trip/dispatch log. (0 Salik hits.) |
| **hse** | Toolbox talks, safety inspections/audits, observation/near-miss cards, PPE issuance, man-hours & TRIR KPIs, training records. |
| **assets** | Asset transfer/movement, disposal, maintenance schedule, barcode/tag & physical verification, AMC linkage. |
| **engineering** | Technical query (TQ), document revision control register, as-built/shop-drawing workflow, BIM. |
| **site** | Labour headcount/allocation, plant & equipment log, weather log, progress photos, manpower histogram. |
| **subcontracts** | Subcontract variations, back-charges, performance evaluation, work-order issuance. |
| **amc** | Preventive-maintenance scheduling, SLA timers, spare-parts, contract renewal. |
| **crm** | Contacts (vs accounts), activities/tasks, quotations/proposals, campaigns. |
| **tendering** | Prequalification, tender register/calendar, cost-estimation build-up, win/loss analysis. |
| **inventory** | Stock valuation (FIFO/WAC), reorder/min levels, physical stock count, batch/serial, bin locations. |
| **procurement** | Supplier evaluation/scorecard, blanket/call-off POs, goods-return (GRN reversal). |
| **projects** | Schedule/Gantt + baseline, resource allocation, progress-measurement feeding IPC (ties to P0 #1). |

### ⚪ P3 — Edge apps (breadth, not depth)
- **0 of 4 edge apps**: Customer Portal, Supplier Portal, Mobile Workforce PWA, BI dashboards. (Unchanged from prior report.)

---

## 3. Quick wins (small effort, real value)

1. **Finance bank-reconciliation UI** — backend service + `/api/finance/bank-transactions/[id]/reconcile|unreconcile` BFF routes already exist; only the page is missing. Highest value-per-hour item on the board.
2. **HR document-expiry view** — the visa/labour-card/EID fields are already on `employee`; needs an expiry list + filter, no new entity.
3. **Renumber the duplicate `0059` migration** (`0059_finance_petty_cash.sql` vs `0059_projects_variations.sql`) — both applied live, but the sequence is no longer strictly monotonic. (Already flagged in the prior report.)

---

## 4. Recommended sequence

1. **IPC / progress-billing vertical** (P0 #1–3) — the only gap that breaks the core contracting money-flow; everything else is additive. New `billing`/`certification` capability tying contract → project progress → retention → AR invoice + GL.
2. **WPS file + HR document-expiry** (P1 #4–5) — small, high-compliance-value, no new architecture.
3. **Fill the thin modules' missing limbs** (P2) one vertical at a time using the proven template.
4. **Bank-rec UI + 0059 renumber** can be done anytime as quick wins.

---

## 4b. Update — P0 #1 IPC / progress-billing: BUILT & live-verified (2026-06-29)

The top gap is now closed. Added an **Interim Payment Certificate (IPC)** vertical to the **contracts** module (which also lifts it from 🔴 thin → deeper), following the proven template:
- **Domain** `payment-certificate.ts` — pure `computeCertificate()` (retention on work done, capped at % of contract value; advance recovery; net-of-previous so each IPC pays only the increment) + `makePaymentCertificate`, `certificateSummary`, `priorCertifiedNet`. **8 unit tests.**
- **Store** (port / in-memory / postgres, atomic `createWithClient`/`updateWithClient`; date columns via `::text` to dodge the drift bug) + **migration `0064`** (`aura_contracts_payment_certificates`, RLS-locked, applied live → DB 64 migrations).
- **Service** — atomic `TX_RUNNER` writes; references contract + CRM account by snapshot; emits `contracts.ipc.*`, with `contracts.ipc.certified` as the **AR trigger** for finance (the documented seam to raise the client invoice; not auto-built this pass).
- **API** `PaymentCertificatesController` (`/api/v1/contracts/certificates` + `/summary/:contractId`) + **web** BFF routes + `/contracts/certificates` page + client + nav.
- **Verified:** typecheck **42/42**, tests **41/41** (8 new). Live E2E on :4100 against Supabase: contract 10M → IPC#1 net **900,000** → certify → IPC#2 `previousCertifiedNet` **900,000**, net this **1,350,000**; summary 10% complete; retention **cap** holds (500k not 600k); negative work → **400**.

Residual (deliberately deferred, not blocking): finance AR auto-invoice off `ipc.certified`; main-contract **retention release** on DLP; tie variations into the certified contract value. P0 #2 (retention ledger) and #3 (contracts milestones/DLP) remain.

## 5. One-paragraph summary

The **operate/finance/HR/procurement spine is deep and production-shaped**; the gaps are concentrated on the **construction-delivery and contract-billing side**. The single load-bearing hole is **main-contract progress billing (IPC) with retention** — confirmed absent — without which contracting revenue can't be modelled end to end. Behind it sit **UAE compliance gaps (WPS, document-expiry), revenue recognition (IFRS-15/WIP), and the QA/QC document spine (ITP/MAR/WIR)**, then a long tail of per-module "missing limbs." None are architectural — every one clones the existing module template. Estimated remaining module depth: **~30–35%**, front-loaded on the contracting/compliance verticals above.
