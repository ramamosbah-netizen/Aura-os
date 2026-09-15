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

## Iteration 9 — Installed quantity to the number on the plan

A percentage on a programme was never one fact. It was one of three wearing the same clothes, and
the plan screen could not tell a reader which one they were looking at:

`approved installed quantity → Quantity Ledger → WBS work package progress → schedule activity progress`

Three states are now kept apart by name. **Evidence** is the work package's measured progress,
derived through the Quantity Ledger from what site actually installed against the frozen sold item.
**Override** is somebody stating a different figure against that measurement, with a reason and a
name — permitted, because a site can genuinely be ahead of what has been measured, but never
silent. **Declared** is a plain number where no measurement exists at all: exactly what every
activity has carried until now, unchanged in behaviour and now labelled rather than passing for
measurement.

`progress` is DERIVED on every read and stored nowhere. A copy on the activity would be correct as
of the last refresh, which is the same defect as a stored feasibility verdict (§22). An override
only exists where evidence does: without a measurement a number overrides nothing, and calling it
an override would put a reason and a signature on what is really just a typed figure. Reading the
plan costs one work-package query per project rather than one per activity.

An override is its own write path with its own permission, `projects.schedule.progress-override`.
Authoring a programme and claiming progress the site has not measured are different acts: a Planning
Engineer holds `projects.schedule.plan` and not this; a Project Manager holds both. Saving a plan
can neither mint a statement nor drop one — the four override fields are resolved from the persisted
activity and ignored off the payload, closing a hole where `POST /projects/schedules` would have
written a reasoned, attributed override with no permission check at all.

Every surface that shows an activity's progress now reads the same resolved figure through one
helper: the Gantt (which also says the source under each bar and replaces the plain box with a
reason-bearing control wherever something is measured), the plan screen's own headline, the
operations overview, the site workspace's "Actual Progress" panel and in-progress count, and the
Project 360 activity table, which gained a Source column. While wiring that last one it emerged that
360's schedule panel had never rendered at all — its BFF route had no `GET` — and that the
`?projectId=` every caller was sending was ignored by the API, so a reader taking the first row was
reading whichever plan came back first. Both are closed.

Auth-ON browser and API proof walked the real chain: a governed award (independently approved study,
take-off, offer and award by a Technical Manager and a Sales Manager) produced a project with a
frozen sold item of 200 m², mapped to a work package, beside a second package with nothing mapped to
it. With nothing installed, one activity read `0` as a measurement and the other `0` as a
declaration, each labelled. Installing 150 m² moved the first bar to 75% with nobody opening the
programme. A plan save typing 10% over it did not move the reported figure; the same edit on the
unmeasured activity was honoured. A statement of 90% was refused without a reason and accepted with
one, rendering as "Stated 90% against a measured 75%" — both numbers visible, the stored
`percentComplete` still 10. Withdrawing it returned the bar to the measurement, and a further 50 m²
took it to 100%.

**PLN-12 moves from DISCONNECTED to COMPLETE**, reconciled below. **PLN-11 remains
DISCONNECTED**: planned quantities and productivity are a separate capability, and nothing here
touches them.

## Iteration 10 — The rate the work was priced at

Iteration 9 made an activity's progress a measured fact. This answers the question that only
becomes askable once it is: measured against WHAT? A bar at 60% is neither late nor early on its
own — it is late against a quantity somebody sold, a rate somebody priced, and dates somebody
planned.

`estimate resource sheet → AWARD (frozen at handover) → work package → activity`, with the Quantity
Ledger supplying what was actually installed.

The company prices every line at a productivity — so many technicians, so many hours — and until
now that commitment stopped at the tender. Delivery never saw the rate the work was sold at, so a
planner either guessed it or retyped it from a spreadsheet, and "behind" had nothing to be behind
OF. The handover envelope has carried an item-level evidence slot since B2 and it was never
populated; it is now. At handover the accepted line's rate build-up is read once and its manpower
sheet normalised to ONE unit — crew size, man-hours per unit, crew-hours per unit — so a later
revision selling a different quantity cannot distort it.

**It carries no money.** Hourly rates, margin and every amount stay behind
`tendering.internal-pricing.access`. How long work takes is a physical fact about the work; what it
costs is a commercial one, and freezing the second would have put the cost sheet inside every
project anyone can open. Delivery therefore reaches back into Tendering for nothing at all — the
basis is copied by value like every other award fact, exactly as the frozen sold quantity is.

On the read, an activity resolves four facts and compares them: the sold quantity, the priced rate,
the installed quantity, and how much of its own planned window has been used. It reports the pace
the work is going at against the pace it was sold at, and — when it is losing ground — the rate it
would now take to still finish inside the window. All of it is derived per read and stored nowhere;
a stored "behind" would be behind as of the last refresh, which is the defect §22 keeps out.

UNKNOWN is neither zero nor "on rate". A package with no award line behind it, an award captured
before the basis was frozen, a supply-only or subcontracted line that priced no crew, an activity
with no usable window, a window that has not opened yet — each comes back UNKNOWN carrying its
reason, while every fact that IS known is still reported beside it. Reporting an unpriced package
as on rate would be the system agreeing with a plan it cannot check.

The plan screen shows what was sold against what is in, the pace against the priced pace, and a
headline count of the activities losing ground — a plan can be 60% complete and losing ground every
day, and a completion percentage cannot carry that. An activity with no award line behind it stays
silent rather than printing "unknown" under every bar, which is how a reader learns to stop reading
the ones that matter.

Auth-ON browser and API proof used a governed award priced at 2 technicians × 100 hours for 200 m²
(16 m²/day). The frozen basis carried crew and hours and no key matching rate, cost, price, amount,
margin or profit. The activity read 200 m² and 16/day with nothing entered. Sixty square metres
installed ten days into a twenty-day window read BEHIND at 6/day against the 160 expected, naming
the 14/day now needed; catching up to 160 read ON_RATE and the headline cleared. A package with no
award line read UNKNOWN and the screen stayed silent about it. A supply-only line read UNKNOWN —
"no crew was priced" — while still reporting what was sold and installed. No rate, quantity or
verdict appears anywhere on the stored activity.

**PLN-11 moves from DISCONNECTED to PARTIAL, and deliberately not to COMPLETE**; the reconciliation
below says what is still missing and why it is not a rounding decision.

## Iteration 11 — The hours the work actually cost

Iteration 10 answered half of productivity: the pace. A crew installing 6 m² a day against 16
priced is losing ground, and quantities and dates alone can say so. They cannot say whether those
6 metres took the priced hours or three times them — and a crew can be behind the programme and
perfectly efficient (too few people), or exactly on rate and ruinous (far too many). That second
failure was invisible.

It was invisible because a labour allocation recorded a PROJECT and a TRADE — four electricians,
eight hours, on this job, on this day — which is enough to cost the hours and fill the site diary,
and not enough to say which work package they went into. Migration 0323 adds that link. It is
checked at the service boundary through the resolver Projects already registers, never by a foreign
key (ADR-0004), so a package belonging to another project is refused at the point of writing rather
than discovered later by a report that quietly drops the row. Projects reads the hours back through
a port bound at the composition root, in the shape the availability port established — Projects
imports Site nowhere.

Three quantities of hours, kept apart: **priced** (per unit, frozen with the award), **earned**
(priced × installed — what the work should have taken) and **spent** (what the people who were
there wrote down). The factor is earned ÷ spent, and it carries its own verdict beside the pace
verdict rather than being folded into one "performance" number, because folding them would hide
exactly the case a manager needs to see.

**Null attribution is normal and permanent.** A great deal of a day belongs to no single package —
mobilisation, housekeeping, standing time, a crew moving between three risers. Forcing a package
onto every row would manufacture attribution nobody observed, and a productivity figure built on
that is worse than none: it is confidently wrong. So the hours stay unattributed, and **the share
of the project's hours naming no package travels with every figure, everywhere it goes**. A package
credited with 40 of a project's 500 man-hours shows a superb factor until somebody is told about
the other 460; a number that hides how much of the labour it ignored is not a measurement, it is an
advertisement.

No hours attributed at all reads UNKNOWN — never infinite productivity, however convenient that
would be — and hours spent before the first measure read UNKNOWN rather than a productivity of
zero, which would condemn every package at its start.

Auth-ON browser and API proof, in the same run as the pace half: 160 m² installed at 1 priced
man-hour each read UNKNOWN "no labour has been attributed" while still naming the 160 hours earned;
a work package in another project was refused (400); 40 electricians × 8 hours read
WORSE_THAN_PRICED at 320 spent against 160 earned, factor 0.5, while the pace verdict stayed
ON_RATE on the same row; and 80 further hours naming no package stayed out of the figure and were
reported beside it as 20% of the project's hours. The plan screen counts lateness and overspending
as two separate headline numbers.

**PLN-11's one open acceptance row is now closed, and the capability moves to COMPLETE** — see the
reconciliation below.

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
| Identity is inferred from a matching name or email | The employment record carries an administered account link with recorded provenance; no matching is performed anywhere |
| One login is claimed by two employment records | Domain, service and a partial unique index all refuse; the second claim returns 409 |
| An unregistered or deactivated account is linked | The identity registry is the authority and an absent or inactive row is refused with 400, never stored as a link that matches nobody |
| Reading HR carries the authority to bind identities | The link endpoint requires `hr.employee.link-account` explicitly rather than the route-derived `hr.employee.delete`; an HR-read role receives 403 |
| An allocation is copied into a task the planner cannot see | My Work reads the booking through; releasing it on the planning desk removes the item and no second record exists to disagree |
| A person without the link, or without project access, is shown an empty list | Coverage names the missing link, counts allocations withheld by project access and counts those beyond the look-ahead horizon |
| A refusal quietly cancels the booking | The answer is a separate fact: a decline changes no quantity, status or capacity, and the held commitment survives it unchanged |
| A decline arrives with no remedy attached | Domain, API and database all require a non-blank reason; a reasonless decline returns 400 |
| Anyone holding a work-item permission answers for somebody else | The handler resolves the actor's employment record and refuses unless the booking names that employee; answering another person's allocation returns 403 |
| A refusal is filed against work that no longer exists | Answering a released booking is refused |
| The refusal never reaches the planner | The planning desk shows the decline and its reason beside the capacity verdict, and counts declined commitments separately from capacity conflicts |
| The UI makes "yes" easier than "no" | Accept and Decline are both rendered inline; neither answer is demoted into an overflow menu |
| A crew's roster is read as its capacity | Membership and capacity are separate records with no arithmetic between them: twelve named members and a stated two crews coexist, and neither derives the other |
| A crew booking is presented as booking every member personally | The member's item says their CREW is committed, states the crew quantity, and names the supervisor as the one who allocates who goes |
| One member's refusal is filed as the crew's answer | A crew commitment carries no accept/decline; a member answering it receives 403 |
| Someone taken off a crew keeps receiving its commitments | The roster read is current-membership only; the removed member's item disappears while the crew still holds the booking |
| A roster entry names somebody HR does not know | The employee id is checked against HR's canonical catalogue before the membership is stored; an invented id returns 400 |
| One person appears twice on a crew | A partial unique index and the service both refuse a second active membership (409) |
| Planning becomes a second register of who holds a crane | Custody stays in the owning register — Fleet's driver link and the asset custodian (migration 0320) — and §22 reads it through; handing a tester over in Assets changes whose work list its commitments appear on with nothing to update in Projects |
| An equipment commitment is read as booking the custodian's own time | The item says the machine is committed and that the person is answering FOR THE MACHINE, not for their day |
| Anyone with a work-item permission answers for a machine | Only the person the owning register names may answer; somebody who has handed the equipment on receives 403 |
| Custody names somebody HR does not know, or a disposed asset | The employee is checked against HR and must be active (400); the domain refuses custody of a disposed or deleted asset |
| A leave approval silently leaves the plan saying the commitment is fine | An approved leave makes the committed days a known zero, so the standing booking reads CONFLICTED with the cause named in HR's own words |
| Projects becomes an approval step for HR or Fleet | Nothing is vetoed or rejected: the leave is approved, the service goes ahead, and not one field of the commitment changes — only what the plan says about itself |
| A pending leave is treated as a fact | Only an APPROVED leave counts; a request is ignored until HR decides |
| An undated "out of service" is read as absence, or as availability | It resolves to UNKNOWN — nobody said until when — and UNKNOWN is never AVAILABLE; a retired vehicle or disposed asset is a known absence because that one is permanent |
| A pool loses capacity because one member is on leave | Availability never speaks about a pool: deriving crew capacity from a roster is arithmetic nobody stated, and a member's leave appears on the member's own bookings |
| A missing or broken availability provider reads as "everything is available" | Unbound and failing both resolve to no statements, leaving §22's declared capacity governing exactly as before |
| History is rewritten when availability changes | The commitment snapshot is untouched; `becameInfeasible` distinguishes "fitted when it was made" from "never fitted" |
| A surfaced conflict belongs to everybody and therefore nobody | A named person takes a resource's conflicts on for a period, and the desk says plainly when nobody has |
| Two people each assume the other is on it | One open owner per resource; a second claim returns 409 |
| A conflict is closed by tidying it off the screen | Closing costs a written decision (400 without one), kept as `resolved` or `accepted` — a fix and a knowingly accepted exposure are different outcomes |
| Recording a decision silences the derived verdict | It cannot: the clash is still computed from the facts, and the desk shows both — owned, decided, still conflicted |
| A project-scoped grant resolves a conflict that spans projects | Ownership is organization-governed; the route carries no project, so only an org grant reaches it |
| An owner is appointed over a resource the tenant does not have | The resource is checked against the canonical catalogue (400) |
| The other side of a conflict is taken from what the client sent | Never: the request names only the desk being read, and every competing party is discovered from the booking store, with each further id — requirement, activity, WBS, project — read off the stored rows |
| Only the first overlapping party is shown | Every overlapping commitment is returned; three projects on one crane return two competing parties from each desk |
| Owning conflicts quietly grants reading other projects | Separate permissions, checked separately: `projects.resource-conflict.*` tenant-wide with no project grant sees only `restricted` parties, and the other project's own desk stays 403 |
| A restricted party is hidden by the browser | Nothing to hide: the payload carries no project, activity or work package for it — proven by asserting those strings are absent from the response body |
| The cross-project report leaks what the lineage redacts | Repaired in the same pass: the report's contributors and project list are redacted by the same rule, with `restrictedProjects` keeping the involved count honest |
| The link is stored, so it lingers after the clash ends | Wholly derived: moving or releasing the other commitment removes it on the next read, and a new clash names the new activity — while the ownership and decision recorded about it are untouched |
| The conflict screen edits what it points at | Nothing on the conflict path writes: the booking, its activity, its dates and its work package are asserted unchanged after reading, owning and deciding |

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
| Employee ↔ account link domain | 9/9 passed; empty id, terminated and deleted records refused, re-pointing refused, re-declaring idempotent and provenance cleared on unlink |
| Employee ↔ account link service | 7/7 passed; unregistered and deactivated accounts refused, one account per employment record, permission enforced, unlink frees the account, cross-tenant read returns null |
| Resource assignment read | 5/5 passed in the booking service; cross-project held commitments listed with the activity read through, released commitments and other tenants excluded |
| Allocation in My Work | 6/6 passed; linked account only, activity/dates/quantity carried, running allocation in progress, missing activity named honestly, look-ahead horizon and withheld-project counts reported in coverage |
| Employee allocation Auth-ON browser journey | 1/1 passed in Chromium; UI link, second claim on one account 409, unregistered account 400, HR-read role refused the link authority 403, allocation visible with project/activity/dates, colleague's allocation absent, release removed the item, unlink reported in coverage |
| Database migration posture | 317/317 applied; the employment record carries at most one platform account per tenant with linked-by/linked-at provenance |
| Tenant-isolation fitness ratchet | 5/5 passed; the new identity read asserts the bound tenant explicitly |
| Allocation response domain | 41/41 booking domain tests passed, 8 of them new; commitment untouched by a refusal, reason required, acceptance clears a stale objection, changing your mind allowed, released bookings unanswerable |
| Allocation response service | 6/6 passed; reason enforced, activity name read through, the project still sees its held commitment after a refusal, unknown booking refused |
| Allocation answer in My Work | 13/13 passed; accept/decline recorded against the named person only, unlinked and wrong-person accounts refused, start/complete refused on an allocation, accept/decline refused on every other source |
| Employee allocation Auth-ON browser journey | 1/1 passed in Chromium; extended to decline with a reason in the browser, unchanged held commitment, planner-visible refusal and count, change of answer to accept, then release and unlink |
| Database migration posture | 318/318 applied; the response is constrained to pending/accepted/declined, a decline must carry a reason and an answered row must carry its provenance |
| Self-scoped route fitness | 4/4 passed; the allocation answer is recorded with why the ordinary permission check cannot authorise it and what replaces it |
| Browser regression (allocation + WBS + My Work) | 5/5 passed in Chromium |
| Pool roster service | 4/4 planning-service tests passed; roster and capacity independent, one active membership per person, rejoining allowed, cross-tenant and wrong-pool removal refused |
| Crew commitments in My Work | 18/18 allocation tests passed, 5 of them new; crew wording, no answer offered, nothing after removal, personal and crew items side by side |
| Project-scope coverage fitness | 4/4 passed; a pool is recorded as organization-scoped with the reason it carries no project |
| Database migration posture | 319/319 applied; membership is tenant-isolated under FORCE RLS with one active row per person per pool |
| Plan save with a held booking | Repaired: requirements are now diffed like tasks, so a plan with a held booking stays editable, and dropping the activity or demand a booking depends on is refused as a conflict instead of failing as an opaque server error |
| Asset custody domain | 31/31 assets tests passed; custody handed over rather than assumed, idempotent re-assignment, returnable, and refused for a disposed or deleted asset |
| Equipment commitments in My Work | 23/23 allocation tests passed, 5 of them new; custodian wording from the owning register, answerable for the machine, refused for equipment not held, all three kinds carried at once and actioned as themselves |
| Full allocation browser journey | 1/1 passed in Chromium; person, crew and equipment proven in one Auth-ON run end to end |
| Database migration posture | 320/320 applied; an asset carries its custodian in its own register, indexed for the work-list read |
| Full API unit/fitness suite | 530 passed / 4 skipped |
| Availability fold (domain) | 25/25 resource-facts tests passed, 8 of them new; absence is a known zero that outranks a declared window, undated is UNKNOWN, identity stays typed, and silence changes nothing |
| Availability read from the registers | 9/9 passed; approved-only leave, scheduled-not-completed maintenance, retired vs in-maintenance, no rewriting of past days, pools never spoken about, and no register queried that was not asked about |
| Availability through the booking service | 8/8 passed; a standing commitment becomes CONFLICTED and says why, the record is unchanged, and unbound or failing providers stay silent rather than favourable |
| Availability Auth-ON browser journey | 1/1 passed in Chromium; leave requested (no effect), approved, and the planning desk turns CONFLICTED naming the leave, with the commitment byte-for-byte intact |
| Planning desk register reads | Repaired before it shipped: the desk asked HR, Fleet and Assets once per booking; one batched read per screen now serves every row |
| Conflict ownership domain | 11/11 passed; named owner and period required, decision required to close, decided once, and an open ownership outranks a past decision |
| Conflict ownership service | 5/5 planning-service tests passed; one open owner per resource, a different resource is a different question, deciding frees it again, and tenants stay separate |
| Project-scope coverage fitness | 4/4 passed; a conflict is recorded as organization-scoped with the reason it belongs to no single project |
| Conflict ownership Auth-ON browser journey | 1/1 passed in Chromium; unowned said plainly, owner assigned, second owner 409, invented resource 400, wordless close 400, decision accepted and shown beside a still-CONFLICTED verdict, second decision 409 |
| Database migration posture | 321/321 applied; ownership is tenant-isolated under FORCE RLS with one open row per resource, and a closed row must carry its decision and provenance |
| Conflict lineage and redaction | 11/11 passed; the party is discovered not supplied, the whole canonical chain resolves, every party is returned, a restricted one carries no identity and is never even looked up, the check names `projects.schedule.read` on the other project, and a foreign-tenant work package is refused |
| Conflict lineage Auth-ON browser/API journey | 1/1 passed in Chromium; A+B+C overlapping on one crane, both sides and the full lineage from each desk, three-way overlap listing every party, a conflict-only identity leaking nothing about B or C and refused on B's desk, the other activity moved away removing the relationship while the decision survives, a new clash naming the new activity, a scheduled overhaul conflicting a standing commitment, and nothing it points at altered |
| Activity progress domain rules | 10/10 passed; measurement over a typed number, a declaration named as one, a stale override never promoted, both figures kept visible, an unreasoned or undated override ignored, and refusal where there is nothing to override or withdraw |
| Activity progress HTTP journey | 12/12 passed; the measured chain end to end, a plan save unable to overwrite, mint or drop a statement, `?projectId=` narrowing to one plan, and under a live verifier a planner refused the statement (403) while the manager reaches the rule itself (400) |
| Activity progress Auth-ON browser journey | 1/1 passed in Chromium; a governed award to a measured bar, each source named on screen, the plain box gone where something is measured, a reasonless statement refused, both numbers shown, withdrawal returning the bar to site, and a further installation moving it with nobody opening the plan |
| Role catalogue authority | 23/23 passed; the Planning Engineer does not hold `projects.schedule.progress-override` and the Project Manager does |
| Database migration posture | 322/322 applied; an activity's override carries its reason, timestamp and author, and a value outside 0–100 or a reasonless statement cannot be stored |
| Screens re-proven after the change | 15/15 passed in Chromium across the operations overview, Project 360, site project context and project health |
| Planned output domain rules | 14/14 passed; the per-line manpower sheet normalised to one unit, supervision kept out of the crew that sets the rate, no basis at all where nothing was priced, both ends of a window counted, never expecting more than was sold, and an UNKNOWN with its reason for every fact nobody stated |
| Planned output HTTP journey | 7/7 passed; the award freezes crew and hours and no money, the activity reads the sold quantity and priced rate with nothing entered, BEHIND with the recovery rate named, ON_RATE on catching up, UNKNOWN for an unmapped package and for a line with no crew priced, and nothing written onto the activity |
| Planned output Auth-ON browser journey | 2/2 passed in Chromium; sold against installed, pace against priced pace, the headline count agreeing with the rows, silence where there is no award line, and "no rate can be judged" for a supply-only line |
| Labour productivity domain rules | 12/12 passed; priced, earned and spent kept apart, the unattributed remainder reported even when no factor can be given, an unattributed package never called infinitely productive, and hours before the first measure never called a productivity of zero |
| Labour attribution HTTP journey | 11/11 passed; a package in another project refused (400), 320 spent against 160 earned reading WORSE_THAN_PRICED while the pace stays ON_RATE, and unattributed hours kept out of the figure and reported beside it |
| Labour attribution Auth-ON browser journey | 2/2 passed in Chromium; the same chain on the plan screen, with lateness and overspending counted as separate headlines |
| Database migration posture | 323/323 applied; a day's labour carries the work package it was spent on, indexed for the per-project fold, and nullable because most labour genuinely belongs to no one package |
| Web unit suite | 221/221 passed |
| Full API unit/fitness suite | 542 passed / 4 skipped |

### PLN-10 reconciliation

Every acceptance criterion this capability has carried across Wave 3, and where it is proven:

| Criterion (as written in the register over time) | Evidence | Open? |
| --- | --- | :---: |
| Two-project employee booking | `employee-account-allocation.spec.ts` — one pool and one employee committed from two projects | no |
| Two-project equipment booking | `resource-conflict-lineage.spec.ts` — one crane, three projects | no |
| Leave conflict | `employee-account-allocation.spec.ts` — approved leave turns a standing commitment CONFLICTED, naming it | no |
| Breakdown conflict | `resource-conflict-lineage.spec.ts` — a scheduled overhaul turns a standing commitment CONFLICTED, naming it | no |
| Authorized resolution | ownership refused to a second owner (409), to an invented resource (400), closed only with a decision (400), decided once (409) | no |
| Visible planner action | the desk shows the owner, the decision and the competing parties | no |
| Named resolver assigned | migration 0321 with one open owner per resource, proven Auth-ON | no |
| Resolution recorded | `resolved` and `accepted` kept apart, decision text required | no |
| Link to every activity involved across projects | canonical chain from stored rows, all parties, server-side redaction | no |

**`PLN-10` PARTIAL → COMPLETE — applied on 2026-09-15 by the programme owner's decision**, after the
reconciliation above. Two judgement calls were knowingly accepted with it and remain open: a conflict
raises no notification to its owner (they learn by opening the desk), and no conflict register is
exported as a document. The `actualOutput` layer therefore stays **PARTIAL** on an otherwise complete
row — the desk's rendered output is proven in the browser, and no exported document exists. The
headline is the owner's decision; the layer remains the evidence, and the two are allowed to
disagree in public rather than be reconciled by rounding one up.

That was three COMPLETE capabilities out of 180; PLN-12 below makes four.

### PLN-12 reconciliation

The capability reads *Actual progress integration*, and its acceptance criterion is that actual
progress derives from approved site/quantity evidence with an explicit governed override path.

| Criterion | Evidence | Open? |
| --- | --- | :---: |
| Progress derives from approved site/quantity evidence | installed quantity → Quantity Ledger → work package → activity, proven over HTTP and in the browser against a governed award | no |
| The plan cannot overwrite the measurement | a save typing 10% over a measured 75% leaves the reported figure at 75% | no |
| A different figure is possible, but never silent | refused without a reason; accepted with one and rendered as "Stated 90% against a measured 75%", with author and timestamp | no |
| The statement is its own authority | `projects.schedule.progress-override`, refused (403) to a planner who may author the same plan, under a live verifier | no |
| A statement cannot be forged through the plan | the four override fields are resolved from the persisted activity and ignored off the payload | no |
| A statement can be withdrawn | the bar returns to the measurement; withdrawing twice is refused | no |
| Measured zero is not declared zero | both rendered, each labelled; UNKNOWN is never drawn as 0 | no |
| Every surface agrees | Gantt, plan headline, operations overview, site "Actual Progress" panel and count, Project 360 activity table with a Source column | no |
| Persistence | migration 0322 with range, reason and provenance constraints; the browser proof round-trips a statement through PostgreSQL | no |

**`PLN-12` DISCONNECTED → COMPLETE — applied on 2026-09-15 by the programme owner's decision**,
after the reconciliation above. That was four COMPLETE capabilities out of 180 (AWD-05, AWD-06, PLN-10, PLN-12);
PLN-11 below makes five.

Three limits are stated rather than rounded away. A statement needs one person, not two: it carries
a permission, a reason and a name, but no independent approval, and whether claiming progress the
site has not measured should need a second pair of eyes is a governance decision, not a defect to
fix quietly. Nobody is told when a stated figure disagrees with the measurement — the disagreement
is visible to whoever opens the screen and reaches no one who does not. And no exported progress
document exists, so the `actualOutput` layer stays **PARTIAL** here for the same reason it does on
PLN-10: the rendered output is proven, the document is not.

### PLN-11 reconciliation

The capability reads *Productivity and planned quantities*, and its acceptance criterion is that a
schedule activity reads planned quantity and productivity from the governed work package and
compares installed output without re-entry.

| Criterion | Evidence | Open? |
| --- | --- | :---: |
| Planned quantity read from the governed work package | the frozen award line's sold quantity, reached through the delivery item map — never typed | no |
| Productivity read from the same place | the accepted line's rate build-up, frozen at handover normalised to one unit | no |
| Without re-entry | nothing on this path is authored by a planner; the browser proof enters neither figure | no |
| Compared against installed output | pace achieved against pace priced, with the recovery rate named when behind | no |
| The comparison is derived, not stored | no rate, quantity or verdict appears on the stored activity | no |
| Absence is not agreement | unmapped package, unpriced line, unopened window and unusable dates each read UNKNOWN with the reason | no |
| Commercial confidentiality holds | the frozen basis carries crew and hours and no rate, cost, price, amount, margin or profit | no |
| Achieved productivity in man-hours | closed in iteration 11: labour carries its work package (migration 0323), read through a port, with earned set against spent | no |
| The figure never flatters by omission | the share of the project's hours naming no package travels with every figure; an unattributed package reads UNKNOWN, never infinitely productive | no |

**`PLN-11` DISCONNECTED → COMPLETE — applied on 2026-09-15 by the programme owner's decision**,
in two steps within this wave: PARTIAL once the pace half was proven, and COMPLETE once the row
that held it there — achieved productivity in man-hours — was closed. A day's labour now names the
work package it was spent on, and the plan sets what the work earned against what it cost. This
makes five COMPLETE capabilities in the register (AWD-05, AWD-06, PLN-10, PLN-11, PLN-12) out of
180.

Two limits are knowingly accepted with the promotion rather than rounded away. Several activities
sharing one work package each inherit that package's whole sold quantity, because no apportionment
has been authored and none can be inferred from the plan. And rates are counted in calendar days
rather than working days, so a window spanning a shutdown flatters the achieved pace — the working
calendar exists (PLN-03) and is not yet read here. Neither touches an acceptance criterion; both
are recorded so a reader knows the figure's precision. As on PLN-10 and PLN-12, `actualOutput`
remains **PARTIAL** on an otherwise complete row: the rendered output is proven in the browser and
no exported productivity document exists.

### Observed while proving it, not fixed

A requirement that has ever carried a booking can never be removed from a plan: the lineage foreign
key (migration 0316) is `ON DELETE RESTRICT` and a RELEASED booking still references it. Releasing
therefore frees the capacity but not the plan, and an activity that was once committed cannot be
dropped. That is adjacent to PLN-10 rather than part of it — no acceptance criterion here depends
on it — and it is recorded rather than quietly changed, because narrowing the constraint to HELD
bookings would drop the lineage of released commitments and needs deciding on its own merits.

## Remaining Wave 3 gate

Wave 3 remains open. The next bounded slices must still prove:

1. Governed engineering file storage, material-submittal/register-item lineage and representative receipt by assigned Site/Project/Procurement roles.
2. A held commitment reaches the person answerable for it in all three forms — the named employee, a crew's roster, and the custodian of a machine — and is accepted or refused by them (PLN-07/PLN-08); HR, Fleet and Assets change the feasibility of commitments already made, closing the second half of the temporal invariant (PLN-09); and a conflict has a named owner, a recorded decision and a canonical, authorized link to every activity involved in it, without ever becoming a stored verdict (PLN-10, reconciled above and proposed for COMPLETE). What remains open in this line is PLN-09's own gap — a conflict raises no notification and reaches no one who is not looking — and that an allocated non-member still gets no project access from being booked.
3. Milestone, baseline, cost, look-ahead, delay/recovery and forecast evidence from the connected plan. Quantity-driven progress is proven (PLN-12, COMPLETE), the rate it is measured against is proven, and so is what the work cost in hours (PLN-11, COMPLETE). What remains open in this line: rates are counted in calendar days rather than working days; several activities on one package each inherit its whole sold quantity; and neither a figure stated against the measurement, nor an activity losing ground, nor one overspending its priced hours reaches anybody who is not looking at the screen.

## Programme state

- **Wave 0 — CLOSED / VERIFIED**
- **Wave 1 — CLOSED / VERIFIED**
- **Wave 2 — CLOSED / VERIFIED**
- **Wave 3 — IN PROGRESS**
- **AURA overall — still OPEN / NOT Functionally Complete / NOT Production Ready**
