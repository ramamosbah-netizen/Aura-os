# Full AURA Capability, Role & End-to-End Workflow Audit

14 September 2026 — **DISCOVERY SCOPE FROZEN; remediation and role acceptance remain open.**

The J1 and J2–J6 reports remain evidence only for the scenarios they identify. They are not a complete functional audit. This directory reconciles their findings with the expanded operational scope. No product authority or workflow is changed during discovery.

## Final deliverables

- [Final audit report](final-audit-report.md) — decision summary, evidence boundary and the seven requested answers.
- [Remediation roadmap](remediation-roadmap.md) — finite journey-led programme to correct and prove the full frozen scope.
- [Wave 1 closure report](wave-1-progress-report.md) — bounded Sales/Tender intake-to-governed-study implementation and proof.
- [Wave 2 progress report](wave-2-progress-report.md) — active study-to-offer remediation, actual PDF/XLSX output proof and remaining exit conditions.
- [Master capability and gap register](master-register.md) — 180 capability leaves; 34 reused findings plus 12 new source/live-verification gaps, not 46 newly discovered defects.
- [Role × capability](role-capability-matrix.md) and [role work / management decisions](role-work-and-decisions.md).
- [Journey × capability](journey-capability-matrix.md).
- [Workspace/page coverage](workspace-page-coverage.md) — 213 enumerated page templates, not 213 audited screens.
- [Cross-cutting matrix](cross-cutting-matrix.md).
- [System-specific T&C, output/report, handoff and UX matrices](systems-outputs-handoffs.md).
- [End-user UX acceptance standard](ux-acceptance-standard.md) — the shared screen, launcher, role-workspace and usability contract for every remediation wave.
- [Pinned verification queue](verification-queue.md) — the exact 55 capabilities that need operational proof before promotion.
- [Wave rationale and runtime record](remediation-waves-and-open-proof.md).
- [Machine-readable master](master-register.json) and [reconciliation totals](reconciliation.json).

Current leaf statuses: 89 PARTIAL + 10 BACKEND_ONLY + 1 ABSENT + 12 DISCONNECTED + 13 WRONG_BEHAVIOR + 55 UNVERIFIED + 0 NOT_AUDITED = **180**. Zero COMPLETE means no leaf has been granted the expanded all-role acceptance in this pass; it does not mean the product has no working functions. The 999 applicable role pairs and 938 journey pairs reuse capability IDs and are not additional capabilities or gaps. Representative employee-role acceptance is pinned in the roadmap and role matrix.

## Current evidence ledger

| ID | Evidence | Scope and limitation |
| --- | --- | --- |
| R-J1 | [Previous J1 audit](../2026-09-13-j1-enquiry-to-approved-offer.md) | Reused: 14 open findings, specific browser observations and isolated HTTP scenarios. Not re-executed in this pass. |
| R-J26 | [Previous J2–J6 audit](../2026-09-14-j2-j6-delivery-and-user-experience-audit.md) | Reused: 20 open findings, including carried procurement defects. Do not count deferred J1 procurement aliases again. |
| N-RFQ | Procurement RFQ domain, award-PO and sourcing-health tests | Newly executed: 15 passed, 3 files. Award-PO test mocks persistence/access; proves supplier/value/PR/project transfer at that service seam, not live buyer authorization or item-level commercial completeness. |
| N-PLAN | Resource booking, schedule planning, planning acceptance, resource calendar tests | Newly executed: 66 passed, 4 files. Domain calculations/governance only; no employee planner UI or PostgreSQL acceptance. |
| N-EST | Estimation and estimation-core characterization tests | Newly executed: 15 passed, 2 files. Arithmetic only; does not prove engineering scope or generated customer document. |
| N-MAIL | Mail provider, dispatch worker and sync engine tests | Newly executed: 49 passed, 3 files. Internal/fake providers; no external email sent or received. |
| N-TC | Test-punch and commissioning-readiness tests | Newly executed: 49 passed, 2 files. Generic evidence rules; not approved system-specific engineering checklists. An additional nonexistent handover-readiness test filter produced no extra file and is not counted. |
| N-PREAWARD | CRM/Tender/quantity/cost API and PostgreSQL proofs | 103 unique tests passed and 2 failed across 20 additional files. Lead context, qualification, stage gates, quotation pricing/revision/freeze, BOQ import, tender submission snapshots, cost ledger, certification and governed change control passed. Canonical tender DMS upload returned 500 (J1-06), and issue/return produced no quantity position instead of net 15 in both in-memory and PostgreSQL runs (J3-02). |
| N-FIN | Selected Finance domain/service tests | 100 passed across 13 files: customer invoices, VAT, AR/AP aging, revenue recognition, statements, bank reconciliation, payment idempotency and period close. This is backend proof; live Finance roles, files, permissions and management drilldown remain unverified. |
| N-CON | Selected Contract domain/service tests | 52 passed across 13 files: contract approval/revision/share/relationships, amendments, bonds, negotiation, obligations and payment certificates. This does not prove the full employee UI or signed branded outputs. |
| N-AI | Grounded Scope Assist and form extraction parsing | 41 passed across 2 files. Scope Assist keeps evidence provenance, rejects cross-tenant citations, marks stale evidence and turns acceptance into an editable draft requiring separate human approval. The generic form tool reads text/CSV, not PDF/image OCR; live model/provider and browser proof remain unverified. |
| N-LIVE | Local API/web against marked e2e-disposable PostgreSQL | API health reported 307/307 migrations, ready projections and e2e-disposable environment. Manual Auth-ON browser inspection covered RFQ comparison, CRM export/print, Communication, Command Center/CEO and Planning/Resources. |
| N-E2E | Selected live browser workflows | 74 browser tests executed: 73 passed and 1 failed. Coverage now includes Document Control, internal email/chat/meetings, My Work/My Day/Approvals, Customers, Project lifecycle/health/risks, Operations, Engineering Drawings, Site Daily Reports, NCR, HSE permits, T&C, Handover readiness/O&M/training/spares/defects, closeout, AMC work orders, Assets/Fleet, project-member containment and the direct-sale signal-to-close spine. The failed case persisted an issue resolution but left the register visually `open` after a stale response won the UI refresh race (F-11). The first three selected invocations did not terminate after reporting every test and were stopped during cleanup; the fourth exited normally with the recorded failure. |
| N-XLSX | [Downloaded CRM Accounts workbook](evidence/crm-accounts.xlsx) | Native XLSX opened with one correct 12-column account row and correct Unicode. Values are text; no table, filter, freeze pane, image or branding. |
| N-PLAN-LIVE | Auth-ON schedule and planning run | Persisted one dated task, produced a proposed 20→19 September finish change, displayed it in the UI and accepted it. API reload showed accepted status and the new finish. The sample had zero resource requirements. |
| N-VERIFY | Repository validation after live audit | Root typecheck completed 51/51 tasks; root build completed 27/27 packages, including the Next.js production build and API build. |
| R-W1 | [Post-audit Wave 1 closure](wave-1-progress-report.md) | Direct and Tender governed Technical Studies, canonical Sales-input and unchanged document/version inheritance, Tender-bound DMS evidence, independent review, approved-study-to-scope lineage, Tender AURA-tab launcher, locked Bid/No-Bid history, a real Sales Manager browser amendment and the canonical 22-role ELV/MEP catalog are browser/API proved. This closes only the bounded Wave 1 scope and does not alter the frozen discovery totals. |
| R-W2 | [Wave 2 active progress](wave-2-progress-report.md) | Quotation bypasses, Tender submit governance, offer line/revision fidelity and internal cost access are corrected. Customer quotation PDF, Tender technical-proposal PDF, direct pricing XLSX and Tender pricing XLSX are actual-file proved. Tender study → approved quantity take-off → lineage-preserving BOQ → pricing → draft offer is API/browser proved; no pricing/export/offer path accepts a legacy manual BOQ as commercial truth. Estimator prepares and Commercial Manager independently approves in Auth-ON API proof. Direct intended-role browser acceptance, negotiation and restricted-role browser output proof remain open. |

New unique executed total: **566 tests across 89 files**: 563 passed and 3 failed. This consists of 492 domain/service/API executions (490 passed, 2 failed) plus 74 browser executions (73 passed, 1 failed); the repeated quantity-ledger run against PostgreSQL confirms the same defect and is not counted twice. The first three selected browser invocations required manual cleanup after every test was reported green, so their final process exits are not counted as clean passes; the fourth produced a clean failing exit for F-11. This does not supersede the reused J2–J6 regression with two failures. Initial package-runner attempts could not resolve vitest; reran through the installed runner. No dependency install occurred.

## Newly established source findings

1. Shared register export builds CSV and HTML with an `.xls` extension; Print invokes browser printing. Excel/print use passed rows, even where CSV has a full-register endpoint. [Source](../../../apps/web/components/export-button.tsx).
2. Actual XLSX generation exists for CRM customer portfolio/dossier using SheetJS. Its file contents, authorized population and workbook rendering remain unverified. [Source](../../../apps/api/src/crm/account-360.controller.ts).
3. DocumentSheet hardcodes company name and TRN in the letterhead. This is not tenant/company-branded output. [Source](../../../apps/web/components/document-sheet.tsx).
4. Template PDF preview substitutes example project/customer/amount values and placeholder logo/table rectangles; it does not demonstrate generation from an approved transaction. [Source](../../../apps/web/components/visual-template-builder.tsx).
5. RFQ quote has supplierName, amount, leadTimeDays, notes and status. Lowest-amount recommendation is implemented. Item-level technical/commercial normalization is not represented by this model; alternate sources must be searched before any system-wide ABSENT claim. [Source](../../../modules/procurement/src/domain/rfq.ts).
6. Mail dispatch registers the AURA-internal adapter. Provider contracts and mock tests do not establish working Gmail/Microsoft external transport. [Source](../../../apps/api/src/comms/mail/mail-dispatch.worker.ts).
7. Planning contains resource bookings, current feasibility, calendars, persisted proposals and acceptance governance. It must not be classified as only WBS/baseline. [Source](../../../modules/projects/src/domain/resource-booking.ts), [UI](../../../apps/web/components/planning-run-panel.tsx).
8. Commissioning has generic test definitions, expected/actual values, immutable test runs, defect/retest and readiness. Canonical taxonomy has 14 values; EMS and HVAC are not distinct values in that list. This alone does not establish absence of project-defined tests or alternate engineering records. [Taxonomy](../../../shared/src/domain/elv-context.ts), [run](../../../modules/commissioning/src/domain/commissioning-test-run.ts).
9. Executive CRM reads at most 5,000 opportunities and 2,000 accounts; complete portfolio coverage beyond those limits is not proven. Procurement dashboard aggregates PO values and converts failed reads to an empty array. Neither is sufficient proof of a CEO or procurement manager decision cockpit. [CRM](../../../apps/api/src/crm/executive-crm.controller.ts), [Procurement](../../../apps/web/app/procurement/dashboard/page.tsx).
10. The live schedule can create dated activities and accept a persisted solver proposal, but its task form has no WBS, predecessor, calendar, resource requirement, planned quantity or productivity controls. Those facts exist in domain/persistence or in other authorities and are not connected into one planner workflow. [Schedule UI](../../../apps/web/components/gantt-client.tsx), [planning proposal UI](../../../apps/web/components/planning-run-panel.tsx).
11. The live mail workspace has a usable internal draft/schedule/send/reply loop. External Microsoft/Gmail accounts are not configured, the composer states that AURA Document attachments are not wired, and it has no customer/enquiry/tender/supplier/project relation control.
12. The live CEO perspective displays three KPI cards and a financial project table. Project names are not links and the surface provides no as-of/source metadata; schedule, resources, procurement delivery exposure, receivables, risks, variations and closeout decisions are not present in that perspective. [CEO UI](../../../apps/web/components/ceo-command-center.tsx).

## Scope-freeze rule

Every capability has an explicit classification and evidence level. COMPLETE still requires applicable domain, persistence, API, permissions, UI, actual output and cross-role handoff proof. A classified verification gap is not a confirmed missing feature. The discovery scope is frozen because all 180 leaves are classified and the remaining 55 proof gaps are explicit acceptance work; no new broad capability may be added during remediation without a controlled scope-change record. This is not AURA functional completion, Business Journeys CLOSED/VERIFIED or Production Ready.
