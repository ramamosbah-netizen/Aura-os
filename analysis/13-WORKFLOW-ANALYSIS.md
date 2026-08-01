# Workflow Analysis

Tracing the enterprise chain end-to-end:
**Lead → Opportunity → BOQ → Quotation → Approval → LPO/Contract → Procurement → Inventory → Project → Execution → Commissioning → Handover → Maintenance → Service → Invoice → Payment → Reporting.**

Legend: ✅ built & connected · 🟡 partial / thin UI · 🔴 missing or dead-end.

| # | Stage | Status | Evidence / gap |
|---|---|---|---|
| 1 | **Lead** | ✅ | CRM Lead OS (mig 0044), lead conversion service, resolveIdentity |
| 2 | **Opportunity** | ✅ | Opportunity 360, BANT, competitors, health, pursuit scoring (migs 0044/0080/0159-family) |
| 3 | **BOQ** | 🟡 | Tendering BOQ + Excel import (mig 0042) exists; scope→BOQ coupled to tenderId; **estimator UI thin (4 tender pages)** |
| 4 | **Quotation** | 🟡 | CRM quotations (mig 0065) + Quotations OS UI; **two pricing engines not unified** (memory) |
| 5 | **Approval** | ✅ | Approval matrices (mig 0085); quotation `send` requires `approved`; immutable commercial baseline locked on approval (mig 0165) |
| 6 | **LPO / Contract** | ✅ | Contract created from won opp/tender; baseline→contract value + commercialVariance. **Path asymmetry gap:** tender-won contract can bypass R3 baseline (memory: journey-audits) |
| 7 | **Procurement** | ✅ | PR→RFQ→PO (migs 0009/0015/0053); PO↔supplier FK (0084) |
| 8 | **Inventory** | ✅ | GRN→stock→transfers→valuation (migs 0010/0054/0055/0073); `chains.e2e-spec.ts` covers the flow |
| 9 | **Project** | ✅→🟡 | Project created + WBS/CBS/schedule/cashflow; **PM cockpit UI missing** (5 pages) |
| 10 | **Execution** | 🟡 | Site instructions, delay logs, variations exist; **daily site reports, labor/plant returns, progress tracking UI missing** |
| 11 | **Commissioning** | 🔴 | No dedicated commissioning module/workflow found. Quality ITPs (mig 0068) partially cover inspection but not T&C / systems commissioning (critical for ELV) |
| 12 | **Handover** | 🔴 | No handover workflow (O&M manuals, as-builts, warranty start, snag close-out, client acceptance). Project closeout (mig 0087) exists but is financial/administrative, not a client-handover package |
| 13 | **Maintenance (AMC)** | 🟡 | AMC contracts + PPM schedules + WO costing (migs 0038/0078/0083); **field execution loop missing** |
| 14 | **Service** | 🔴 | No field-service ticket→dispatch→technician→checklist→signoff loop. AMC WOs exist as records, not an operational field workflow |
| 15 | **Invoice** | ✅ | Customer invoices (mig 0060), progress/payment certificates (mig 0070), tax engine |
| 16 | **Payment** | ✅ | Payments, PDCs (mig 0072), bank reconciliation (mig 0046/0052), petty cash |
| 17 | **Reporting** | 🟡 | Per-module dashboards + P&L projections; **no unified Analytics/BI OS** (planned) |

## The three dead-ends (highest business impact)

1. **Commissioning (11)** — for ELV (CCTV/ACS/BMS/fire), commissioning & test-and-commission records ARE the deliverable that unlocks handover and payment. There is no module for it. **This is the biggest ELV-specific workflow hole.**
2. **Handover (12)** — no structured client-acceptance / O&M / warranty-activation package. Closeout is administrative, not the contractual handover event.
3. **Field Service loop (13–14)** — AMC and service revenue depend on dispatch→technician-mobile→checklist→customer-signoff→auto-invoice. Records exist; the operational loop and mobile surface don't.

## Bottlenecks & friction
- **Quotation dual-engine** — commercial ambiguity and rework risk (in-progress).
- **Path asymmetry** — direct-sale path enforces the commercial baseline; tender-won path can bypass it (memory). Same business intent, two enforcement levels — a correctness gap.
- **Full-page refresh mutations** — every workflow step is a server round-trip; multi-step operational work (site, field) will feel slow.
- **Approval inboxes** — approvals exist but a unified "my approvals" action inbox across modules is not surfaced.

## Automation opportunities
1. **Won → auto-provision** contract + project + budget + procurement plan in one guided action (partially exists via reactors — surface it as a workflow).
2. **PPM schedule → auto-generate work orders → auto-dispatch** (AMC).
3. **Commissioning complete → trigger handover package → activate warranty → start AMC** (the ELV lifecycle chain — currently broken at 11–13).
4. **Payment-certificate approved → auto-raise invoice → post to GL** (close the finance loop).
5. **BOQ line → material take-off → PR** (engineering→procurement bridge).
6. **Overdue AR / stalled deal / below-reorder stock → proactive signals** (Radar exists for CRM; extend cross-module).

## Verdict
The **commercial-to-cash spine (1–9, 15–16) is genuinely connected and event-driven** — a real achievement. The **delivery-to-service spine (10–14) breaks down** exactly where an ELV contractor makes and protects margin (execution, commissioning, handover, field service). Closing stages 11–14 is what turns AURA OS from "a great commercial ERP" into "an ELV contractor's operating system."
