# Full AURA Capability, Role & End-to-End Workflow Audit — Final Discovery Report

**Date:** 14 September 2026  
**Audit state:** DISCOVERY SCOPE FROZEN  
**Product state:** NOT FUNCTIONALLY COMPLETE; BUSINESS JOURNEYS NOT CLOSED/VERIFIED; NOT PRODUCTION READY

## Decision

The operational discovery pass is finished. It freezes a finite remediation scope across Sales, Pre-Sales, Award, Project Mobilisation, Engineering, Planning, Procurement, Site, QA/QC, HSE, Progress, Commercial, Finance, T&C, Handover, Service and Closeout.

Scope freeze means that every required capability has a named owner, journey stage, authority, evidence boundary and acceptance proof. Subsequent bounded remediation has promoted two leaves to COMPLETE and reduced the live operational proof queue from 55 to 52; 46 reconciled gap records remain tracked until their full acceptance criteria close.

Post-audit remediation has closed Waves 0, 1 and 2 for their bounded scopes. Direct Sale and Tender now prove canonical technical/quantity truth through estimate, maker/checker approval, issued Rev 0, persisted negotiation, immutable revised Rev 0, re-approved/issued Rev 1 and a final frozen award basis. Actual final-revision customer PDFs and internal XLSX workbooks were downloaded, reopened and reconciled; old or forged lineage cannot nominate the award source. Wave 3 is ready to start from that basis without re-entering BOQ quantity or selling price. These corrections do not change the frozen discovery totals, supplier-comparison verification remains sequenced with Wave 4, and AURA overall remains open, not functionally complete and not Production Ready. Evidence is recorded in the [Wave 1 Closure Report](./wave-1-progress-report.md) and [Wave 2 Closure Report](./wave-2-progress-report.md).

## Reconciled scope

| Measure | Total |
| --- | ---: |
| Capability leaves | 180 |
| COMPLETE | 2 |
| PARTIAL | 93 |
| BACKEND_ONLY | 9 |
| ABSENT | 1 |
| DISCONNECTED | 10 |
| WRONG_BEHAVIOR | 13 |
| UNVERIFIED | 52 |
| NOT_AUDITED | 0 |
| Reused J1–J6/UX findings | 34 |
| New source/live findings | 12 |
| Open gap records | 46 |
| Role × capability pairs | 999 |
| Journey × capability pairs | 938 |
| Page templates inventoried | 213 |
| Page templates with fresh live browser evidence | 32 |
| Page templates without fresh browser execution | 181 |
| New tests executed | 566 across 89 files |
| New tests passed / failed | 563 / 3 |

The 181 page templates without fresh browser execution remain visible in the page matrix. They do not represent 181 undiscovered capabilities: the functional scope is defined by the 180 capability leaves. Page-level execution is selected by the acceptance proof for each capability and by affected user journeys.

## Evidence boundary

The pass combined repository tracing, domain/service/API tests, PostgreSQL acceptance, Auth-ON browser execution and inspection of actual output. Fresh evidence includes Finance and Contract services, planning and resource domains, RFQ comparison, Scope Assist, internal communication, DocControl, Site, QA/HSE, Project lifecycle, T&C, Handover, Closeout, Assets/AMC and management surfaces.

The strongest fresh proof is bounded. It establishes individual rules and workflows; it does not prove that every named employee role can execute the complete journey. Representative role acceptance therefore remains an explicit programme gate.

Three fresh failures are retained as defects:

1. Canonical Tender DMS upload returned HTTP 500.
2. Quantity issue 20 / return 5 produced no issued position instead of net 15, including PostgreSQL confirmation.
3. Issue resolution persisted in the API while a stale UI response left the register visually open.

The browser matrix also exposed misleading capability claims: Tender “AI OCR” currently parses pasted CSV/tab text rather than extracting PDF/image content. External mail is not configured, governed AURA document attachments are not wired into compose, and the CEO surface is not a complete decision cockpit.

## What AURA can genuinely do today

AURA has working foundations, subject to the recorded role and output limits:

- CRM lead/opportunity records, selected qualification and conversion lineage, customer records and a native CRM XLSX export.
- Estimate arithmetic, quotation revision/freeze rules and selected commercial conversion services.
- Contract approval, revision, sharing, relationships, amendments, bonds, negotiation, obligations and payment-certificate services.
- Project creation/lifecycle controls, risks/issues, project containment, operations drilldown and closeout blocking rules.
- Controlled drawing review, revision, approval and issue history.
- Dated schedule activities, persisted planning proposals, proposal acceptance, resource-booking and conflict logic at domain level.
- Aggregate RFQ quote comparison and selected quote-to-PO service transfer.
- Site daily-report, NCR and HSE permit lifecycles in tested paths.
- Cost ledgers, customer invoices, VAT, AR/AP ageing, revenue recognition, statements, bank reconciliation and period-close services.
- Generic commissioning test points, expected/actual results, fail/defect/correct/retest history, readiness gates and handover evidence assembly.
- Internal mail/chat/meetings and My Work/My Day/Approvals workflows in tested scenarios.

These are usable building blocks. None has yet met the expanded all-layer, all-role COMPLETE definition.

## What exists but is incomplete or disconnected

- Sales intake now creates an atomic Pre-Sales deal-team/My Work handoff after conversion. The direct-sale path projects the complete canonical Lead context and unchanged versioned DMS files into a dedicated, independently reviewed Technical Study. Representative browser acceptance for every configured role remains incomplete.
- Tender now has the same structured Technical Study sections, Tender-bound DMS evidence and independent review flow. Tender submission is still disconnected from approved-study and internal-offer entry gates.
- Approved scope quantities can no longer be replaced by caller input in the governed direct-package chain, but legacy quotation paths can still bypass the approved study and the generated quote still loses item-level quantity presentation.
- Planning services contain useful logic, while the employee workspace cannot author the connected WBS, dependencies, resource demand, quantities, productivity, allocation, look-ahead and recovery chain.
- RFQ comparison is aggregate and omits the full technical/commercial decision basis.
- Engineering releases and plan decisions do not yet produce a clear, acknowledged handoff to Site, Buyer and resource owners.
- Certified work loses line-level lineage when converted to receivables.
- Handover-to-AMC linkage can lose the canonical customer/project/asset truth.
- Internal communication is usable, while external provider transport, governed attachments and record linking are disconnected.
- Management data exists in several authorities, while the CEO and manager experiences do not reconcile complete populations or drill down to governed facts.

## Important employee work still missing or unproved

- Representative browser acceptance for the remaining operating roles. A real Sales Manager qualification-amendment session and canonical Pre-Sales/Technical Manager Auth-ON boundaries are now proved.
- Tender-path structured ELV/MEP technical study and live file/evidence save/reload/submit are now proved. Full role-by-role browser acceptance and enforcement of the approved study at downstream Tender submission remain open.
- Tender quantity take-off now has canonical study/basis/line lineage into pricing. Full estimate lineage remains open for landed logistics, supplier-source commercial terms and revision continuity; direct-path take-off lineage still needs the same depth.
- Item-level supplier technical/commercial comparison and selected-quote continuity into procurement.
- A connected planning and resource-allocation workspace with availability, conflicts, productivity, actual progress, look-ahead, delay and recovery.
- Real file/evidence/signature save, reload, version retrieval and permission proof in the affected workflows.
- System-approved T&C content and controlled outputs for each supported ELV/MEP system.
- Representative non-admin sessions across the canonical Pre-Sales, Estimator, Technical Engineer and Technical Manager roles proving incoming work, action, approval, output and next-role receipt. The 22-role catalog and the first separated Auth-ON task/reviewer handoff are proved; full browser role acceptance remains open.

## Missing management capability

Technical, Procurement, Commercial and Project Managers need decision queues built from their own canonical records, not generic cards. CEO/senior management need pipeline, backlog, project health, schedule, resources, procurement exposure, revenue, cost, margin, cash, receivables, major risks/issues, changes/claims, forecast and closeout views with population definition, as-of time, currency basis and drilldown.

Backend finance/cost/risk evidence reduces uncertainty, but it does not close the management experience. A KPI cannot be accepted until its number reconciles to source records and leads to an accountable action.

## Missing or unverified outputs and integrations

- Governed customer quotation and Tender technical-proposal PDFs are now actual-file proved. Company-branded transaction outputs remain unverified for contract, PO, GRN, IPC, invoice, statement, daily report, handover and T&C certificate.
- Shared Excel export is HTML with an `.xls` name; the actual CRM XLSX lacks operational formatting and complete-population proof.
- External email send/receive, delivery failure/retry, attachment delivery and business-record communication history are not proved.
- Real binary download permissions and version retrieval remain unproved.
- Supplier comparison, programme/look-ahead, system test sheets and management packs need actual generated output inspection.
- AI extraction must either be named honestly as text/CSV parsing or implement real PDF/image/Excel extraction with human review.

## Required before functional completion

All 46 tracked gaps must be corrected or closed with evidence. All 52 remaining UNVERIFIED leaves must be executed and either promoted using saved proof or converted into a controlled, specifically classified gap. Required journeys must pass with representative roles, functional permissions, project/tenant containment, persisted records, actual documents/files and next-role receipt. The same approved business truth must survive from enquiry and study through estimate, award, project delivery, certification, finance, T&C, handover and service without manual re-entry.

Every employee workspace must also meet the shared UX acceptance standard: obvious next action, retained customer/project context, one primary action, honest labels, useful empty/error states, keyboard and mobile viability where the workforce requires them, and no button that claims an output without producing it.

## Work that may remain backlog

Optional advanced AI, extra automation beyond a reliable governed manual workflow, advanced optimization/scenario simulation, cosmetic themes and non-required integrations may remain backlog. External customer/supplier communication, contractual/regulatory documents, core role handoffs, project permissions, traceable commercial truth and system commissioning evidence cannot be deferred when they are required for normal operations.

## Controlled scope rule

The next programme must work from the master capability IDs and gap IDs. If implementation discovers a genuinely new major employee workflow, record it as a scope-change item with role, journey, authority, dependency and acceptance proof before building it. This keeps remediation finite while allowing evidence to correct an earlier UNVERIFIED classification.
