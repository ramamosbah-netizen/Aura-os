# AURA — business capability depth audit

**Work-order update:** The user has replaced remediation-first sequencing with [J1: Enquiry to Approved Offer](2026-09-13-j1-enquiry-to-approved-offer.md). General redesign and Procurement remediation are paused. Findings below remain open and preserved; their severity is unchanged. The work-package order below is historical, not the current execution order.

13 September 2026 · Current working tree · **Remediation required; whole-system verification remains open.**

## Decision

AURA has substantial working foundations, but does not yet provide a consistently dependable ELV/MEP operating journey. The next work should begin with transaction controls and record integrity, then complete the business workflows, then simplify their presentation. A broad visual redesign alone would leave confirmed defects underneath it.

This audit extends the [initial workflow review](2026-09-13-full-system-elv-mep-workflow-review.md). It inspected the 21 business-module areas, selected domain models and event handovers, ran the repository test pipeline and 20 representative HTTP suites, and performed an isolated authenticated procurement probe. Live browser inspection was sampled, principally tendering and procurement; it was not a walkthrough of every role and page. Unit tests, HTTP tests, source inspection and browser observations are distinguished below. Existing live business records were not changed by the audit probes.

## Evidence and limits

| Evidence | Result | Meaning |
| --- | --- | --- |
| Repository `pnpm test --concurrency=2` | 51/51 tasks successful; 47 cached | Existing automated baseline passes. Cached results and skipped database tests are not fresh live-system proof. |
| Final selected in-memory HTTP run | 18/20 files passed; 109 tests passed, 2 failed | Broad workflow sample, principally Auth-OFF; not permission proof. |
| Auth-ON procurement characterization | Auth enabled; normal approval 403, general status approval 200 for the same edit-only actor | Confirmed functional-authorization bypass. |
| Quantity-ledger HTTP case | Fails after issue 20 and return 5: net 15 never appears | Reproduced business-record defect with source-level cause identified. |
| Legacy commissioning handover HTTP case | 409 when attempting to set evidence-derived checklist flags manually | Obsolete fixture assumption; replace with canonical evidence fixtures, not relaxed business rules. |
| PostgreSQL certification suite | Could not initialize without its database prerequisite | Excluded from final in-memory totals; persisted certification proof remains pending in this audit. |

The initial 21-file run had additional failures caused by five tests using nonexistent project IDs. Engineering, DocControl, Site, Quality and HSE fixtures now create real projects before their workflows. Their business expectations and canonical-project validation were retained. All five pass in the final run.

Reproduction evidence: `.aura-depth-unit.log`, `.aura-depth-final-api.log`, `.aura-depth-probes-auth.log` in the workspace. The [isolated probe](../../apps/api/test/depth-audit-probe.e2e-spec.ts) captures observations; its passing status is not an assertion that the observed behavior is acceptable. The in-memory test configuration does not exercise PostgreSQL persistence, deployment or recovery.

## Confirmed gaps, in delivery order

### 1. Purchase-order approval can be bypassed — critical

The [controller](../../apps/api/src/procurement/procurement.controller.ts) exposes PATCH `purchase-orders/:id/status` under `procurement.po.update`, while the normal approval route requires approval permission. [PurchaseOrderService.changeStatus](../../modules/procurement/src/purchase-order.service.ts) accepts `approved` without going through the approval control.

The Auth-ON probe used an actor with only `procurement.po.update` and `procurement.po.view`. Normal approval returned 403; setting the same order's status to `approved` returned 200. This is a demonstrated defect, not a hypothetical role concern. The normal route also accepts a caller-provided `approverLevel`; its authority must be resolved from the actor's governed approval rights, not trusted merely because it is numeric.

**Required:** one governed transition policy shared by every entry point; protected approval transitions; actor-derived approval authority; Auth-ON tests for edit-only, insufficient authority, authorized approval and invalid transitions. This functional-control gap is separate from the earlier bounded 59-assertion project-scope inventory.

### 2. Distinct material movements can be discarded as duplicates — critical

[StockService](../../modules/inventory/src/stock.service.ts) publishes stock movements using the stock item's ID as the event aggregate ID. The quantity subscriber in [cross-module-subscriber.ts](../../apps/api/src/events/cross-module-subscriber.ts), around lines 1460–1488, uses that aggregate ID for `movementId` and `stock-movement:` deduplication. Different movements of the same item therefore collide. The nearby material-cost subscriber already uses the unique event ID, illustrating the intended distinction.

The existing [quantity ledger HTTP test](../../apps/api/test/quantity-ledger.e2e-spec.ts) reproduces the problem: issue 20, return 5, expected net issued 15; the ledger does not reach that result.

**Required:** deduplicate by an immutable individual movement/event identity, preserving replay safety. Prove multiple movements of the same item, returns, retries and project isolation. Assess affected historical records before any reconciliation or backfill. Preserve quantity/progress/certification meanings.

### 3. Receipt status does not express partial fulfillment — high

The GRN subscriber around lines 1305–1317 unconditionally changes a linked PO to `received`. The isolated probe ordered 100 units, received 1 and observed `received`.

**Required:** agree the meaning of received versus fully received; derive line and order balances from canonical receipts; expose partial receipt and outstanding quantities. Do not infer fulfillment from the existence of a GRN alone.

### 4. Supplier validation differs between creation and editing — high

[PurchaseOrderService](../../modules/procurement/src/purchase-order.service.ts) validates a supplied supplier ID on create, but spreads supplier edits without the same validation. Updating to `missing-supplier` returned 200 and retained the nonexistent ID in the probe.

**Required:** validate canonical supplier existence, tenant and applicable approval state on changes; define permitted changes after issuance. This finding concerns supplier-bound records, not a blanket claim that every legitimate overhead purchase must use a supplier master.

### 5. Procurement entry is shallower than its downstream promises — high

The live PO drawer and [po-create.tsx](../../apps/web/components/po-create.tsx) collect header title, reference, value, project and free-text supplier. The PO domain is primarily a header-value record, with singular BOQ/CBS associations rather than a complete purchasing-line workflow.

The drawer says linking a project posts committed cost, but the subscriber requires both project and CBS coding; the drawer does not provide CBS selection. The standard entry journey therefore cannot satisfy the described cost-posting prerequisites by itself.

**Required:** connect approved requisition, technical requirements, supplier selection, purchasing lines, project cost coding and receipt balances. Make the UI describe actual posting conditions. Validate with a multi-line project purchase and partial deliveries, not only a header CRUD test.

### 6. Tender documents are available; structured study is incomplete — high

Recent tender changes provide categories for drawings, specifications, client requirements, scope summaries, system identification, government requirements, site information and study notes, with canonical DMS-linked files. That is a useful register, but it does not itself create a requirement/compliance assessment with source clause, system, responsible reviewer, response, deviation and sign-off.

CRM already has a [solution-scope domain](../../modules/crm/src/domain/solution-scope.ts). Reuse and connect appropriate concepts across direct enquiries and tenders instead of adding another disconnected requirements store. The tender technical launcher currently enters the general engineering area; it needs a contextual pre-award destination or a clear contextual handoff.

**Required:** enquiry/tender → study inputs → systems and requirements → technical assessment → clarifications and deviations → controlled study decision → estimation. Maintain separate ownership of technical, pricing and document records.

### 7. Project context supports ELV more clearly than MEP — high

The [project selector](../../apps/web/lib/project-scope.ts) contains eight ELV systems and is used by [ProjectShell](../../apps/web/components/project-shell.tsx). The [shared discipline model](../../shared/src/dimensions/discipline.ts) contains mechanical, electrical, plumbing, HVAC and firefighting disciplines as well.

**Required:** define discipline, system, location and asset relationships for actual ELV and MEP projects. Provide appropriate project lenses without relabeling device identifiers or forcing every discipline into an ELV model. Prove one representative ELV job and one MEP job through the same operational stages.

### 8. HR calculation policy needs applicability review — high

[EOSB calculation](../../modules/hr/src/domain/eosb.ts) explicitly implements classic unlimited-contract resignation reductions, and the [screen](../../apps/web/app/hr/eosb/page.tsx) presents that basis without a regime/effective-date selection. Passing calculation tests only verifies the encoded policy.

Current official guidance describes the applicable full-time foreign private-sector benefit using 21 days for the first five years and 30 thereafter. The legacy resignation-reduction assumption needs reconciliation with the employee's applicable regime and dates before operational reliance. This is a policy-applicability finding, not an individual entitlement calculation. See [UAE Government guidance](https://u.ae/en/information-and-services/jobs/employment-in-the-private-sector/end-of-service-benefits-for-employees-in-the-private-sector) and [MoHRE worker rights](https://taqyeem.mohre.gov.ae/en/media-center/Awareness-and-Guidance/workers-rights.aspx?DisableResponsive=1).

### 9. Some dashboards can overstate completeness — medium

The procurement overview reduces a fetched PO list to totals while the listing endpoint caps results; the displayed spend also needs an explicit status definition. Server aggregates should establish actual totals rather than representing a limited list as the whole portfolio.

The three-way-match page uses an empty-array fallback for an unavailable result. Distinguish a verified empty register from failed loading. This is a source finding; no outage was induced in the live application. Other screens already distinguish unavailable data, so the correction should be targeted.

### 10. Navigation needs business-stage continuity — high usability priority

The [suite registry](../../apps/web/lib/suites.ts), [home launcher](../../apps/web/components/aura-home-grid.tsx) and [My Work](../../apps/web/components/my-work-dashboard.tsx) provide foundations. Extend them around assigned actions, responsible person, current job, prerequisites and next step. Preserve the user's tender dashboard and launcher approach, while ensuring destinations retain the tender/project identity.

Do not rebuild task management or every specialist module. Make existing records reachable from the work that requires them, with one canonical owner and visible handoff status.

## Coverage by business area

“HTTP” below means the selected in-memory workflow sample, not exhaustive behavior or PostgreSQL/Auth-ON coverage. Module unit suites ran through the repository pipeline, often from cache. A module is not labeled missing because an untested workflow was not observed.

| Module | Existing capability/evidence sampled | Depth conclusion and next validation |
| --- | --- | --- |
| CRM | Stage gates, lifecycle, quotation pricing HTTP; solution-scope source | Working foundation; connect direct enquiry study to technical and commercial execution. |
| Tendering | Lifecycle, pricing governance, submission HTTP; dashboard and recent study/decision work | Files and locked decision exist; structured technical study and contextual launch remain incomplete. |
| Contracts | Cross-module chains and contract-cap HTTP; domain unit tests | Preserve governed award/signing handover; validate complete approved baseline and change lifecycle with users. |
| Projects | Quantity/cost HTTP, shared chains; extensive unit coverage | Quantity integration defect blocks broad confidence; MEP context needs mapping. |
| Engineering | Drawing workflow HTTP now passes with real project fixture | Core workflow exists; pre-award context and requirement-to-deliverable traceability need acceptance. |
| DocControl | Document workflow HTTP now passes | Preserve canonical ownership; verify revisions, submission evidence and contextual access in real roles. |
| Procurement | Live overview/drawer; source; Auth-ON probe | Confirmed approval bypass, invalid supplier edit and shallow receipt/cost-coding journey. |
| Inventory | Quantity/cost chains; domain units | Movement identity defect; validate partial receipts, returns and reconciliation. |
| Site | Execution workflow HTTP now passes | Foundation exists; verify daily reporting against approved work, material availability and actual site roles. |
| Quality | NCR workflow HTTP now passes | Verify inspection/NCR closure evidence and links into commissioning without duplicate quantities. |
| HSE | Permit workflow HTTP now passes | Validate field issue/expiry/closure and responsible-role experience. |
| Commissioning | Unit suites; old handover HTTP fixture fails governed evidence check | Replace obsolete fixture through canonical evidence; do not reopen T&C/Handover semantics. |
| Subcontracts | Domain units/source | Full instruction, valuation, retention and payment journey not freshly proved by HTTP/browser here. |
| Finance | Cost and AR cap HTTP; domain units | Persisted certification suite pending; complete purchase-to-pay and certify-to-collect acceptance required. |
| Assets | Combined asset/AMC/fleet HTTP sample; units | Existing disposal/maintenance controls; validate actual handover asset data and maintenance use. |
| AMC | Combined workflow HTTP sample; units | Contract-linked service foundations; field dispatch-to-close/SLA experience not fully browser-proved. |
| Fleet | Combined workflow HTTP sample; units | Maintenance/fine workflows sampled; operational scheduling and expense experience need role acceptance. |
| HR | Unit/source review | Calculation applicability concern; payroll/attendance/leave end-to-end not freshly proved here. |
| Compliance | 20 HTTP tests plus units | Registry/control foundations; authority content and project applicability require configuration, not invented rules. |
| ELV | Device HTTP and unit tests | Device model exists; do not confuse device integration with complete engineering/system study. |
| Market intelligence | Unit/source sample | Live provider operation, freshness and decision quality not verified. |

Cross-cutting: My Work had five HTTP tests covering task/reminder behavior and isolation. DMS underpins study evidence; full production storage, recovery and every access combination were not retested. AI output quality and live integrations remain unverified by this audit.

## What to do now

### Work package 1 — transaction correctness

Fix findings 1–4 first, with focused failing-then-passing regression tests. Derive approval authority from governed actor rights. Correct quantity movement identity while preserving retry safety. Define and implement partial fulfillment. Apply supplier validation consistently. Then rerun affected Auth-ON tests, the broad HTTP sample, unit/typecheck/build, and PostgreSQL integration proof in an isolated database. Review historical impact before any data repair.

Exit: edit permission cannot approve; legitimate approval succeeds; repeated distinct movements are all counted once; replay adds nothing; partial receipts show remaining balances; invalid/cross-tenant supplier mutations fail. No unresolved known integrity failures in these paths.

### Work package 2 — one complete ELV and one complete MEP journey

Connect existing capabilities through enquiry → study → bid decision → estimate/quotation → award/contract → project baseline → procurement → delivery → site execution → inspection → commissioning/handover → certification/payment → maintenance. Include a direct enquiry and a tender, a technical deviation, a partial delivery and an approved variation. Complete missing study and procurement steps encountered in those journeys. Use realistic isolated fixtures, separate from the working company.

Exit: every handoff has an owner, canonical source record, prerequisite, next action and traceable evidence. The same data is not re-entered into competing records. Specialist ownership and business semantics stay intact.

### Work package 3 — role-based usability

Give sales, pre-sales, project managers, procurement, site teams and finance their relevant assigned work and project/tender dashboard. Keep AURA launchers for opening specialist workspaces. Show status, blockers, responsibility and next action in plain language. Add contextual explanations where users score or make decisions, and make confirmed decisions read-only through the service as well as the screen.

Exit: representatives can complete the two journeys without needing to know internal module names; destinations preserve job context; unavailable data is not shown as empty; totals are complete and defined. Record observed user acceptance separately from automated test results.

## Status

The deeper audit is complete at the stated scope. It produced reproducible defects and a concrete order of work; the remedies above are not claimed implemented. The five project fixtures were repaired and an isolated audit probe added. The prior bounded project-scope closure does not certify purchasing approvals, accounting correctness, legal policy, complete business usability or production readiness. **Whole-system acceptance remains open.**
