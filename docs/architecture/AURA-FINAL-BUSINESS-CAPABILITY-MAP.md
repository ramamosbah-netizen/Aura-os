# AURA OS — Final Business Capability Map

**Date:** 2026-07-14 · Verified against live tree (`main` @ `6e099e1`).
**Classification:** `COMPLETE` · `PARTIAL` · `MISSING` · `DUPLICATED` · `MISPLACED` · `DEFERRED BY DESIGN`.

> "COMPLETE" = real domain behaviour (rules + events + persistence), not just CRUD/UI. Evidence cited inline.

## How to read
Each row: capability → business stage → owning module → **class** → evidence/note. No priority inflation.

---

## A. Commercial front (Strategy → Approved Price)

| Capability | Stage | Owner | Class | Evidence / note |
|---|---|---|---|---|
| Strategy / business plan | Strategy | — | **MISSING** | no entity |
| Market intelligence feed | Market intel | intelligence + crm | **PARTIAL** | `intelligence/src/insight.service.ts`; signal sources MARKET/INTELLIGENCE |
| Signal / prospect discovery | Signal | crm | **COMPLETE** | `signal.ts`, Radar, growth reactors (S9) |
| Lead management + SLA/attention | Lead | crm | **COMPLETE** | `lead-attention.ts`, Lead Command (S1) |
| Lead → opportunity conversion (dedupe, lineage) | Lead→Opp | crm | **COMPLETE** | `lead-conversion.service.ts`, `identity-resolution.ts` (S2) |
| Opportunity management | Opportunity | crm | **COMPLETE** | `opportunity.service.ts` + BANT + pipeline |
| Opportunity depth (stakeholders/commitments/register) | Opportunity | crm | **COMPLETE** | `opportunity-depth.ts`, `deal-register.ts` (S4/S5) |
| Buying journey + pursue/no-pursue | Qualify | crm | **COMPLETE** | `buying-journey.ts` (S6) |
| Deal health + risk (explainable) | Qualify | crm/shared | **COMPLETE** | `opportunity-health.ts` (S7) |
| **Requirements capture** | Requirements | — | **MISSING** | no Requirement entity |
| **Site survey / discovery** | Survey | — | **MISSING** | no Survey entity |
| **Solution / design scope (pre-award)** | Solution | — | **MISSING** | Engineering begins post-award |
| Scope object | Scope | tendering (as BOQ) | **PARTIAL** | scope only exists as tender BOQ |
| BOQ authoring | BOQ | tendering | **COMPLETE** | `boq-store.ts` (authoritative, one/tender) |
| Cost estimation (rate build-up) | Estimation | tendering | **COMPLETE** | `estimate.service.ts`, `domain/estimate.ts` |
| Resource breakdown (material/labour/plant/subcontract) | Cost build-up | tendering | **COMPLETE** | `domain/estimate.ts` `compileResourceBreakdown` |
| Contingency modelling | Cost build-up | tendering | **MISSING** | no first-class contingency factor |
| Supplier/subcontractor **bid-time** sourcing | Sourcing | — | **MISSING** | RFQ is post-award only |
| RFQ + supplier quotes (post-award) | Sourcing | procurement | **COMPLETE** | `rfq.service.ts` (`addQuote`, `lowestQuote`, `award`) |
| Quote comparison feeding estimate | Bid compare | — | **MISSING** | not wired into build-up |
| Pricing (cost→sell + margin) | Pricing | tendering | **COMPLETE** | `sellingRate` = cost + indirect/overhead/profit |
| Pricing scenarios / what-if | Pricing | — | **MISSING** | single build-up per item |
| Cost build-up **versioning** | Pricing | tendering | **MISSING** | re-estimate replaces (`estimate.service.ts:47`) |
| Margin & risk review gate | Margin review | — | **MISSING** | margin computed, no threshold |
| Discount governance | Approval | — | **MISSING** | not governed |
| Commercial approval gate | Approval | crm | **PARTIAL** | `quotation.ts` approve exists but **bypassable** (`send` from `draft`) |
| Locked commercial baseline (immutable) | Approval | — | **MISSING** | no locked baseline carried into contract |
| Quotation lifecycle + revisions | Quotation | crm | **COMPLETE** | `quotation.ts` (0146) |
| Generate quotation from tender pricing | Quotation | tendering+crm | **COMPLETE** | `estimate.service.recordQuotationGenerated`, convert bridge |
| **Direct-sale** quotation (no tender) | Quotation | crm | **PARTIAL** | `convert-to-quotation` bypasses build-up engine |
| Tender submission | Submission | tendering | **COMPLETE** | tender status + `tender.submitted` event |
| Bid/no-bid decision | Submission | tendering | **PARTIAL** | `estimating.bid.decided` event; enforcement unclear |
| Clarification log | Clarification | — | **MISSING** | only quotation negotiation status |
| Value engineering / revision | Revision | crm | **COMPLETE** | quotation revisions |
| Negotiation | Negotiation | crm | **PARTIAL** | buying-journey + `under_negotiation` |
| Award / won | Award | crm | **COMPLETE** | stage=won → reactor |

## B. Contract & mobilisation

| Capability | Stage | Owner | Class | Evidence |
|---|---|---|---|---|
| Contract creation (auto from award) | Contract | contracts | **COMPLETE** | tender.awarded→contract reactor |
| Bonds / guarantees | Contract | contracts + finance | **COMPLETE** | `bond.service.ts`, finance `bank-guarantee` |
| Contract obligations | Contract | contracts | **COMPLETE** | `obligation.service.ts` |
| Contract clauses | Contract | contracts | **COMPLETE** | `clause.service.ts` |
| Budget baseline snapshot | Budget | projects/finance | **PARTIAL** | CBS from BOQ; explicit locked budget baseline partial |
| Project auto-creation + WBS/CBS seed | Mobilization | projects | **COMPLETE** | contract.signed→project + WBS + CBS from BOQ |
| Schedule / planning | Planning | projects | **COMPLETE** | `schedule.service.ts` |
| Cashflow forecast | Planning | projects | **COMPLETE** | `cashflow-forecast.service.ts` |

## C. Delivery & execution

| Capability | Stage | Owner | Class | Evidence |
|---|---|---|---|---|
| Procurement (PR→PO) | Procurement | procurement | **COMPLETE** | full P2P |
| Framework agreements | Procurement | procurement | **COMPLETE** | `framework-agreement.service.ts` |
| Goods receipt (GRN) | Inventory | inventory | **COMPLETE** | `goods-receipt.service.ts`; grn→PO received reactor |
| Stock valuation (WAC) + GL | Inventory | inventory+finance | **COMPLETE** | perpetual GL reactor |
| Stock transfer / reservation | Logistics | inventory | **PARTIAL** | transfer exists; reservation partial |
| Site instructions / execution | Site | site | **PARTIAL** | `site.service.ts` |
| Engineering submittals / drawings / RFI | Engineering | engineering | **COMPLETE** | submittal/drawing/rfi/technical-query |
| Design change → variation | Change control | engineering+projects | **COMPLETE** | design_change.approved reactor |
| Document control | DocControl | doccontrol | **COMPLETE** | `doccontrol.service.ts` |
| Quality (ITP, material approval) | Quality | quality | **COMPLETE** | `quality.service.ts` |
| HSE (risk assessment, toolbox) | HSE | hse | **COMPLETE** | `hse.service.ts` + eng routing |
| Progress measurement | Progress | projects | **PARTIAL** | WBS spend/rollup; formal %-complete→IPC partial |
| Variations / change control | Variations | projects | **COMPLETE** | `variation.service.ts` |

## D. Commercial back (measure → cash → after-sales)

| Capability | Stage | Owner | Class | Evidence |
|---|---|---|---|---|
| Payment certificates / IPC | IPC | contracts | **COMPLETE** | `payment-certificate.service.ts` → AR reactor |
| Customer invoicing (AR) | Invoicing | finance | **COMPLETE** | `customer-invoice.service.ts` |
| Supplier invoicing (AP) | Invoicing | finance | **COMPLETE** | `invoice.service.ts` |
| Receivables / collection | Collection | finance+crm | **PARTIAL** | AR + overdue-AR advisor; **no dunning workflow** |
| Payments (in/out) | Payment | finance | **COMPLETE** | `payment.service.ts`, PDC |
| GL / double-entry | Record-to-report | finance | **COMPLETE** | 0050 trigger + reactors |
| Period close | Record-to-report | finance | **COMPLETE** | `period-close.service.ts` |
| Revenue recognition | Record-to-report | finance | **COMPLETE** | RevenueRecognitionController |
| Tax engine | Record-to-report | finance | **COMPLETE** | `tax.service.ts` (0048) |
| Multi-currency / FX | Record-to-report | finance | **COMPLETE** | FxController + invoice currency migrations |
| Cost / profit centers | Record-to-report | finance | **COMPLETE** | `cost-center`, `profit-center` |
| Bank reconciliation | Cash | finance | **COMPLETE** | `bank-reconciliation.service.ts` |
| Reporting views / dashboards | Report | finance+web | **PARTIAL** | only 2 SQL views (0113); dashboards per-module |
| Testing & commissioning | T&C | projects | **PARTIAL** | closeout; no explicit T&C entity |
| Handover | Handover | projects | **PARTIAL** | `closeout.service.ts` |
| Defect liability / warranty | Warranty | assets/projects | **PARTIAL** | closeout + asset warranty fields |
| AMC / service | AMC | amc | **COMPLETE** | `amc.service.ts` → AR reactor |
| Renewal signal | Renewal | crm | **COMPLETE** | S9 contract.completed→RENEWAL_DUE |
| Cross-sell / expansion signal | Expansion | crm | **COMPLETE** | S9 project.completed→EXPANSION |

## E. Cross-cutting

| Capability | Owner | Class | Evidence |
|---|---|---|---|
| Activities / work management | crm | **COMPLETE** | activity + Work Center |
| Unified timeline | crm | **COMPLETE** | `api/crm/timeline` |
| Notifications | core/api | **COMPLETE** | NotificationsSubscriber/Controller |
| Approvals (workflow/saga) | core | **COMPLETE** | `core/src/workflow/*`, saga (0043) |
| AI recommendations / advisor | crm+intelligence | **COMPLETE** | CrmAdvisor + intelligence |
| AI guardrails / autonomy | intelligence | **COMPLETE** | `ai-guardrails.service.ts`, `autonomy.service.ts` |
| Email / WhatsApp / calls | — | **MISSING** | integrations not wired |
| Document management (DMS) | core | **COMPLETE** | `core/src/dms/*` |
| Form engine + overrides | core | **COMPLETE** | `core/src/forms/*` (0139) |
| Admin center (users/roles/settings) | api | **COMPLETE** | admin controllers |
| Tenant isolation (RLS) | core/db | **DEFERRED BY DESIGN → now a gap** | partial policies + 0049 dynamic |
| Transactional outbox | core | **COMPLETE** | `outbox-relay.ts` |
| Audit trail | core | **COMPLETE** | `audit.service.ts` + event store |

---

## Capability tally (verified)

- **COMPLETE:** ~55 capabilities (delivery, finance, P2P, CRM full stack, contracts, projects, engineering).
- **PARTIAL:** ~18 (progress-measurement→IPC, budget baseline, collection, site, reporting, direct-sale pricing,
  commercial approval, negotiation, change-to-cash client submission).
- **MISSING:** ~12 (requirements, site survey, solution design, contingency, bid-time sourcing→estimate, quote-compare→estimate,
  pricing scenarios, cost-build-up versioning, margin/discount governance, locked baseline, clarification log, comms).
- **DUPLICATED:** 0 material (BOQ→quotation/CBS are legitimate snapshots).
- **MISPLACED:** 0 material (RFQ-post-award is correctly placed; the gap is a *missing pre-award sourcing link*, not misplacement).
- **DEFERRED BY DESIGN:** RLS enforcement (now reclassified as an open P0).

The **shape of the gap is consistent**: the pre-award commercial engine's *inputs and governance*, plus tenant-isolation
enforcement — not the delivery/finance core.
