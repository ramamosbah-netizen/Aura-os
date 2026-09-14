# Wave 1 Closure Report — Sales Intake to Governed Technical Study

**Date:** 14 September 2026  
**State:** CLOSED / VERIFIED for the bounded Wave 1 scope  
**Programme state:** AURA is not functionally complete; Business Journeys are not CLOSED/VERIFIED; the product is not Production Ready.

## Delivered and proved

The direct-sale and Tender paths now carry canonical enquiry/tender inputs into governed Pre-Sales studies rather than asking Engineering to reconstruct the brief:

- Sales intake records the customer/job context, assigns the authenticated owner and updates the board immediately.
- Conversion creates the Opportunity, canonical requirement, deal-team assignment and My Work task atomically. The handoff carries assignee, reviewer, due date, input revision and deliverables.
- A direct Opportunity has a persisted, revisioned Technical Study with systems, interfaces, requirement compliance, acceptance criteria, technical response, survey findings, clarifications/RFIs, deviations, assumptions, exclusions and governed-document references.
- Linked Sales requirements are resolved from the persisted Opportunity. The API rejects a requirement ID from another Opportunity and replaces altered caller text/source with the canonical record.
- The study follows draft → in review → approved/changes requested. The author cannot self-approve; a user with the wrong functional permission is denied; only the assigned independent reviewer can decide.
- Reviewer assignment now validates both the active user registry and `crm.study.approve` in the Opportunity's canonical tenant/company context. The UI requests this eligible reviewer directory and does not offer the current author.
- Approved study revision and client-input revision become the canonical source of the Scope basis. Caller-provided `sourceId` no longer controls the lineage.
- Tender-route Opportunities no longer expose the direct study editor. They show the next action into the canonical Tender workspace so pre-award truth is not split.
- A Tender now has the same persisted, revisioned Technical Study structure as a direct Opportunity. Its systems/interfaces, compliance responses, site survey, RFIs, deviations, assumptions, exclusions and evidence remain bound to the persisted Tender rather than a caller-supplied Opportunity or project.
- Tender study evidence is stored in DMS against the canonical `tendering.tender` aggregate. The API replaces caller-supplied file metadata with the persisted document revision, rejects evidence from another Tender and permits governed read/download only through the Tender study permission.
- Tender studies follow the same independent draft → in review → approved/changes requested decision path. Pre-Sales can prepare and submit; the assigned Technical Manager decides; Sales and the author cannot approve.
- The direct Technical Study workspace now uploads drawings, client specifications, client/authority requirements, survey evidence and technical references into the governed DMS. It adds immutable file revisions, reloads the register, and opens the exact revision frozen into a study rather than silently switching to the latest file.
- Study evidence metadata is resolved from DMS. Caller-supplied title, kind and revision are replaced by the persisted document values, and a document linked to another Opportunity is rejected.
- Sales now uploads and versions the client enquiry, RFQ, drawings, specifications, requirements, authority inputs, site information and correspondence directly from the Lead workspace. These files remain canonical `crm.lead` DMS records.
- Conversion does not copy or re-upload Sales files. The persisted Opportunity `leadId` and active deal-team membership derive read/download access for the assigned Pre-Sales engineer and independent technical reviewer. Sales retains revision ownership; the study workspace labels inherited inputs and keeps their revision control read-only.
- The Technical Study now receives a read-only projection of the canonical Sales intake: customer/contact channels, project/site, systems, scope, sector/stage, consultant, main contractor, value, timeline/due date, source and Sales owner. Initial systems, scope summary and requirements are seeded from that source without duplicating its authority.
- A confirmed Bid/No-Bid decision is immutable. A second normal confirmation and an overwrite are rejected. A governed amendment requires the dedicated `tendering.bid-score.amend` permission and a reason, creates a new locked decision, and retains the original criteria, result, actor and supersession history.
- The Tender dashboard now presents the active qualification decision as confirmed and locked. Authorized users can open a clearly separated amendment form that is prefilled from the current decision and requires the business reason before a replacement is registered.
- Tender 360 remains below the working sections and opens non-anchor specialist workspaces through AURA tabs. BOQ is absent from the Tender dashboard and remains a separate workspace reached from the launcher.
- The two competing default-role catalogs are replaced by one 22-role ELV/MEP catalog shared by the access kernel and API seeder. It covers Sales, Pre-Sales, Estimation, Design, Site, Planning, Project Engineering/Management, Technical, Commercial, Procurement, Stores, QA/QC, HSE, Finance, T&C, Handover/FM, Executive, Admin and Client work.
- Migration 0310 moves grants from the eleven legacy role IDs to their canonical `r-*` IDs before removing the duplicate seeded rows. The live Auth-ON admin API reports no legacy role IDs.
- Every internal employee role now has the functional baseline for My Work, notifications, inbox, communication and authorized-document reads. Document ACL/aggregate authority and tenant/project scope still apply.
- The Roles & Access UI now starts with plain-language job, scope and approval-separation guidance, searchable role cards and recommended assignment scope. The technical permission grid is labelled as advanced configuration; project staff are directed to Project Team for project-scoped assignment.

## Browser evidence

Live PostgreSQL/browser execution on the direct Opportunity `Marina Bay ELV opportunity r0qtw4a` created and submitted Technical Study S-001. The saved revision reloaded with CCTV, LAN/access-control/fire-alarm interfaces, one canonical client requirement, acceptance criteria and technical response. It displayed `S-001 · in review`, all three technical preparation steps complete and the independent-review step pending.

The author session displayed no approval controls and stated that only `u-e2e-checker` could approve or return the study. A tender-route Opportunity was also checked: the direct editor was replaced with explicit Tender-route guidance.

The final Playwright pass created fresh PostgreSQL-backed Tender, Lead and direct Opportunity records and passed 4/4 scenarios. The Tender dashboard kept qualification first, removed BOQ, placed Tender 360 at the bottom and launched specialist workspaces through AURA tabs. The same scenario uploaded and versioned Tender evidence, saved and reloaded the structured study, selected an independent reviewer and submitted the study for review. The direct study evidence and Sales-input inheritance scenarios also passed. The fourth scenario signed in through a real `r-sales-manager` user, amended a locked Bid/No-Bid decision with a reason and reloaded the immutable history. A separate 1/1 browser proof verified the searchable role catalog, plain-language assignment guidance, Planning Engineer job description and project-scope recommendation.

## Automated evidence

| Proof | Result |
| --- | --- |
| J1 Auth-ON journey | 1/1 passed using canonical `r-sales`, `r-pre-sales`, `r-technical-manager` and `r-sales-manager`: automatic work receipt, complete canonical intake projection, unchanged Sales document ID/revision, inherited Pre-Sales/reviewer download, unrelated-role denial, Pre-Sales revision refusal, direct and Tender structured studies, foreign-Tender evidence refusal, canonical evidence metadata, independent approval, canonical study-to-scope lineage, quantity-spoof refusal and immutable Bid/No-Bid history |
| ELV/MEP role authorization contract | 29/29 passed: catalog shape and employee baseline plus Sales override, study maker-checker, planning acceptance, PO approval, quality decision, executive read-only and T&C/Handover boundaries |
| CRM intake DMS authorization contract | 4/4 passed: provider registration, Sales-owner edit, active Opportunity-team read/download, and refusal before conversion/outside team/across tenant/wrong aggregate |
| Tender-study DMS authorization contract | 4/4 passed: provider registration, functional study-read grant, wrong-permission/wrong-aggregate refusal and cross-tenant refusal |
| Live Auth-ON role registry | Migration 0310 applied; API `200`, all required canonical roles present, no legacy standard-role IDs remain |
| Technical-study and Scope Assist service tests | 11/11 passed |
| Tendering module regression | 108 passed / 12 skipped across 15 files; locked decision, governed history and concurrent-amend protection included |
| Wave 1 PostgreSQL browser UX | 4/4 passed: Tender dashboard/qualification/launcher plus persisted structured study, direct-study upload/version, Sales intake upload/version → converted-study inheritance, and a real Sales Manager qualification amendment |
| Role catalog browser UX | 1/1 passed: guidance, complete operating-role presence, search, job description and recommended assignment scope |
| Live PostgreSQL DMS proof | Migration 0309 current; evidence versions 1 and 2 uploaded, listed at current version 2 and downloaded with exact original bytes |
| CRM module regression | 434 passed / 37 skipped across 55 files in the last full run |
| Project Scope closure matrix | 69/69 passed, covering all 59 classified service assertions |
| Commissioning/Handover, DocControl and Engineering HTTP workflows | 3/3 passed |
| Repository typecheck | 51/51 tasks passed |
| API production build | Passed |
| Root production build | Passed after the final Tender-study and browser-proof changes |

## Wave 1 closure decision

Both previously open gates are now met:

1. The Tender path has persisted structured-study parity, canonical DMS evidence, independent review permissions and PostgreSQL browser save/reload/submit proof.
2. A representative `r-sales-manager` browser session completed the governed Bid/No-Bid amendment and reloaded its immutable history.

Wave 1 is therefore **CLOSED / VERIFIED for its bounded Sales-intake-to-governed-study scope**. This does not close J1 end to end: estimation, pricing, offer approval and submission remain in Wave 2. It does not change the frozen 180-leaf discovery totals or support a claim that AURA is functionally complete or Production Ready.

## Findings carried to Wave 2

- Legacy quotation creation still succeeds before an approved technical study.
- The generated customer quotation still collapses the approved 24-unit basis into one selling-price line.
- Reading quotation revisions from the leaf does not return the complete revision chain.
- Tender submission still does not enforce an approved structured study and internal offer approval as entry gates.

These are explicit open defects. They prevent a Sales → Pre-Sales → approved customer offer closure claim.
