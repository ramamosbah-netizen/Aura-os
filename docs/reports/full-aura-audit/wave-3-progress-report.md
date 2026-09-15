# Wave 3 Progress Report — Award to Connected Delivery

**State:** IN PROGRESS

**Evidence date:** 15 September 2026

**Starting point:** `a87657ad` on `main`

**Frozen discovery baseline:** 180 capability leaves and 46 reconciled gap records

## Iteration 1 — Frozen sold scope to delivery plan

The first Wave 3 slice closes the broken handoff between the immutable award basis and project delivery planning:

`final approved offer → signed contract → project handover snapshot → frozen sold item → WBS/CBS mapping → SOLD quantity ledger`

Project 360 now gives the Project Manager a clear action for assigning every frozen sold item to its delivery work package and optional cost code. The browser sends only the selected frozen item key and project delivery nodes. Projects reloads the persisted project and immutable handover snapshot, derives the handover, source kind, source record, final revision and source item, and refuses an unknown frozen item or a WBS/CBS node owned by another project.

After the canonical mapping is persisted, the transactional outbox publishes `projects.delivery_item_map.created`. The quantity subscriber validates the saved mapping against the frozen snapshot and posts the source-backed SOLD quantity and unit to the append-only project quantity ledger. The ledger's deterministic source key makes outbox retries idempotent.

## Closed register items

| Item | Previous state | Current state | Acceptance evidence |
| --- | --- | --- | --- |
| AWD-05 — Delivery item mapping | DISCONNECTED | COMPLETE | Project 360 create/reload; persisted canonical lineage; automatic SOLD projection |
| J2-02 — Mapping UI unavailable | WRONG_BEHAVIOR | CLOSED / VERIFIED | Auth-ON browser maps the final Tender item to a WBS node |
| J2-03 — SOLD projection missing | DISCONNECTED | CLOSED / VERIFIED | API journey and browser poll the quantity ledger to SOLD = frozen quantity |

## Iteration 2 — Project drawing to controlled conveyance

The next slice keeps the engineer inside the owning Project 360 while registering a shop drawing, then proves:

`project drawing → submit → review → approve → named recipient/purpose → transmitted drawing → sent DocControl transmittal → linked reference`

The transmit command now refuses a blank recipient or purpose at both the HTTP and service boundaries. The outbox reactor creates one transmittal using the full immutable drawing-revision identity, records recipient and purpose, advances the conveyance to `sent`, and links its reference back to the drawing. A replay resumes unfinished work and repairs a missing link; failures escape to the durable event handler for retry instead of being logged and discarded. The UI waits for this durable link before presenting completion.

The general DocControl screen now calls a manually created transmittal a draft and exposes the real Send → Record receipt → Acknowledge lifecycle. This removes the previous false label “Dispatch & Send” on an operation that only created a draft.

ENG-01, ENG-02 and ENG-05 remain **PARTIAL**: the browser and API prove the connected workflow, but governed file storage/versioning, independent maker-checker roles, exact register-item package linkage and recipient-role receipt remain open. ENG-06 remains open until assigned Site/Project/Procurement users receive an actionable release item.

## Iteration 3 — Project delivery responsibility to My Work

Project membership now remains an access grant, while operational responsibility is a separate persisted record. A Project Manager assigns a named project member, workstream, deliverable and due date in Project 360. That exact responsibility arrives in the assignee's My Work with project context and follows:

`Project Manager assigns work → named member/due/workstream → assignee My Work receipt → source Accept or My Work Start → Complete → retained project history`

The service derives project authority from the persisted responsibility, requires the assignee to hold a grant on that canonical project, and requires the matching functional permission for every transition. The UI reloads the saved assignment and its source history. This closes **AWD-06** for project team responsibility assignment and receipt.

The first Auth-ON browser run exposed a real discovery defect: a project-only member could not open `/work-items` because the route has no project identifier for the blanket guard. My Work is now a reviewed self-scoped discovery route that filters every returned item against its persisted project and rechecks the same scope before quick actions. Project membership still never grants functionality by itself.

ENG-06 remains open because a general `engineering_release` responsibility does not yet carry the canonical drawing/revision/transmittal reference and is not automatically produced by the governed release event.

## Iteration 4 — Construction drawing release to named delivery owner

An approved drawing issued **For Construction** now requires a named, open `engineering_release` responsibility in the drawing's canonical project. The public request can nominate only that responsibility identity; the controller reloads the persisted drawing and responsibility and refuses a missing receipt, a responsibility from another project, a completed responsibility or one already bound to another release.

The durable drawing event creates and sends the DocControl transmittal, links it back to the drawing, then attaches the exact drawing code, revision and transmittal reference to the responsibility. The assignee's My Work item opens the canonical Project Drawing 360 rather than a generic team page. The browser keeps the action busy until both the transmittal and delivery receipt are observable, so it does not present a half-completed release.

The source lookup is deliberately one-to-many: one issued drawing may have named Site, Project and Procurement recipients, while each responsibility remains immutable against reassignment to another source. The executed proof covers an Engineering assignee and an Auth-ON administrator browser journey. **ENG-06 is PARTIAL** until representative Site Engineer, Project Engineer and Procurement recipients independently receive and progress their records, and material-submittal release follows the same governed pattern.

## Iteration 5 — Schedule activity to canonical WBS package

Every new schedule activity now requires a persisted WBS node from the same tenant and project. The API does not accept the request project as ownership proof: ScheduleService reloads the WBS node, compares its persisted project, rejects missing or foreign nodes, and preserves an established link when a client omits it on an ordinary edit. It also refuses moving an activity to a different package after the link is established.

Migration 0315 stores `wbs_node_id` on the schedule-task row and adds a tenant/project/WBS composite foreign key with delete restriction. Existing pre-migration activities remain explicitly nullable and the Gantt labels them as legacy/unlinked rather than inventing a package.

The project schedule UI now requires a package before Create, filters the selector to the current project and displays the WBS code/title beneath the activity. Auth-ON browser proof created and reloaded `Install CCTV devices` under `1.1 · CCTV installation`; the HTTP proof separately returned 400 for a missing node and a node persisted in another project.

**PLN-01 moves from DISCONNECTED to PARTIAL.** WBS identity is now canonical through Domain → PostgreSQL → API → UI → browser reload. Employee/equipment requirements, cost and quantity-driven progress do not yet share that activity identity, so the capability is not COMPLETE.

## Iteration 6 — Activity resource demand from canonical registers

The planning desk now captures an authored working-day duration and any number of people/equipment demand lines while creating a WBS-linked activity. The selector reads a purpose-limited catalog from the HR, Fleet and Assets authorities and stores only the typed canonical reference, quantity and unit on the activity. The schedule displays the current authority label on every reload rather than copying an employee, vehicle or asset name into Projects.

The API catalog exposes only planning-safe fields. Before saving, the application-layer bridge resolves each employee, vehicle or asset against the authenticated tenant and returns 400 for an invented, deleted or cross-tenant id. It also refuses `pool` until the governed team/resource-pool register exists, so a free-text team cannot silently become planning truth.

Auth-ON browser proof created `Install CCTV devices` with three authored working days, two people from HR and one Fluke tester from Assets; reload and the schedule API returned the same requirements. The same journey first submitted a fabricated employee UUID and received 400. It then reopened the established activity, changed employee demand from two to three, saved and reloaded it, and proved the task and employee-requirement ids were unchanged. The edit preserves the established WBS link plus any baseline and actual dates rather than recreating delivery identity.

**PLN-06 moves from BACKEND_ONLY to PARTIAL.** Activity demand is connected through owning register → safe catalog → create/edit UI → API validation → task requirement persistence → solver input. Team pools, held allocation/bookings, availability integration and My Work receipts remain open.

## Iteration 7 — Governed shared resource pools and capacity

Planning now exposes the existing tenant-wide resource-pool and capacity authorities as a working Technical Manager desk. The manager can register an internal team or subcontract capacity source, select its fixed measurement unit, and publish dated capacity windows. Project schedules consume the same pool through their project-context resource catalog:

`tenant resource pool → dated capacity → project schedule catalog → WBS activity demand`

The pool remains organization-scoped because one delivery team may serve several projects. Project membership does not grant pool administration: the controller requires the explicit `projects.resource-pool.*` or `projects.resource-capacity.*` functional permission, while a project-scoped planner sees only the planning-safe pool reference through `projects.schedule.read` on the requested project.

The measurement unit is canonical. Capacity and schedule demand must use the persisted pool unit, so request data cannot reinterpret a crew pool as hours or units. Tenant filters prevent another organization's resource from being resolved. Internal pools discard an injected supplier id; subcontract pools require a supplier reloaded from the same tenant's approved subcontractor register, and the UI presents that register as a selector instead of asking the manager to type an id. The Auth-ON browser registered a unique ELV installation crew, added `2 crews` of dated capacity, received HTTP 409 for a forged `hours` capacity request, selected the pool on a WBS activity, and reloaded `1 crews` against the same pool identity. It also retained the previously proved employee and asset references through activity edit.

**PLN-09 moves from BACKEND_ONLY to PARTIAL.** The capacity source is now governed and visible, but activity demand still does not create held bookings. HR/Fleet availability, cross-project conflict decisions, named allocation and My Work receipts remain open.

## Iteration 8 — Activity demand to held capacity commitment

The planner can now promote one persisted activity requirement into a held resource commitment without re-entering the resource, unit, quantity or dates:

`WBS activity demand → canonical requirement lineage → held booking → current cross-project feasibility → reasoned release history`

The public command accepts only the requirement identity and an optional capacity-exception reason. ResourceBookingService reloads the project schedule and derives the schedule, task, resource, unit, quantity and date range from that persisted requirement. A requirement from another project is refused, and migration 0316 adds a composite requirement foreign key plus one-held-booking-per-requirement protection. Unknown request fields cannot move the commitment to another resource, date or project.

Current feasibility remains derived rather than stored. The booking keeps the capacity/demand snapshot that was true when committed, while each read recomputes the present load from all held bookings for the same tenant resource. An over-capacity commitment is permitted only with an explicit reason, and release retains its own mandatory reason and actor history. The project planning UI separates authored demand from held commitments and shows AVAILABLE, CONFLICTED, UNKNOWN or RELEASED with the cross-project conflict count.

Auth-ON browser and API proof used one shared ELV crew with capacity `2 crews`. Project A held one crew and Project B attempted to hold two over the same three days. The silent overrun was denied; a reason-governed commitment succeeded and both projects appeared in the conflict report. Releasing Project B returned Project A to AVAILABLE. The same proof injected a false resource, quantity, unit, dates and project in the request; the stored booking still matched the employee requirement’s canonical values. A Planning Engineer could create only on the granted project, changing the URL to another project was denied, Site Engineer membership did not grant create, and the organization-governed grant remained allowed.

**PLN-07 moves from BACKEND_ONLY to PARTIAL.** Named employee demand can now be held as a booking. Employee records currently have no canonical User identity relation, so the system cannot safely deliver that booking to the employee’s My Work. **PLN-06 and PLN-09 remain PARTIAL** until HR/Fleet availability, the named conflict-owner workflow and My Work receipt are connected.

## Security and authority proof

| Risk | Proof |
| --- | --- |
| Caller nominates another handover/source/revision | Public DTO and BFF do not accept source lineage; service derives it from the project's immutable handover |
| Caller maps an item that is absent from the award | Service rejects an unknown `frozenItemKey` |
| Caller maps into another project's plan | Service validates persisted WBS/CBS ownership against the project |
| Caller replays or forges source fields | Browser API replay with forged source values returns the same canonical mapping and source identity |
| Outbox redelivery duplicates SOLD | Quantity-ledger dedupe key is based on the delivery mapping id; subscriber retry proof remains idempotent |
| Project membership replaces functional permission | Existing Projects controller permission and Project Scope guard remain active; the browser proof runs Auth-ON |
| Caller changes the project in the responsibility URL | The service compares the URL project with the responsibility's persisted project and denies the mismatch |
| Project member lacks the functional permission | Auth-ON HTTP proof denies create/update even when the actor has membership on the canonical project |
| Another user tries to progress the assignment | Accept/Start/Complete require the persisted assignee identity and deny the wrong actor |
| Tenant-wide My Work discovery leaks project items | Every discovered item is filtered with `work-items.work-item.read` against its persisted project before it is returned |
| For Construction is issued without an internal owner | Service boundary refuses the transition unless `responsibilityId` is present |
| Caller nominates another project's responsibility | Controller reloads drawing and responsibility and rejects persisted project mismatch before transmission |
| Caller reuses an old receipt for a new drawing | Controller and service reject a responsibility already linked to another canonical drawing |
| UI reports success before the delivery receipt exists | Browser polls both drawing transmittal and responsibility lineage before refresh |
| Caller omits a work package for a new activity | Schedule service returns 400; the UI explains that a WBS package is required |
| Caller supplies another project's WBS node | Service reloads persisted WBS ownership and returns 400; the database also enforces the composite lineage |
| Edit silently drops or moves an established activity package | Missing input preserves the stored link; a different node is refused |
| Caller invents an employee/equipment id | The API reloads the authenticated tenant's HR/Fleet/Assets catalogs and returns 400 before schedule persistence |
| Projects copies names from owning registers | The task stores only typed ids; the current label is read through the safe planning catalog on render |
| Planner edits demand by replacing the activity or requirement | Browser/API proof changes the quantity while retaining the persisted task and requirement ids, WBS link, baseline and actual fields |
| Caller invents or reinterprets a shared pool | The catalog reloads the tenant-owned pool and both capacity and schedule services enforce its persisted measurement unit |
| Caller forges a subcontract pool supplier | The controller reloads the same-tenant supplier and accepts only an approved supplier classified as subcontractor; internal pools discard request supplier ids |
| Project member attempts tenant pool administration | Pool/capacity routes require separate organization-governed functional permissions; Technical Manager grant and Planning Engineer denial are pinned in role fitness proof |
| Caller changes resource, quantity, unit, dates or project while committing | The DTO strips those fields and the service derives every booking fact from the persisted same-project activity requirement |
| Caller nominates another project’s requirement | Service resolves the requirement only inside the persisted schedule identified by the authorized URL project and returns 400 |
| Shared demand silently exceeds known capacity | Domain and database both require a non-blank exception reason; Auth-ON proof denies the silent overrun |
| Project membership replaces booking functionality | Planning Engineer create is allowed on its granted project; Site Engineer membership receives 403 for create; changing the URL project receives 403 |

## Verification completed

| Check | Result |
| --- | ---: |
| Projects mapping/quantity domain tests | 23/23 passed |
| Quantity subscriber tests | 2/2 passed |
| J2–J6 delivery API journey | 1/1 passed |
| Quantity-ledger HTTP journey | 4/4 passed after replacing its obsolete direct-BOQ fixture with governed study/QTO/estimate prerequisites |
| PostgreSQL certification persistence | 1/1 passed; automatic SOLD, install and certification facts reconcile |
| Project Scope service closure | 69/69 passed, including the 59 classified assertions |
| Wave 2 + Wave 3 bridge browser journey | 2/2 passed in Chromium |
| Web unit suite | 203/203 passed |
| Repository typecheck | 51/51 passed |
| Repository production build | 27/27 passed, including Next.js and Nest builds |
| Register reconciliation | 180 capabilities / 46 gap records / 999 role pairs / 938 journey pairs |
| Engineering drawing API journey | 1/1 passed; missing recipient denied and resulting conveyance is sent with purpose |
| Drawing transmittal reactor | 3/3 passed; create/send/link, replay repair and failure retry |
| Project drawing browser journey | 1/1 passed in Chromium; project registration through sent transmittal and linked delivery receipt |
| Database migration posture | 316/316 applied; bookings now carry same-project schedule/task/requirement lineage and one held booking per requirement |
| Full API unit/fitness suite | 498 passed / 4 skipped |
| Project responsibility domain | 4/4 passed; canonical assignee grant, transition authority, idempotent source binding and concurrent-source refusal covered |
| Engineering/responsibility HTTP journeys | 5/5 passed; lifecycle plus missing/wrong-project delivery owner denial and exact My Work receipt |
| Project responsibility HTTP journey | 4/4 passed; positive handoff and release plus wrong-project/wrong-user/wrong-permission denials |
| My Work service and self-scoped fitness | 15/15 passed, including per-item project filtering |
| Project responsibility browser journey | 1/1 passed in Chromium; manager UI assignment → member My Work → Start/Complete → retained history |
| Full Projects module suite | 439 passed / 12 PostgreSQL-only skips |
| Schedule WBS domain/service proof | 2/2 passed; required, wrong-project, persisted, edit-preserved and immutable-link cases covered |
| Schedule WBS Auth-ON HTTP proof | missing 400; foreign-project 400; canonical create 201; GET returned the same WBS id |
| Schedule WBS browser journey | 1/1 passed in Chromium; required selector, project filtering, create/reload and visible package identity |
| Schedule resource catalog service | 2/2 passed; safe display projection plus canonical/invented/cross-tenant reference and pool-unit decisions |
| Resourced activity Auth-ON browser journey | 1/1 passed in Chromium; fabricated id denied, HR employee + Assets equipment + governed pool selected, duration/demand persisted and reloaded |
| Resource-pool/capacity domain service | 2/2 passed; tenant filtering, canonical unit enforcement and invalid date windows covered |
| Resource pool role fitness | 22/22 passed; Technical Manager can govern pools/capacity and Planning Engineer cannot acquire those operations from project membership |
| Shared-pool Auth-ON browser journey | 1/1 passed in Chromium; pool/capacity authored, wrong unit denied with 409, canonical pool demand persisted and reloaded |
| Pool supplier provenance Auth-ON API | forged subcontractor source denied with 400; injected source on an internal pool discarded |
| Resource booking service | 4/4 passed; canonical derivation, shared in-memory facts, duplicate refusal, cross-project over-capacity reason and retained release history |
| Resource booking Auth-ON browser/API journey | 1/1 passed; request spoof ignored, foreign requirement denied, silent overrun denied, two-project conflict visible, release restored availability, history retained |
| Resource booking scope/function matrix | correct project + Planning Engineer create 201; changed project URL 403; correct project + Site Engineer create 403; organization-governed read 200 |

## Remaining Wave 3 gate

Wave 3 remains open. The next bounded slices must still prove:

1. Governed engineering file storage, material-submittal/register-item lineage and representative receipt by assigned Site/Project/Procurement roles.
2. HR/Fleet availability, named conflict-resolution ownership, Employee-to-User identity and My Work handoff from the now-booked WBS demand.
3. Milestone, baseline, quantity-driven progress, cost, look-ahead, delay/recovery and forecast evidence from the connected plan.

## Programme state

- **Wave 0 — CLOSED / VERIFIED**
- **Wave 1 — CLOSED / VERIFIED**
- **Wave 2 — CLOSED / VERIFIED**
- **Wave 3 — IN PROGRESS**
- **AURA overall — still OPEN / NOT Functionally Complete / NOT Production Ready**
