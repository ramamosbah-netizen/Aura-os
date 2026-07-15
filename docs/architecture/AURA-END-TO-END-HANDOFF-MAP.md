# AURA OS — End-to-End Handoff Map

**Date:** 2026-07-14 · Verified against live tree (`main` @ `6e099e1`).

Audits **transitions between modules**, not modules. A module can be mature while a handoff is broken.
Reactor evidence: `apps/api/src/events/cross-module-subscriber.ts` (20 subscriptions).

**Classes:** `AUTOMATED+VERIFIED` (reactor + test) · `AUTOMATED-PARTIAL` · `MANUAL` · `DUPLICATED` · `BROKEN` · `MISSING` · `NOT-REQUIRED`.

---

## Commercial front-half handoffs

| From → To | Class | Mechanism / evidence | Gap |
|---|---|---|---|
| Signal → Lead | **AUTOMATED+VERIFIED** | `SignalService.promote` (tx, idempotent, lineage `signalId`); reactors S9 | — |
| Lead → Opportunity | **AUTOMATED+VERIFIED** | `LeadConversionService` (one tx, dedupe, cannot-convert-twice) + tests | — |
| Opportunity → Requirements | **MISSING** | no Requirement entity | capture step absent |
| Requirements → Survey → Solution | **MISSING** | none of these entities exist | pre-award discovery absent |
| Opportunity/Solution → Scope/BOQ | **MANUAL** | BOQ authored on tender directly (`boq-store.ts`) | no scope→BOQ derivation; direct-sale has no BOQ |
| BOQ → Estimate (cost build-up) | **AUTOMATED+VERIFIED** | `estimate.service.buildRate` folds over BOQ items | — |
| Supplier sourcing → Estimate | **MISSING** | RFQ quotes never populate build-up rates | bid-time costs hand-keyed |
| Estimate → BOQ selling rate | **AUTOMATED+VERIFIED** | `buildRate({applyToBoq})` writes rate+amount | — |
| BOQ/Estimate → Quotation | **AUTOMATED-PARTIAL** | `recordQuotationGenerated` + convert bridge (lines snapshotted) | approval not enforced downstream |
| Opportunity → Quotation (direct) | **AUTOMATED-PARTIAL** | `convert-to-quotation` (`crm-opportunities.controller.ts:72`) | bypasses build-up engine |
| Quotation approve → send | **AUTOMATED-PARTIAL / bypassable** | `quotation.ts` transitions; **`send` allowed from `draft`** | governance hole |
| Quotation/Tender → Award | **AUTOMATED+VERIFIED** | opp stage=won event | — |

## Award → delivery handoffs

| From → To | Class | Mechanism / evidence | Gap |
|---|---|---|---|
| Opportunity(won) → Tender | **AUTOMATED+VERIFIED** | reactor, idempotency `tender-from-opportunity:<id>`; skips when `requiresTender=false` | — |
| Tender(awarded) → Contract | **AUTOMATED+VERIFIED** | reactor, `contract-from-tender:<id>` | — |
| Contract(signed) → Project | **AUTOMATED+VERIFIED** | reactor `project-from-contract:<id>` + WBS root + CBS from tender BOQ | — |
| Contract → Budget baseline | **AUTOMATED-PARTIAL** | CBS synced from BOQ | no locked immutable budget baseline |
| Award → Commercial baseline into Contract | **MISSING** | contract value set on contract, not from a locked approved price | traceability gap |

## Procure-to-pay handoffs

| From → To | Class | Mechanism / evidence | Gap |
|---|---|---|---|
| Requirement → Purchase Request | **AUTOMATED-PARTIAL** | reorder-level reactor auto-drafts PR (`stock.movement_recorded`); project-need→PR manual | project material take-off→PR manual |
| PR → RFQ → Supplier Quotes | **AUTOMATED+VERIFIED** | `rfq.service` create/send/addQuote | — |
| Quote comparison → Award | **AUTOMATED+VERIFIED** | `lowestQuote` + `award` (winner/rest) | — |
| RFQ award → PO | **AUTOMATED-PARTIAL** | award marks winner; PO creation | verify auto-PO-from-award **(inferred manual)** |
| PO → GRN (receipt) | **AUTOMATED+VERIFIED** | grn.created→PO 'received' reactor | — |
| GRN → Inventory + GL | **AUTOMATED+VERIFIED** | perpetual GL reactor (Dr Inventory/Cr GRNI) | — |
| GRN → AP Invoice (3-way match) | **AUTOMATED-PARTIAL** | grn.created→ "suggest AP invoice"; match rule in `po-match.port.ts` | suggestion, not enforced auto-post |
| AP Invoice → Payment | **MANUAL** | finance payment | approval/SoD partial |

## Project-to-cash & change-to-cash

| From → To | Class | Mechanism / evidence | Gap |
|---|---|---|---|
| Progress → Measurement | **AUTOMATED-PARTIAL** | WBS spend rollup (invoice.paid→WBS) | no formal %-complete measurement |
| Measurement → IPC | **MANUAL** | `payment-certificate.service` certify | not driven by measured progress |
| IPC(certified) → AR Invoice | **AUTOMATED+VERIFIED** | reactor `ipc.certified`→AR (+VAT), dedup by invoice no. | — |
| AR Invoice → Receivable → Collection | **AUTOMATED-PARTIAL** | receivable + overdue-AR advisor | no dunning workflow |
| Collection → Cash visibility | **AUTOMATED-PARTIAL** | payments + bank reconciliation | consolidated cash view partial |
| Site/Client change → Variation | **AUTOMATED-PARTIAL** | engineering design_change.approved→draft variation | client-originated change capture partial |
| Variation approved → Contract value | **AUTOMATED-PARTIAL** | variation→project/contract value | client submission/negotiation not workflow-enforced |
| Variation → Billing | **MANUAL** | variation→IPC/AR | not auto |

## Engineering-to-execution & inventory-to-asset

| From → To | Class | Mechanism / evidence | Gap |
|---|---|---|---|
| Requirements → Design | **MISSING** | no requirement entity feeding design | — |
| Design → Submittal → Review → Approve | **AUTOMATED-PARTIAL** | engineering submittal lifecycle | approved-for-construction gate to site not enforced |
| Eng doc(submitted, HSE-owned) → HSE queue | **AUTOMATED+VERIFIED** | reactor routes risk assessment to HSE | — |
| Approved design → Site execution | **MANUAL** | site instructions | no enforced AFC gate |
| Site → As-built → Handover | **AUTOMATED-PARTIAL** | closeout | as-built entity partial |
| Inventory issue → Installed Asset | **MISSING** | no reactor issue→asset | installed base not built from delivery |
| Asset → Warranty → AMC/Service | **AUTOMATED-PARTIAL** | AMC exists; warranty fields partial | link from delivery weak |

## Record-to-report & after-sales

| From → To | Class | Mechanism / evidence | Gap |
|---|---|---|---|
| Inventory movement → GL | **AUTOMATED+VERIFIED** | perpetual inventory reactor | — |
| IPC/AR, AMC → GL/AR | **AUTOMATED+VERIFIED** | reactors | — |
| Asset disposal → GL | **AUTOMATED+VERIFIED** | `asset.disposed`→balanced journal reactor | — |
| Subcontract claim certified → AP | **AUTOMATED+VERIFIED** | reactor (+retention release, +backcharge debit note) | — |
| Payroll → GL | **AUTOMATED-PARTIAL** | HR present; payroll→journal **(inferred partial)** | verify |
| Project complete → Contract complete | **AUTOMATED+VERIFIED** | reactor closes deal chain | — |
| Project/Contract complete → Growth Signal | **AUTOMATED+VERIFIED** | S9 reactors → S3 Radar | — |
| Comms (email/WhatsApp/calls) → Timeline | **MISSING** | integrations not wired | — |

---

## Handoff scorecard

| Class | Count (approx) | Notes |
|---|---|---|
| AUTOMATED+VERIFIED | ~16 | deal chain, P2P core, GL reactors, growth loop |
| AUTOMATED-PARTIAL | ~14 | approvals/baseline/measurement/collection edges |
| MANUAL | ~5 | measurement→IPC, variation→billing, AP→payment |
| MISSING | ~8 | requirements/survey/solution, sourcing→estimate, issue→asset, comms |
| BROKEN | 0 | none found (defects were missing-migration, now fixed) |
| DUPLICATED | 0 | snapshots are legitimate |

**Reading:** the **spine is automated and verified**; the incomplete edges cluster in (a) the **pre-award commercial
intake**, (b) **governance/baseline immutability**, and (c) **measurement/collection/asset-linkage** — exactly the
regions the roadmap sequences next.
