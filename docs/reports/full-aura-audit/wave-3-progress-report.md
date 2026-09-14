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

Auth-ON browser proof created `Install CCTV devices` with three authored working days, two people from HR and one Fluke tester from Assets; reload and the schedule API returned the same requirements. The same journey first submitted a fabricated employee UUID and received 400.

**PLN-06 moves from BACKEND_ONLY to PARTIAL.** New-activity demand is connected through owning register → safe catalog → UI → API validation → task requirement persistence → solver input. Existing-activity demand editing, team pools, held allocation/bookings, availability integration and My Work receipts remain open.

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
| Caller submits an ungoverned free-text team | `pool` is refused until the canonical resource-pool register is connected |

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
| Database migration posture | 315/315 applied; schedule activities now carry a same-project WBS foreign key |
| Full API unit/fitness suite | 497 passed / 4 skipped |
| Project responsibility domain | 4/4 passed; canonical assignee grant, transition authority, idempotent source binding and concurrent-source refusal covered |
| Engineering/responsibility HTTP journeys | 5/5 passed; lifecycle plus missing/wrong-project delivery owner denial and exact My Work receipt |
| Project responsibility HTTP journey | 4/4 passed; positive handoff and release plus wrong-project/wrong-user/wrong-permission denials |
| My Work service and self-scoped fitness | 15/15 passed, including per-item project filtering |
| Project responsibility browser journey | 1/1 passed in Chromium; manager UI assignment → member My Work → Start/Complete → retained history |
| Full Projects module suite | 433 passed / 12 PostgreSQL-only skips |
| Schedule WBS domain/service proof | 2/2 passed; required, wrong-project, persisted, edit-preserved and immutable-link cases covered |
| Schedule WBS Auth-ON HTTP proof | missing 400; foreign-project 400; canonical create 201; GET returned the same WBS id |
| Schedule WBS browser journey | 1/1 passed in Chromium; required selector, project filtering, create/reload and visible package identity |
| Schedule resource catalog service | 2/2 passed; safe display projection plus canonical/invented/pool reference decisions |
| Resourced activity Auth-ON browser journey | 1/1 passed in Chromium; fabricated id denied, HR employee + Assets equipment selected, duration/demand persisted and reloaded |

## Remaining Wave 3 gate

Wave 3 remains open. The next bounded slices must still prove:

1. Governed engineering file storage, material-submittal/register-item lineage and representative receipt by assigned Site/Project/Procurement roles.
2. Governed team pools plus employee/equipment booking, availability, conflict resolution and My Work handoff from the WBS-linked demand.
3. Milestone, baseline, quantity-driven progress, cost, look-ahead, delay/recovery and forecast evidence from the connected plan.

## Programme state

- **Wave 0 — CLOSED / VERIFIED**
- **Wave 1 — CLOSED / VERIFIED**
- **Wave 2 — CLOSED / VERIFIED**
- **Wave 3 — IN PROGRESS**
- **AURA overall — still OPEN / NOT Functionally Complete / NOT Production Ready**
