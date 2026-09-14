# Wave 0 Closure Report — Safety, Authority and Truth Protection

**Executed:** 14 September 2026  
**Baseline:** [Full AURA Remediation Roadmap](./remediation-roadmap.md)  
**Scope:** Safety containment and reusable acceptance proof. This report does not declare AURA functionally complete, any business journey closed, or Production Ready.

## Outcome

All nine Wave 0 safety defects have been corrected and their specific failure modes are protected by automated or browser evidence. J1-08, planned for Wave 2, was also corrected early because it shared the approved-scope boundary.

The wider capabilities attached to J4-02 and F-11 remain PARTIAL: the Dubai date defect and stale-response defect are closed, while full daily-report artifacts and portfolio/My Work issue rollups remain work for Waves 5 and 9.

| Gap | Corrected behavior | Proof | Defect status | Wider capability |
| --- | --- | --- | --- | --- |
| J1-01 | Sales uses lead/opportunity functional permissions for create, qualify and convert. | Auth-ON J1: sales create `201`, qualify `200`, convert `201`; no administrator continuation. | CLOSED | INT-04 continues in Wave 1 for complete intake/handoff. |
| J1-07 | Inline scope/estimate approval is rejected. Scope and estimate approval require dedicated `crm.scope.approve` / `crm.estimate.approve` permissions. | Author `403`; Sales `403`; Sales Manager `201`; inline approval `400`; metadata fitness tests `2/2`. | CLOSED | Full technical study review remains Wave 1. |
| J3-01 | PO update cannot set approved/received. Approval remains a governed command. | Wrong actor `403`; direct status elevation `400`; authorized approval succeeds. | CLOSED | Supplier decision workflow remains Wave 4. |
| J3-02 | Stock movements use the persisted movement identity for idempotency. An issue and its return can no longer collide. | Issue 20, return 5 and retries leave canonical net issued quantity 15; quantity ledger `4/4`. | CLOSED | Full site material workflow remains Wave 4/5. |
| J3-03 | PO status reconciles cumulative GRNs as `partially_received` then `received`. | Receive 1/100 → partial with 99 outstanding; receive remaining 99 → received. | CLOSED | Rejection/valuation/exposure continues in Wave 4. |
| J3-04 | PO supplier must resolve to an approved canonical supplier in the tenant; its canonical name is snapshotted. | Missing supplier `404`; approved supplier save/reload succeeds. | CLOSED | Full technical/commercial supplier comparison remains Wave 4. |
| J4-02 | Site date input uses the Dubai business date rather than UTC. | `2026-09-13 20:30 UTC` resolves to Dubai `2026-09-14`; locale test `1/1`. | CLOSED | SIT-03 remains PARTIAL pending attachments, signatures and controlled printable diary in Wave 5. |
| F-11 | Project issue loads are sequence-guarded so an older response cannot overwrite a newer mutation result. | Browser issue-resolution scenario reported `ok 1`; persisted resolved state remains visible. | CLOSED | MGT-11 remains PARTIAL pending portfolio and My Work rollup proof in Wave 9. |
| F-12 | Tender import is labelled honestly as BOQ/Excel/pasted-row import; the UI explicitly states that PDF/OCR extraction is a later capability. | Direct browser inspection of the separate BOQ workspace; source contains no false AI/OCR action claim. | CLOSED | Actual governed OCR remains future scope and must include review before changing truth. |
| J1-08 | Estimate quantity is always loaded from the persisted approved basis. Caller echoes are optional and must match exactly. | Approved basis quantity 24; spoofed quantity 240 → `400`; canonical cost remains 2,400. | CLOSED EARLY | Complete estimate and offer outputs remain Wave 2. |

## Tender usability evidence

The live browser was used with a newly created disposable tender to verify the requested end-user flow:

- Tender 360 acts as a dashboard and contains no BOQ editor.
- “Tender scope & specifications” appears first and provides Drawings, Client specifications, Client requirements, Scope summary, System identification, Government/authority requirements, Site information, and Study notes/assumptions.
- The Tender Workspace launcher is at the bottom and opens specialist work while retaining the tender context.
- Every Bid/No-Bid criterion is keyboard-accessible and explains its meaning, scoring guidance, weight and live contribution formula.
- Confirming the decision stores `CONDITIONAL BID`, displays the saved result and removes the rating controls.
- BOQ opens as a separate workspace after scope review and qualification.

## Regression evidence

| Check | Result |
| --- | ---: |
| Project Scope service matrix with Auth ON | 69/69 passed, including the 59 classified assertions |
| T&C/Handover evidence-derived readiness | 44/44 passed |
| Commissioning/Handover HTTP authority protection | 1/1 passed |
| J1 Auth-ON journey | 1/1 passed |
| Pre-award approval permission fitness | 2/2 passed |
| Quantity ledger HTTP | 4/4 passed |
| Procurement depth HTTP | 1/1 passed |
| Procurement service | 9/9 passed |
| CRM focused services | 28/28 passed |
| Cross-module subscriber | 29/29 passed |
| Dubai business date | 1/1 passed |
| Repository typecheck | 51/51 tasks passed |
| API production build | Passed |
| Web production build | Passed (241 pages) |

The old commissioning HTTP test previously tried to satisfy handover by toggling six booleans. That expectation contradicted the already-verified canonical readiness model. It now proves the API refuses those manual ticks; the complete evidence-derived acceptance chain remains covered by the 44 commissioning readiness tests.

## Wave 1 progress — Sales intake to Pre-Sales context

The first Wave 1 slice is implemented and verified in the live browser:

- New enquiries now capture customer/contact details, requirement, project/site, location, ELV and MEP systems, sector, project stage, deadline context, estimated value, consultant and main contractor in one form.
- A self-captured enquiry is assigned to the authenticated Sales user immediately; the owner is visible on the board and record page.
- The successful API response is added to the lead board immediately after save. Browser proof showed the active/new counters change from 2 to 3 and the new record appear without a reload.
- Lead conversion seeds one canonical open requirement from the original enquiry text in the same transaction as the opportunity. The J1 Auth-ON observation now reports `requirementsAfterConversion=1` and `opportunityOwner=j1-sales`.
- Lead conversion now creates the Pre-Sales handoff atomically as an Opportunity deal-team membership and a linked CRM task. The assignment carries an assignee, reviewer, due date, input revision and named deliverables; a failed assignee validation leaves the Lead unconverted.
- Auth-ON API proof shows the assigned engineer had zero work items before conversion and received the new task afterwards (`automaticAssignmentVisible=true`, due `2026-09-23`, reviewer `j1-checker`).
- Live PostgreSQL/browser proof shows the converted Opportunity and a `Complete Pre-Sales study` task in My Work with the exact revision, reviewer and four requested deliverables.
- The shared system vocabulary now covers the audited ELV and MEP families, including CCTV, Access Control, Network/Wi-Fi, Fire Alarm, BMS, EMS/metering, HVAC, electrical power, lighting, plumbing, drainage, fire fighting and fire suppression.

This advances J1-02 and J1-03 and closes the bounded automatic-assignment defect. Subsequent Wave 1 work added the governed direct-sale Technical Study, independent review and canonical study-to-scope lineage; see the [Wave 1 Progress Report](./wave-1-progress-report.md). The local representative role grants and Tender-path study remain open.

## Known J1 findings intentionally carried into Wave 1 and Wave 2

The J1 characterization still proves these open product gaps; Wave 0 does not hide them:

- the automatic handoff is persisted through canonical deal-team membership and My Work, and the direct-sale study now has typed revision/reviewer fields plus governed review; representative role grants and Tender parity remain open;
- dedicated Pre-Sales/Estimator/Technical Engineer/Technical Manager roles and permission bundles are absent from the current local role directory;
- the seeded requirement now feeds the direct-sale structured compliance study canonically, and governed direct-study evidence upload/version/download is proved; the Tender structured-study path remains open;
- legacy quotation creation can still occur before the technical study;
- the generated customer quote collapses the approved 24-unit basis into one selling-price line;
- reading revisions from the leaf does not return the complete chain;
- the Tender can reach submission without a structured technical study and internal offer approval.

## Next execution gate — Wave 1

Wave 1 starts with the same employee and record, in this order:

1. Complete preservation of customer, contact, site, deadline, systems, scope summary, documents and owner through enquiry → opportunity without re-entry. Intake capture, owner and the initial requirement are implemented; linked documents and full conversion-field proof remain.
2. Reconcile the standard role catalog and configure representative Pre-Sales/Estimator/Technical Engineer/Technical Manager grants; retain the proven My Work receipt and independent-review rules.
3. Extend the now-persisted direct technical study, requirements, survey, compliance, deviations and RFIs to the canonical Tender path; direct-path governed file evidence is proved.
4. Preserve the completed Tender 360 dashboard placement and AURA-tab launcher behavior while adding specialist context.
5. Exercise the implemented governed Bid/No-Bid amendment history with a signed-in representative qualification manager; immutable storage and Auth-ON API permission proof are complete.
6. Gate estimate/quotation creation on the approved technical basis and hand the exact approved revision to Estimation.

Wave 1 closes only when a real Sales role hands the exact versioned study pack to a real Pre-Sales/Engineer role, the reviewer approves it, Sales can observe without changing technical truth, and the browser makes the next action clear.
