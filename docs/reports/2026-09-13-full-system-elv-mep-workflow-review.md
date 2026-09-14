# AURA — full-system ELV/MEP workflow review and redesign

Follow-up: the [business capability depth audit](2026-09-13-business-capability-depth-audit.md) adds fresh HTTP and authenticated evidence and supersedes this document's proposed work order. Confirmed transaction-control and quantity-integrity defects take priority over presentation changes.

Date: 13 September 2026. Status: **Initial source-backed review and proposed operating design. Implementation and business acceptance remain open.**

This covers the whole business, not only Tendering. It builds on the current working tree, including the recent authorization and tender changes. Earlier audits are historical context, not evidence that today's user experience is acceptable. This pass inspected navigation, selected domain models, handover wiring and the recently exercised screens. It is not a fresh exhaustive browser audit of every module, a legal compliance assessment, or a production-readiness certificate.

## What is wrong today

The user's complaint is credible even where individual modules pass tests. A person must understand the application's internal ownership and navigation to know where to work next. A suite launcher answers “where can I go?”; a working dashboard must also answer “what must I do, for which job, and why?”

| Finding | Current evidence | Required correction |
| --- | --- | --- |
| Navigation principally groups capabilities by suite | [Suite definitions](../../apps/web/lib/suites.ts), [home launcher](../../apps/web/components/aura-home-grid.tsx) | Keep the launcher for discovery; make assigned work and job context the normal operational entry points. |
| There are useful foundations for personal work | [My Work](../../apps/web/components/my-work-dashboard.tsx) models tasks, dates, decisions and links | Extend that composition instead of creating a competing task inbox in every module. Show blocker, responsible person and source action. |
| Project screens already preserve a project context, but the selector is narrower than the business | [Project shell](../../apps/web/components/project-shell.tsx) uses the eight-item [ELV selector](../../apps/web/lib/project-scope.ts); the [shared discipline model](../../shared/src/dimensions/discipline.ts) also contains mechanical, electrical, plumbing, HVAC and fire disciplines | Design an explicit mapping between discipline, system and physical asset. Do not simply relabel ELV device IDs as MEP disciplines. |
| Tender study evidence is not yet a structured technical study | [Study panel](../../apps/web/components/tender-study-panel.tsx) records categorized DMS files and notes | Add requirement/system records, applicability, compliance result, reviewer, source revision and unresolved questions. A file count must not imply study completion. |
| Direct sales already has structured requirements, while the new tender study is evidence-oriented | [Requirement and solution-scope model](../../modules/crm/src/domain/solution-scope.ts), [prior ownership comparison](2026-08-30-direct-vs-tender-estimation-capability-data-ownership-audit.md) | Compare current capabilities and reuse a common user vocabulary. Do not create another independent estimate or silently migrate either commercial path. |
| Tender's technical launcher leaves the tender for global Engineering | [Tender launcher](../../apps/web/components/tender-360-context.tsx) links Technical to `/engineering` | Pre-award technical work must stay in tender/opportunity context. Project Engineering is reached after project creation, with an explicit handover. |
| Valuable business handovers already exist | [Cross-module subscriber](../../apps/api/src/events/cross-module-subscriber.ts) contains award-to-contract, signed-contract-to-project, certification-to-invoice and service-to-invoice handling | Expose completion, pending prerequisites and failures to the responsible team. Do not replace established handovers with duplicate “create next record” buttons. |
| Procurement and site records have meaningful lineage | [PO](../../modules/procurement/src/domain/purchase-order.ts) links PR/RFQ/project/CBS/BOQ; [installation](../../modules/site/src/domain/installation.ts) records installed quantity against a measured item | Provide task-focused views of that lineage, while keeping ordered, received, issued, installed and approved quantities distinct. |
| Completion and service are governed, not just statuses | [Handover](../../modules/commissioning/src/domain/handover.ts), [service work orders](../../modules/amc/src/domain/work-order.ts) | Show missing evidence and next responsibilities without weakening acceptance, testing or service-completion rules. |

## Proposed operating model

Use three complementary entry points across the entire application:

1. **My Work:** assigned actions, decisions, deadlines and blockers. Each action opens its actual record.
2. **Jobs:** the commercial opportunity/tender before award, the project after handover, and the service contract/site during maintenance. Preserve source references between these records; do not force them into one editable aggregate.
3. **Workspaces:** AURA launcher cards for specialist registers, portfolio work and administration.

Every working page needs a consistent header: job/client, reference, stage, responsible person, due date, scope/system/location where applicable, and a return link. The primary action must come from the current record's permitted transition. Show “awaiting consultant approval” rather than an unexplained disabled button. Loading failures must be distinguishable from an empty register.

The default dashboard should contain stage, outstanding actions, blockers, upcoming commitments and recent decisions. Put workspace links below this operational information. A specialist needs their register and task tools; a project manager needs exceptions and coordination across those registers.

## Full business journey and handover contract

The following is the target operating design. Required fields and gates below are proposals until reconciled with the existing domain rules and agreed business policy.

| Stage | Accountable role | Work and evidence | Handover / next recipient |
| --- | --- | --- | --- |
| Enquiry and lead | Sales owner | Client, contact, site, source, requested systems, dates, approximate value where known, next contact | Qualified opportunity and a named owner; reasons retained for disqualification |
| Opportunity shaping | Sales + pre-sales lead | Client needs, site/survey information, delivery model, stakeholders, direct-sale or tender route | A scoped study assignment with due date and evidence, not just a new tender number |
| Bid decision | Authorized commercial decision-maker | Business fit, capacity, competition, commercial outlook and risk assessment | Recorded Bid / Conditional Bid / No Bid. Confirmed ratings stay locked; conditional obligations must be visible |
| Technical study | Pre-sales lead | Systems, requirements, drawings/specification revisions, compliance, authority applicability, exclusions, interfaces, assumptions, RFIs | Reviewed scope baseline and unresolved issues explicitly accepted or resolved |
| Quantities and cost | Estimator with technical contributors | Take-off references, units, quantities, vendor quotations, material/labour/subcontract cost, assumptions | Reproducible estimate revision tied to the scope it priced |
| Pricing and offer | Commercial manager + Sales | Margin decision, payment terms, validity, exclusions, technical proposal, approval and submission | Approved customer offer; revision and client response retained |
| Negotiation and award | Sales + contracts | Changes to offered scope/price, award evidence, approved commercial basis, terms and obligations | Governed contract; award and signed-contract status remain distinct |
| Mobilisation | Project manager | Received commercial snapshot, budget, programme, team, WBS/CBS mappings, procurement priorities, risks and authority submissions | Named delivery responsibilities and a visible handover acknowledgement |
| Engineering | Engineering lead | Design, coordination, shop drawings, material submissions, RFIs, revisions and release status | Approved/released information reaches procurement and site with source references |
| Procurement and logistics | Procurement + stores | Requisitions, RFQs/comparison, approvals, PO, delivery dates, receipt and shortages | Traceable material availability by project/work package; financial commitment retained |
| Site delivery | Site engineer / supervisor | Work fronts, labour, materials, installation quantities, constraints and daily records | Inspection request and measured work linked to the correct scope item |
| Quality and HSE | QA/QC and HSE leads | Inspections, tests, NCRs, permits, incidents and corrective actions | Accepted work and safe-work evidence; safety competence can remain person-wide |
| Project controls and change | PM + planner + cost controller | Programme, quantities, actual/committed costs, forecasts, variations, delays and risk actions | Decisions with assessed cost/time/scope impact; baseline versus change remains visible |
| Valuation and collection | QS/commercial + Finance | Measured applications, certification, retention, invoice, due dates, receipts and disputes | Collectable balances and reconciled financial records, distinct from physical progress |
| Testing and handover | Commissioning lead + PM | System tests, integrated tests where applicable, punch items, as-builts, O&M, training, spares and client acceptance | Accepted handover package, warranty obligations and service references |
| Warranty and AMC | Service manager | Covered systems/assets, warranty dates, SLA, PPM schedule, tickets, visits, parts and completion evidence | Completed service and governed billing where billable |
| People, assets and administration | Functional owners | Workforce availability/competence, time/payroll, fleet/tools, suppliers, access, master data and audit | Supporting services linked to jobs where applicable, without imposing project ownership on every record |

These stages overlap in real work. Procurement may start for an approved package while other drawings remain in review. The design must support package-level readiness and exceptions; it must not force every project through one global sequential wizard.

## ELV/MEP technical structure

Keep the following concepts separate:

- **Discipline:** electrical, mechanical, plumbing, HVAC, ELV, fire protection and other governed classifications.
- **System:** a defined technical installation such as access control, structured cabling, chilled water or ventilation. The list is configured for the job, not inferred from a page name.
- **Location:** building, level, room, zone or work front.
- **Work package:** a deliverable/planning/procurement grouping with explicit scope links.
- **Measured item:** BOQ/quantity basis with unit and approved source revision.
- **Asset/device:** an installed maintainable item with identity, location and warranty/service information where required.

A requirement should identify its source document/revision and clause, applicable system/location, mandatory or optional nature, proposed response, compliance state, open question, responsible person and review evidence. Authority requirements also need jurisdiction and applicability. Uploaded text alone is not proof of compliance, and government rules should not be guessed by AI.

Changes after scope approval must create an explicit revision or change record. Preserve the relationship from requirement to scope, priced offer, contracted item, engineering deliverable, installed/inspected work and handover evidence. Establish mappings through canonical relations; do not assume one common ID exists across all modules.

## Screen and responsibility redesign

| User | Default screen | Primary question |
| --- | --- | --- |
| Sales | My opportunities and client commitments | Who must I contact, what is due, and what decision is needed? |
| Pre-sales | Assigned studies by system/package | What must I study, what evidence is missing, and what can be released for costing? |
| Estimator | Costing assignments and revision comparison | Which approved scope am I pricing and which costs remain unsupported? |
| Project manager | Project overview and exceptions | What threatens scope, time, cost, acceptance or cash? |
| Engineer | Assigned deliverables and responses | Which revision is current, what is awaiting approval, and who needs it next? |
| Buyer / storekeeper | Requirements, delivery commitments and receipts | What must be sourced or received for the upcoming work? |
| Site team | Today's work by location/system | What can proceed, what is blocked, and what evidence must I record? |
| QS / Finance | Applications, certifications, invoices and collection | What is earned, certified, billed, due and collected? |
| Service engineer | Assigned visits and assets | What is covered, what is due, and what closes this visit? |
| Management | Cross-job exceptions and decisions | Where is intervention needed, by whom and by when? |

Do not equate these product roles with automatic permission grants. Job membership and functional permissions remain separate; commercial values and payroll information require their own governed access.

## Prioritized implementation sequence

| Order | Bounded delivery | Exit evidence |
| --- | --- | --- |
| 1 | Agree the role/task vocabulary, stage ownership and page contract; inventory current primary actions against this document | One named source for every action; no competing task or decision writer |
| 2 | Consistent job header, next action, blockers and return path in My Work, commercial records and Project 360 | Role-based walkthrough finds assigned work without needing module knowledge; no context loss |
| 3 | Structured pre-sales studies shared in vocabulary across direct and tender routes, including real MEP applicability | Requirement → evidence → reviewed scope traceability; existing estimation ownership preserved |
| 4 | Scope-to-estimate-to-offer guidance and explicit revision comparison | Both direct and tender cases reach approved offers with reproducible source revisions |
| 5 | Visible award-to-project handover and mobilisation checklist | PM can identify accepted scope, obligations, budget and unresolved handover items without copying records |
| 6 | Engineering, procurement, site and QA work-package coordination | One ELV and one MEP package reach installed and inspected status with distinct quantity positions |
| 7 | PM controls, valuation and finance exceptions | A variation, certificate, invoice and receipt retain their distinct approvals and reconciled amounts |
| 8 | Commissioning, handover and service continuity; People/assets support views | Acceptance evidence leads to correct warranty/service context; completion and invoicing remain governed |
| 9 | Full-role usability acceptance and navigation retirement | Users complete the journeys below; old routes redirect safely only after their replacement is proven |

This sequence is dependency-based, not a calendar estimate. A full rewrite, automatic production migration and changes to legal/financial authority are not implied by this review.

## Business acceptance scenarios

Use separate test data and real permissions. Observe task completion, wrong turns, duplicated entry and comprehension; do not substitute screenshots or build success for business acceptance.

1. Direct ELV job: enquiry → site study → CCTV/access-control scope → cost → approved quotation → award → commercial handover.
2. MEP tender: drawings/specifications → HVAC/electrical/plumbing requirements → authority applicability → questions → qualified scope → priced submission.
3. Procurement delay: approved package → PO commitment → partial delivery → blocked work front → reassignment/escalation visible to PM.
4. Design change: new drawing revision → affected scope/work identified → priced variation → approved change; prior baselines still readable.
5. Site and quality: material issued → quantity installed → inspection rejected → rectification → acceptance; no false certification or double-counting.
6. Financial cycle: application → certified amount → invoice → part-payment → balance, without changing physical progress.
7. Completion: failed test or missing O&M blocks the appropriate acceptance step; resolved evidence allows governed handover.
8. Warranty/AMC: accepted system → service obligation → assigned visit → evidence → completion and billing if eligible.
9. People and safety: allocate an eligible person to work while preserving restricted HR data and person-wide competence records.
10. Access and recovery: wrong-project user is denied; a failed load or handover is visible and recoverable; retry creates no duplicate business record.

Proposed usability targets for business agreement: a user finds their assigned action within 30 seconds, identifies the job and current stage without help, sees the responsible person for every blocker, and enters source information only once. These targets have not yet been measured.

## Decisions still needing business input

The design currently assumes a contractor carrying out both direct ELV jobs and competitive MEP tenders. Confirm or revise: who authorizes conditional bids; who signs technical scope; whether the PM accepts the commercial handover; which approval thresholds apply; and whether service is performed by the same team. These decisions refine implementation; they do not invalidate the source findings above.

**Outcome of this pass:** whole-system operating design and concrete implementation backlog delivered. The application has not yet been redesigned end to end or accepted by its business users. Earlier Project Scope closure remains a specific authorization result, not business usability approval.
