# Full AURA Remediation Roadmap

**Baseline:** Full AURA audit frozen on 14 September 2026  
**Objective:** Correct and prove all 180 capability leaves and all 46 open gap records through journey-led delivery  
**Completion claim prohibited until final gate:** AURA is not functionally complete, Business Journeys are not CLOSED/VERIFIED and the product is not Production Ready.

## Execution status

| Wave | Status | Evidence |
| --- | --- | --- |
| 0 | COMPLETE for its bounded safety scope | [Wave 0 Closure Report](./wave-0-closure-report.md): nine planned defects plus J1-08 corrected; wider capabilities remain assigned to later waves. |
| 1 | COMPLETE for its bounded journey scope | [Wave 1 Closure Report](./wave-1-progress-report.md): direct and Tender paths now have canonical inputs, versioned DMS evidence, persisted structured Technical Studies and independent approval. Bid/No-Bid is immutable with governed amendment history. PostgreSQL browser proof includes a real Sales Manager session and Tender study save/reload/submit. |
| 2 | CLOSED / VERIFIED | [Wave 2 closure](./wave-2-progress-report.md): Direct and Tender both prove issued Rev 0 → recorded negotiation → immutable revised Rev 0 → editable/re-approved/issued Rev 1 → complete history → final frozen award basis. Actual final-revision PDF/XLSX files reconcile and request data cannot nominate an old revision. |
| 3 | IN PROGRESS | [Wave 3 progress](./wave-3-progress-report.md). The frozen Rev 1 basis maps canonically into WBS/CBS and the SOLD ledger; responsibility reaches My Work; a For Construction revision reaches its named owner; the planner authors WBS-linked activities with dependencies, a working calendar, priced productivity, named resources, detected conflicts, measured progress, a governed baseline, a look-ahead, an assessed delay, an accepted recovery and a forecast. The wave’s remainder is counted, not described: of the six pinned proofs, AWD-06 is closed and **five remain — ENG-03, ENG-04, ENG-05, ENG-06, PLN-04**. |
| 4–10 | NOT STARTED as remediation waves | Audit evidence and acceptance gates remain frozen below. |

## Programme rules

1. Start with the real employee journey: Sales → Pre-Sales → Estimate → Offer, then continue the same awarded job through delivery and closeout.
2. Wave 0 may contain only safety, authorization, data-integrity and proof-harness work. It is not a procurement-first redesign.
3. Preserve canonical authorities. Do not copy quantities, approvals, project ownership, T&C readiness or handover state into convenient duplicate fields.
4. Every create action validates the canonical target. Every existing-record action derives project/customer ownership from persisted relations rather than trusting URL, query or body data.
5. Project scope and functional permission are both required where applicable. Organization-wide grants remain governed.
6. An interface label is never acceptance evidence. Save and reload the record, inspect the generated file/message/calculation, test denial cases and prove the next role received it.
7. Each 360 page is a context and decision dashboard. Specialist work opens through the AURA launcher into the canonical workspace while preserving customer, tender, project and return context.
8. Unknown implementation behind an UNVERIFIED leaf is investigated first. Build only after the existing authority and behavior are established.

## Shared definition of done

A capability can be promoted only when every applicable layer is proved:

`Domain → Persistence → API → Permissions → UI → Actual output → Browser usability → Cross-role handoff`

Each acceptance pack must contain:

- representative actor and role;
- canonical customer/tender/project/work-package context;
- allowed functional action;
- wrong-project/tenant and wrong-functional-permission denial where applicable;
- persisted record reloaded from the API/database;
- actual file, message, calculation or audit event where the capability produces one;
- notification/assignment and receipt by the next role;
- source data, revision, actor and time lineage;
- clear next action, honest status and usable error/empty state in the UI.

## Delivery structure

The estimates below are relative planning ranges for a staffed product squad, not calendar commitments. Waves are gate-driven. Platform work may run alongside a journey wave only when it does not invent or duplicate business truth.

| Wave | Business outcome | Primary gap ownership | Pinned UNVERIFIED proof | Indicative range |
| --- | --- | --- | --- | ---: |
| 0 | Safety containment and repeatable acceptance harness | J1-01, J1-07, J3-01, J3-02, J3-03, J3-04, J4-02, F-11, F-12 | None; creates fixtures used by all later proof | 1–2 iterations |
| 1 | Sales intake → governed technical study | J1-02, J1-03, J1-04, J1-05, J1-06, J1-12, J1-13, UX-01, UX-02, UX-03, UX-04 | STU-02, STU-06, STU-07, STU-08 | 2–4 iterations |
| 2 | Study → estimate → approved customer offer | J1-08, J1-09, J1-10, J1-11, J1-14, and the applicable offer surfaces of F-01, F-02, F-03 | None; the final Direct/Tender journey and its actual outputs are proved | 3–5 iterations |
| 3 | Award → mobilisation → engineering → connected plan | J2-02, J2-03, F-07, F-08 | AWD-06, ENG-03, ENG-04, ENG-05, ENG-06, PLN-04 | 3–5 iterations |
| 4 | Material need → supplier decision → PO/GRN/stock/site | J3-05, F-04 | EST-07, EST-11, EST-12, EST-13, SUP-01..12, BUY-01, BUY-02, BUY-03, BUY-07 | 3–5 iterations |
| 5 | Site execution → QA/QC/HSE → measured progress | J4-01, J4-03, J4-04 | SIT-01, SIT-06, QHS-01, QHS-02, QHS-06, QHS-07 | 2–4 iterations |
| 6 | Certified work → invoice → collection → final account | J5-01, J5-02 | COM-02, COM-07, COM-10 | 2–4 iterations |
| 7 | System T&C → handover → warranty/service → closeout | J6-01, J6-02 | TC-07, TC-10, HO-05, HO-10 | 3–5 iterations |
| 8 | External communication, documents and governed files | F-05, F-09 | OUT-03, OUT-09, MAIL-02, MAIL-10, XOP-10 | 2–4 iterations; capabilities also land inside Waves 1–7 |
| 9 | Manager and CEO decision acceptance | J2-01, F-06, F-10 | MGT-02, MGT-04, MGT-05, MGT-06, MGT-09, MGT-12, MGT-13 | 2–4 iterations after source facts exist |
| 10 | Full role journeys, regression and closure decision | No new scope; closes every remaining row | All role-specific and page/output acceptance evidence | 2–3 iterations |

The gap allocation reconciles to 46/46. The frozen programme allocated 55/55 verification leaves; 52 remain UNVERIFIED after bounded wave evidence promoted three leaves out of that queue.

## Wave 0 — Safety containment and proof harness

Correct or gate the known paths that can corrupt authority or operational truth:

- prevent Sales role authorization failure and self-approval bypasses;
- prohibit caller quantity changes from replacing an approved estimate basis;
- separate PO update from PO approval and validate supplier existence;
- represent partial receipt accurately and repair issue/return quantity positions with idempotency;
- use the project/company local business date rather than UTC for site defaults;
- prevent stale responses from overwriting newer issue state;
- rename the current Tender extraction action honestly until real OCR exists.

Create reusable fixtures for two tenants, two projects, positive/wrong-project/wrong-permission actors, representative role accounts, files, currency/tax cases and a complete ELV/MEP example job. Add API, browser and artifact capture helpers so later waves produce consistent evidence.

**Exit gate:** the nine owned gaps pass positive and negative tests; the known 3 fresh failures are green; affected unsafe actions are unavailable until fixed; typecheck/build and Project Scope/T&C/Handover regression remain green.

## Wave 1 — Sales intake to governed technical study

Build the employee path from the first enquiry:

- capture customer, contact, site, source, deadline, systems, scope summary, documents and owner once;
- show a clear next action and assign Pre-Sales/Engineer with due date, expected deliverables, input revisions and reviewer; the atomic assignment, My Work receipt, governed direct-sale study, canonical Sales-document handoff, DMS evidence versioning and representative canonical role grants are implemented;
- make the Tender 360 page the pre-award dashboard; its context block is now at the bottom and its specialist links register AURA workspace tabs;
- use the qualification area for Bid/No-Bid and the study area for drawings, specifications, client/authority requirements, site survey, system identification, compliance, deviations and RFIs;
- remove BOQ/estimation work from the Tender scope/specification workspace until the approved study hands off to estimating;
- explain every qualification factor on hover and keyboard focus, including its meaning, evidence and weighted-score calculation;
- record Bid/No-Bid as an immutable decision with actor/time/rationale and a governed reopen/amend flow; the immutable record, reasoned replacement, dedicated permission and history are implemented and proved through API and a representative Sales Manager browser session;
- open Engineering through the launcher in pre-award context and return to the same Tender/Opportunity.

**Exit gate — met:** Sales creates and qualifies an enquiry; Engineer receives the exact versioned study pack; direct and Tender study evidence uploads and reloads; the structured study persists and enters independent review; Sales can see status without editing engineering truth; the four pinned STU proofs are resolved for this bounded wave.

## Wave 2 — Technical basis to approved offer

Connect the approved study to a complete estimate:

- preserve quantity take-off lineage and revisions;
- include material, labour/productivity, engineering hours, plant/access, subcontract, wastage, risk/contingency and overhead; retain any existing supplier-source lineage;
- distinguish margin, markup, discount, cost and selling price;
- require technical and commercial internal approval before customer submission;
- generate separate internal pricing and customer technical/commercial outputs with correct company identity and no internal-margin leakage;
- preserve the frozen offer/quantity basis into award without manual re-entry;
- retire or gate legacy quotation paths that bypass the governed chain.

**Exit gate — met:** one Direct Sale and one Tender move from approved study through submitted offer, recorded negotiation, immutable Rev 0, re-approved Rev 1 and a final frozen award basis. Calculations reconcile; actual final-revision PDF and XLSX outputs open correctly; maker/checker, stale revision and forged-lineage refusals are proved. `EST-07`, `EST-11`, `EST-12` and `EST-13` remain frozen verification leaves and are sequenced with Wave 4 because their canonical authority is the supplier decision. This sequencing clarification changes no discovery total or capability scope.

## Wave 3 — Award, mobilisation, engineering and connected planning

Continue the same awarded job:

- create the contract/project and map frozen sold items to project/WBS/work packages once;
- assign PM, Project Engineer, Planner, Design, Site, QA/HSE, Buyer and Commercial responsibilities with dates;
- issue controlled drawings, submittals, technical query responses and transmittals to named recipients;
- connect schedule tasks to WBS, dependencies, milestones, calendars, quantities and productivity;
- author resource demand, named employee/team/equipment allocation, availability, conflicts and over-allocation in the planner UI;
- produce accepted baseline, look-ahead, delay/recovery and forecast versions;
- notify resource owners and Site of accepted assignments.

**Exit gate:** frozen scope reconciles to WBS and Sold projection; an approved engineering release reaches Site/Buyer; the planner allocates real resources, detects a conflict, accepts a recovery proposal and sends the resulting work to the responsible people; six pinned proofs are resolved.

## Wave 4 — Supplier decision and material delivery

Complete supplier comparison at item level:

- technical compliance, deviations/exclusions, make/model, quantity/unit, unit price, currency, tax, freight/logistics, lead time, payment terms, warranty, validity, approval status and recommendation;
- normalize commercial totals and preserve original quotation currency/terms;
- feed selected lines and terms into PO without retyping;
- carry planned need dates and project/work-package/cost-code context into requisition, RFQ, PO, GRN, stock and site issue;
- support partial receipt, rejected/accepted quantities, remaining exposure, issue/return and retry without double counting.

**Exit gate:** Buyer and Technical/Commercial managers approve a comparison; PO matches the selected version; Storekeeper partially receives and later completes it; Site issue/return reconciles quantities and value; all 16 pinned supplier/buyer proofs are resolved.

## Wave 5 — Site, QA/QC, HSE and progress

Provide a simple daily workspace for Site:

- assigned work, approved drawing, material availability, method/permit, labour/equipment and location appear in context;
- save photos, signatures and attachments as real governed evidence;
- let Site create daily report and inspection request without reselecting the project;
- expose the review/reject/correct/resubmit path from the register;
- enforce ITP hold/witness points, NCR correction/verification and HSE permit/incident authority;
- connect measured quantities and productivity to Planner and QS.

**Exit gate:** Site completes a day from assignment through approved report/inspection; evidence reloads and downloads under correct permissions; Planner sees actuals and QS sees the same measured quantity; six pinned Site/QHS proofs are resolved.

## Wave 6 — Certification, finance and collection

- author IPC lines from canonical measured work with previous/current/cumulative quantities;
- preserve retention, VAT/tax, variation and certification authority;
- create customer invoice lines from the frozen certificate basis;
- keep certified, billed, received and bank-reconciled values distinct;
- support receipt allocation, ageing, statements, claims/notices, collection tasks and final account/release;
- generate and inspect the governed IPC, invoice, statement and final-account outputs.

**Exit gate:** Commercial certifies line-level work, Finance invoices and allocates a real receipt, bank reconciliation closes it, and management drills from balance to source; three pinned COM proofs are resolved.

## Wave 7 — System T&C, handover, service and closeout

Preserve the verified generic T&C/Handover authority and add approved system content for CCTV, Access Control, Intercom, Structured Cabling, Wi-Fi/Network, PA/BGM, Fire Alarm where applicable, BMS, EMS/metering and supported MEP systems.

For each applicable system prove prerequisites, checklist/test points, expected criteria, actual readings, PASS/FAIL, witness/signature, attachments, defect/correction/retest, controlled certificate, readiness and handover evidence. Criteria must come from approved project specifications/procedures and support controlled templates/revisions.

Connect the exact accepted dossier, client acknowledgement, assets, warranty, defects-liability dates and planned maintenance into FM/AMC. Closeout must reconcile engineering, procurement, quality, commercial, finance, handover and service obligations.

**Exit gate:** at least one approved example per supported system family produces an inspected certificate and dossier; wrong/missing evidence blocks readiness; FM receives correct client/project/assets; all four pinned TC/HO proofs and both J6 gaps are resolved.

## Wave 8 — External communication, documents and files

This is a platform stream delivered inside the relevant journey wave:

- configure approved external email provider transport, receive/sync, failure/retry and communication history;
- link messages to customer, enquiry, opportunity, tender, supplier, contract and project;
- select governed DMS versions as attachments and retain delivery metadata without duplicating the canonical file;
- generate company/tenant-branded PDF and true XLSX/CSV outputs from the complete authorized dataset;
- enforce download/version permissions and formula-injection/data-leak protections;
- implement real PDF/image/Excel extraction only with preview, confidence, issues, human correction and separate governed approval.

**Exit gate:** real external send/receive round trip, attachment open, failure/retry, record history, allowed/denied download and representative PDF/XLSX/CSV inspection pass; all five pinned output/mail/file proofs are resolved.

## Wave 9 — Manager and CEO decisions

Create role-specific workspaces:

- Technical Manager: study/design/material/T&C review backlog, deviations and first-pass quality;
- Procurement Manager: sourcing decisions, expiries, shortages, late orders, commitments and remaining exposure;
- Commercial Manager: estimate exposure, certified/billed/collected values, changes, claims, margin and final account;
- Project Manager: mobilisation, schedule, resources, procurement, quality, risk, commercial and closeout blockers;
- CEO/Senior Management: pipeline, backlog, project health, schedule performance, utilization, procurement exposure, revenue, cost, margin, cash/receivables, major risks/issues, variations/claims, forecast and closeout.

Every KPI declares population, period/as-of time, currency/formula and unavailable-data behavior. Every action drills to canonical records and returns to the same filtered context. Fix first-50/fixed-limit behavior and never convert read failures into misleading zero values.

**Exit gate:** manager and CEO samples reconcile to source records, drill down to an accountable action and respect portfolio permissions; seven pinned MGT proofs are resolved.

## Wave 10 — Role journeys and final closure decision

Run representative, non-admin sessions for all 18 roles. Each role must prove incoming work, required information/documents, action/calculation, review/approval, actual output, alerts/dates, handoff and management visibility. Execute both Direct/Sales and Tender/RFQ paths through the shared awarded project and continue to closeout.

Run the full relevant domain/API/PostgreSQL/browser regression, project-scope matrix, typecheck and production build. Inspect actual artifacts rather than only test status. Reconcile the final master register to 180/180 with no UNVERIFIED, NOT_AUDITED, WRONG_BEHAVIOR, DISCONNECTED, ABSENT or unresolved critical/high gap.

Only then may a separate decision consider **AURA Functionally Complete** or **Business Journeys CLOSED/VERIFIED**. Production readiness requires its own security, performance, resilience, backup/recovery, observability, deployment and operational-readiness programme.

## Governance and progress reporting

Use capability IDs as the unit of completion. Each fortnightly review should report:

| Measure | Required view |
| --- | --- |
| Capability movement | Previous → current classification with evidence link |
| Gaps | Open, corrected, verified, reopened and blocked by ID |
| Journey | Last fully passed handoff and next blocking edge |
| Roles | Accepted role/capability pairs out of 999 applicable pairs |
| Outputs | Actual files/messages inspected and rejected |
| UX | Task success, time, errors, context loss and accessibility issues |
| Regression | Passed/failed by domain/API/browser/build; no hidden retries |
| Scope | Any proposed new capability with change rationale and authority |

No wave closes from screenshots, mocked persistence or administrator-only execution alone.
