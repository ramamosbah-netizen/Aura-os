# Wave 3 Progress Report — Award to Connected Delivery

**State:** CLOSED / VERIFIED for the bounded Wave 3 journey

**Evidence date:** 15 September 2026 · **Closed:** 16 September 2026 on the closure proof below

**Starting point:** `a87657ad` on `main` · **Closed at:** `a9c19c05`

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

## Iteration 12 — Which calendar these dates were counted under

The planning solver has counted working days since Step 8. It chose the calendar by GUESSING: the
tenant's calendars ordered by name, take the first. For a company with one calendar that is right by
luck. For one running Dubai and Riyadh crews — different weekends, different public holidays — it
plans a Saudi job through a UAE Friday, and no screen said which calendar produced the dates. That
silence is what made it invisible rather than merely wrong, and the code called it "a deliberate,
documented interim".

A project now names its calendar (migration 0324), and one place answers which that is for the
solver, the save-time checks and the productivity rates alike. **A project that names none is
planned with every day worked and says so on the plan header**, rather than having one chosen on its
behalf however many the tenant happens to have. That is the §22 rule applied to time: a guess that
reads as an answer is worse than a stated unknown, because nobody goes looking for it.

The backfill is deliberately narrow. Where a tenant has exactly one calendar the old guess had
nothing to be wrong about, so every project inherits it and behaves as it did yesterday. Where a
tenant has two or more, the guess was never safe and is not preserved: those projects come out
unassigned and visibly so. Some will have been planned against the wrong weekend all along, and the
first honest step is to stop rather than keep going with a number that reads as authoritative.

**Three answers to "how long is this window" became one.** The solver counted working days; the
PLN-11 productivity rates counted calendar days; and the activity carried an authored
`durationWorkingDays` reconciled with neither. A rate divided by calendar days charges a crew for
the Friday they were never asked to work and for the week of Eid the company closed. All three now
count under the project's calendar, and the limit PLN-11 recorded against itself is closed.

Two things follow that were not previously answerable. An activity reports what its window HOLDS in
working days and the **float** between that and the work authored into it — the two numbers are not
forced equal, because float is a plan and not an error, and a look-ahead is built on exactly that
slack. And a save is refused when the authored work cannot fit the window at all: fifteen working
days of work in a window holding twelve is impossible, and until the calendar was known "twelve" was
not a fact anybody could check.

Administering weekends, holidays and Ramadan hours stays behind `admin.calendar.manage` where it
belongs; CHOOSING which calendar governs a plan carries the plan's own `projects.schedule.plan`,
because it changes what every date in the programme means.

Auth-ON browser and API proof over one identical window — Monday 2026-03-09 to Friday 2026-03-20,
six working days of work authored. Unassigned: 12 working days, 6 float, two calendars sitting
unchosen. Gulf week (Fri/Sat off): 9 and 3. KSA week (Thu/Fri off): 8 and 2 over the very same
dates — the number the old guess could get wrong with nobody able to see that it had. A public
holiday inside the window drops it again, proving weekends and holidays are one mechanism. Eleven
working days of work is refused against a window holding eight and accepted once the calendar is
cleared. A calendar from another tenant is refused. And the solver places a two-day activity from
Thursday onto Sunday under the project's calendar, while placing it on Friday when the project names
none.

Fixed in passing: the in-memory calendar service minted ids from `Date.now()` alone, so two
calendars saved in the same millisecond silently replaced one another — which is exactly what a
fixture creating a Gulf week and a KSA week does.

**PLN-03 moves from BACKEND_ONLY to COMPLETE** — see the reconciliation below. The register's note
that the Gantt exposed only start and end dates was stale: working-day duration has been authored
there since iteration 6. What was missing was the calendar those days are counted in.

## Iteration 13 — Which activity waits for which

The dependency network, its cycle refusal and the CPM forward pass have lived in the planning domain
and in PostgreSQL since Step 8. **Nothing could reach them.** `setScheduleDependencies` had no caller
anywhere in the product — not a service method, not a route, not a screen — so every plan carried an
empty network and the critical path was computed over a graph nobody could author. The engine was
right and unreachable, which is its own kind of absent, and harder to see than a missing one because
the tests were green the whole time.

A planner now authors the network on the plan screen: which activity waits for which, finish to
start, within this plan only. An edge to another project's activity is not a dependency — it is two
programmes pretending to be one.

**The whole network is sent and judged at once.** A cycle is a property of the graph and never of an
edge, so an endpoint taking edges one at a time could be walked into a loop one individually-legal
step at a time, each step fine on its own. Everything is refused rather than repaired: a self-edge, a
duplicate, an edge naming an activity outside the plan, and a cycle whose loop is named back to the
author. Breaking a loop by dropping an edge nobody chose would be the system deciding which of two
activities waits for the other, and that is a decision, not arithmetic. A refused save is never a
partial save.

Authoring the network carries `projects.schedule.plan` — it decides what the solver may move and what
the critical path runs through. Deleting an activity takes its edges with it rather than leaving the
network pointing at a task that no longer exists.

And the two halves of the planning line meet here: **the accepted dates follow the network across the
days the project's own calendar says are not worked** (PLN-03). A successor never starts on a Friday
the crew was never asked to work.

Auth-ON browser and API proof: two activities parked on the same Monday, separated only by a
dependency the planner authors in the activity editor, with the plan then reading "Waits for …"
beneath the successor. A loop is refused (400) naming the cycle, and the network already authored is
left untouched. A self-edge, a duplicate and an edge naming a task outside the plan are each refused
in their own words. A planning run places a four-day predecessor Monday to Thursday and starts the
successor on the **Sunday** rather than the Friday under the project's Gulf calendar; accepting the
run is what moves the stored dates, and the run alone moves nothing. Removing an activity removes its
edge with it.

**PLN-02 moves from BACKEND_ONLY to COMPLETE** — see the reconciliation below.

## Iteration 14 — The next few weeks, read off the programme

A look-ahead is the meeting every site runs on: what must happen in the coming weeks, what it needs,
and what is not ready. It is the planning artefact people most often keep in a spreadsheet — and the
moment they do, it disagrees with the programme. Someone extends an activity, nobody retypes the
look-ahead, and the meeting is held against a plan that no longer exists. The register had this one
as ABSENT, which was true: repository search found a seven-day My Day list and no project look-ahead
connected to the schedule at all.

It is now a **window over the plan, not a document beside it**. Nothing on it is authored, it is
derived on every read and stored nowhere, and an edit to the programme changes the next read. Each
activity carries the part of ITSELF inside the window in working days under the project's calendar —
four months of work is not four months of work in the next three weeks — and is marked as new work or
carried in from before.

**READY is established, never assumed.** An activity is ready only when its predecessors finish
before it starts, every resource it needs is a held commitment, and every commitment is feasible. An
uncommitted resource, an over-committed one and a predecessor that does not clear in time each keep
it out, in words a planner can act on. And a resource whose capacity **nobody declared** reads NOT
ESTABLISHED rather than ready: "we could not find a problem" and "there is no problem" are different
statements, and a look-ahead that rounds the first up to the second sends a crew to a site that is
not open. A released booking stops being a commitment, so the activity it covered reads as
uncommitted again.

**Scope aggregates by work package, never by activity.** This is the limit PLN-11 recorded against
itself, and the look-ahead is the first place it could have done real damage: several activities may
deliver one package, each reads that package's whole sold quantity because no apportionment has ever
been authored, and a per-activity total would report the same 200 m² twice. The package contributes
exactly one row and the activities are named on it. Which is also why no apportionment authority was
invented here — aggregating correctly needs no such thing, and inventing a split nobody stated would
be exactly the mistake the last three iterations have been correcting.

Auth-ON browser and API proof: a three-week window from today reporting its own working days under
the project's calendar; an activity four months out excluded, and still excluded at six weeks; an
uncommitted crew keeping an activity NOT READY in words; declaring capacity and committing the
requirement turning the same activity READY with no reasons; releasing that booking taking the
readiness with it; a predecessor that does not clear in time naming itself, and reversing the edge
making the activity ready again — derived, not stored; a package delivered by two activities
contributing exactly one scope row; and an activity dragged into the window by an edit to the
programme appearing on the next read with nothing authored.

**PLN-13 moves from ABSENT to COMPLETE** — see the reconciliation below. This leaves the register
with no ABSENT capability at all.

## Iteration 15 — What a delay actually did to the completion date

An EOT claim is a contractual instrument, and the number in it is the most disputed figure on a
construction project. Two facts are routinely mistaken for each other, and the whole value of this
iteration is refusing to:

- **Claimed** — how long the event lasted. A fact about the world: the storm blew for ten days.
- **Impact** — how many working days completion actually moved. A fact about the plan: a ten-day
  storm on an activity with six days of float moves completion by four, not ten.

A contractor claims the first. An employer grants the second. A system reporting only one of them
has taken a side, and one reporting the first as if it were the second is simply wrong.

A delay event now names the **activities** it hit, canonically (migration 0325). It has carried a
WBS code as free text since it was introduced — a label that drifts the first time somebody
renumbers a package, and a link no query can follow. That column stays as the note it always was and
is deliberately **not** migrated: nobody can map free text onto an activity id after the fact, and
guessing would manufacture the very lineage this exists to make real.

The impact is derived by running **the same CPM twice** — once as planned, once with the delay
inserted — and diffing the finishes. Writing a bespoke delay calculator would give the project two
answers to "when does this finish", and the one nobody looks at would be the one in the claim. It is
counted in working days under the project's calendar (PLN-03), because a figure in calendar days is
indefensible the moment the contract is not, and a storm across a weekend nobody was going to work
delayed nothing. **"Absorbed by float" is a real verdict**, not a failure to reach one.

**Concurrency is named and never apportioned.** An overlapping delay is reported with its cause and
left there. Whether a contractor-caused delay running alongside an employer-caused one reduces
liability is a question of the contract and the law, decided by people; halving a figure on that
basis would be inventing a legal position and hiding it inside arithmetic.

And the **assessment is a separate, recorded act** — a figure, a name and a moment — stored beside
the derived impact and never instead of it. The derived figure moves as the programme moves, which
is correct. The submitted one does not: it was made against the plan as it then stood, and rewriting
it whenever somebody edited an activity would quietly rewrite history. Both are shown, exactly as
PLN-12 keeps a measurement beside the figure stated against it. Zero is accepted, because
"absorbed by float" is the commonest honest answer to a claim.

Auth-ON browser and API proof on a critical chain under a Gulf calendar: a delay naming no activity
the programme holds reports UNKNOWN rather than a confident figure; named on the critical path,
three claimed days read as three working days lost, 16 March → 19 March, stepping over the weekend;
the same event moved onto an activity with slack reads ABSORBED_BY_FLOAT with completion unmoved; a
concurrent contractor-caused delay is named with its cause and changes the figure by nothing; an
assessment records a figure, a name and a moment and moves the event to `analysed`; a negative
figure and a missing one are refused; and stretching the critical activity afterwards changes the
derived impact while the submitted figure stands.

Worth noting for the record: PLN-03's rule caught this iteration's own test. Stretching an activity
to six working days inside a two-day window was refused until the window was widened with it —
exactly as it would refuse a planner.

**PLN-14 stays PARTIAL, and COMPLETE is proposed below.**

## Iteration 16 — From an assessed delay to a recovered programme

The chain, and every link a stored row:

`delay event → derived impact → recorded assessment → explicit prepare-recovery hand-off → recovery
proposal → review → acceptance → the programme moves`

**A recovery proposal is a scenario.** It is stored beside the programme, changes not one stored
date, and becomes current only through a governed acceptance. That is the whole of this capability:
a re-plan that quietly became the plan is how a project's dates stop meaning anything, because
nobody can say when they were last agreed to.

**The hand-off is deliberately explicit** — a button somebody presses. An assessment that silently
launched a re-plan would produce a proposal nobody asked for against a programme nobody agreed to
move, and the planner who has to defend the recovery would not have chosen its starting point. It
refuses a delay nobody has assessed, because there is nothing to be a recovery *of*, and a delay
belonging to another project.

The proposal carries canonical lineage to the delay **and** to the assessed impact, frozen at the
hand-off so a later re-assessment cannot rewrite what it was prepared against. The two are read side
by side and are allowed to disagree: "assessed at 3 days lost, this recovers 8" is two assessments
of two different things, and deriving either from the other would destroy both.

It uses the same calendar, the same dependency network and the same CPM as the programme. And what
it is judged on is the **comparison** — current finish, proposed finish, working days recovered
under the project's calendar — never the proposal's own finish date. Zero says the re-plan found
nothing. A **negative** figure says the scenario is worse than the programme it would replace, which
is precisely the one nobody should accept by reflex and the one a finish date alone hides.

**A gap found while building it.** Acceptance already refused a proposal whose task SET had changed,
which catches an activity added or removed and nothing else. A programme can move underneath a
proposal without gaining or losing a single task — a duration extended, a date moved, an edge added,
a different calendar named — and every task id still matched, so stale dates were written silently.
Migration 0326 adds a fingerprint of everything the solver actually consumed, taken at run time and
compared at acceptance. Changed means re-run.

Auth-ON browser and API proof of the whole chain: the hand-off refused for an unassessed delay and
offered only once an assessment exists; a prepared proposal carrying its delay, its frozen assessed
impact and a basis fingerprint; preparing one moving not a single stored date; the comparison
reporting current 24 March, the proposed finish, and **8 working days** recovered under a Gulf
calendar rather than the 12 calendar days between them; discarding leaving the programme untouched
and a discarded proposal refusing a later acceptance (409); extending one activity's duration caught
at acceptance as a changed planning basis (409) with the programme unmoved; and acceptance moving
the programme to exactly the proposed finish, once.

Under a live verifier: a Planning Engineer assesses the delay, prepares the recovery and reads what
it would recover — and is **refused the acceptance (403)** with nothing moved. A stranger is refused
the scenario, the hand-off and the acceptance alike, server-side rather than by a hidden button. The
Project Manager accepts, and the programme moves.

**PLN-14 and PLN-15 both move to COMPLETE** on the joint evidence — PLN-14's open acceptance row is
closed by the hand-off proven here. Both are reconciled together below.

## Iteration 17 — The yardstick, and what it costs to replace one

A baseline is what every variance figure on a project is measured against: a delay's assessed
impact, what a recovery recovered, an SPI. That makes it the single most consequential thing on a
programme to overwrite — and it was overwritten **silently**. The act copied today's planned dates
onto every task and stamped a timestamp. No record of who. No reason. The previous baseline gone.

Which is the open row PLN-15 was promoted with. Accept a recovery, re-baseline, and every delay ever
assessed against the old dates is now measured against the new ones: the variance the recovery
existed to answer for, erased by the act of answering for it, with nothing on any screen saying it
happened.

Taking a baseline now **records who took it and which revision it is**, and each act is kept as a
row carrying the dates it froze **by value** (migration 0327). Superseding therefore *adds* a
revision rather than destroying one, and a variance computed against revision 0 stays computable
once revision 1 exists.

**Taking the first one is free; replacing one costs a sentence.** The first baseline has nothing to
justify — there is nothing being replaced. A later one is replacing the yardstick, and the reason is
required by the domain, by the API and by the database CHECK alike.

Committing carries `projects.schedule.baseline` explicitly. Authoring a programme and committing the
measure it will be judged by are different acts, so a Planning Engineer writes the plan and does not
lock it — while reading which revision a programme is on is privileged to nobody.

And a later edit retains the original baseline per activity, by identity. That was already true and
is now proven, because it is the whole point of having one: it is what makes slippage visible.

Auth-ON browser and API proof: an unbaselined plan reads "Draft plan" and offers "Set baseline";
committing records the actor and revision 0, no reason required, dates frozen by value; moving the
activity afterwards leaves the baseline exactly where it was with the slippage now visible;
replacing it is refused without a reason (400) and the programme stays on revision 0; declining the
prompt on screen changes nothing; given a reason it becomes revision 1 while **revision 0 still says
what was originally committed to**; and an empty programme cannot be baselined at all. Under a live
verifier a Planning Engineer authoring the same programme is refused the baseline (403) with nothing
locked, can still read the history, and the Project Manager commits it with their name on the act.

**Fixed in passing:** the baseline BFF route dropped the request body. A reason typed by a planner
never reached the API, so every re-baseline would have failed as "no reason given" while they
watched themselves type one. It was invisible until the reason became load-bearing.

**PLN-05 moves to COMPLETE** — see the reconciliation below.

## Iteration 18 — Where this programme actually lands

Three dates, and a management report that confuses any two of them is worse than no report:

- **Baseline** — what was committed to (PLN-05). The yardstick, and the only one that does not move.
- **Planned** — what the programme says today. Moves whenever anybody edits it, and says nothing
  about whether the work is keeping up.
- **Forecast** — where the work is heading, derived from what has actually been installed.

A "forecast" that repeats the planned finish is not a forecast; it is the plan with a new label, and
it is the most common lie a project system tells. This one differs from the plan exactly when the
evidence says it should: each activity carries only what is **left** of it, and the **same CPM**
places the remainder over the same calendar and the same dependency network — so the project keeps
one answer to "when does this finish" rather than a forecast engine quietly disagreeing with the
planner.

Remaining duration is rounded **up**. Half a working day of work left is a working day somebody has
to turn up for, and a forecast that rounds remaining work down is optimistic by construction — which
is the one direction a forecast must never be wrong in.

**The confidence travels with the date.** PLN-12 already separates a measured percentage from a
declared one, and a forecast resting on declarations is a guess wearing a projection's clothes. How
many of the driving activities carry measured progress is therefore part of the answer, never a
footnote, and it is never rounded up. An activity already finished stops being a driver — its
evidence no longer moves a date it has no say in.

The variance is against the **baseline**, never against a plan somebody edited this morning, and a
separate figure says how much the plan is flattering itself. The activities that decide the date are
named in the order they run, so the figure is drilled into rather than taken on trust.

**Found while building it:** a finished activity has zero remaining duration, and the planner rightly
refuses to place a task that takes no time. Passed in as-is, every project with anything completed
would have forecast UNKNOWN. Finished work is left out of the run instead — which is also correct on
the merits: a finished predecessor constrains nothing, and its successor can start now.

Auth-ON browser and API proof: a project with no baseline reports **no** variance rather than "on
time"; once committed, all three dates agree and the variance is zero; the drivers are named with
what is left of each and whether that figure is measured; a governed award makes one activity's zero
a **measurement** and the other's a declaration, and the confidence reads 1 of 2 rather than rounding
either way; installing 100 of 200 m² pulls the date in two working days with nobody editing the plan;
stretching an activity pushes the forecast out and reports it late **against the committed date**
while the baseline stays put; completing the first activity brings it back in; and a programme with
an unauthored duration is refused a forecast entirely while still reporting the two dates it knows.

**PLN-16 stays PARTIAL, and COMPLETE is proposed below.**

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
| Working calendar HTTP journey | 8/8 passed; the same window read under two calendars and under none, a holiday dropped like a weekend, work that cannot fit refused, and a foreign-tenant calendar refused |
| Working calendar Auth-ON browser journey | 1/1 passed in Chromium; the calendar named on the plan, chosen there, and the window and float changing with it |
| Planning solver under the project's calendar | 11/11 passed; a two-day activity from Thursday lands on Sunday under the named calendar and on Friday under none — a tenant calendar no project points at governs nothing |
| Duration-fits-window rule | 6/6 passed; float returned rather than forced to zero, the impossible direction refused naming both figures, and an unauthored duration left alone |
| Database migration posture | 324/324 applied; a project names its working calendar, backfilled only where the tenant had exactly one and nothing to guess |
| Kernel calendar suite | 302 passed / 10 skipped, including the colliding in-memory calendar id fixed in passing |
| Dependency network HTTP journey | 6/6 passed; an empty network never inferred from the dates, the network round-tripped, a cycle refused with the existing one untouched, self/duplicate/foreign edges each refused, the dates following the network over a weekend, and an activity's edges removed with it |
| Dependency network Auth-ON browser journey | 1/1 passed in Chromium; authored in the activity editor, "Waits for …" shown on the plan, a loop refused, and the accepted dates following it |
| Look-ahead domain rules | 17/17 passed; the window and its own working days, only the part of an activity inside it, new work against carried-in, readiness established rather than assumed, an undeclared capacity never rounded up to ready, and one scope row per work package |
| Look-ahead HTTP journey | 8/8 passed; the window, a clamped length, uncommitted → committed → released readiness, a predecessor naming itself, one package row for two activities, and the window following an edit to the programme |
| Look-ahead Auth-ON browser journey | 1/1 passed in Chromium; the panel on the plan screen through the same chain |
| Delay impact domain rules | 12/12 passed; claimed against lost, float absorbing a delay, working-day counting, concurrency named and not apportioned, an activity the plan no longer holds, and a programme that cannot be placed |
| Delay impact HTTP journey | 8/8 passed; canonical activity naming, three days on the critical path, the same event absorbed by float, concurrency named, an assessment recorded against a name, a negative figure refused, and the submitted figure surviving a plan edit |
| Delay impact Auth-ON browser journey | 1/1 passed in Chromium; the ledger carrying claimed beside assessed, and the derived verdict changing with the activity it names |
| Role catalogue authority | 24/24 passed; a Planning Engineer assesses a delay's impact and does not decide the EOT claim that rests on it |
| Database migration posture | 325/325 applied; a delay names its activities under FORCE RLS, and an assessment is a whole fact or none of it |
| Recovery comparison domain rules | 10/10 passed; working days recovered under the calendar, a re-plan that found nothing, a proposal WORSE than what it would replace, lineage carried, and nothing stated for a proposal that is not established |
| Recovery chain HTTP journey | 12/12 passed; the explicit hand-off refused for an unassessed delay, canonical lineage frozen at hand-off, a scenario moving no stored date, current/proposed/recovered reported together, a discarded proposal changing nothing and refusing acceptance, a changed planning basis caught (409), and acceptance moving the programme once |
| Recovery acceptance authority (JWT ON) | 4/4 passed; the planner prepares and reads but is refused the acceptance (403), a stranger is refused the whole chain server-side, and the Project Manager accepts |
| Recovery chain Auth-ON browser journey | 1/1 passed in Chromium; assessment → hand-off button → scenario with nothing moved → reviewed with what it recovers → accepted → programme moves |
| Database migration posture | 326/326 applied; a proposal records the delay it recovers, the assessment that justified it, and a fingerprint of the basis it was computed against |
| Baseline domain rules | 11/11 passed; the first baseline free and recorded against a name, replacing one refused without a reason, a revision added rather than destroyed with the old dates intact, an empty programme refused, and the baseline surviving a later edit |
| Baseline HTTP journey | 7/7 passed; the same chain over the API, including revision 0 still holding the original dates after revision 1 exists |
| Baseline authority (JWT ON) | 2/2 passed; a Planning Engineer authors the programme and is refused the baseline (403), reads the history freely, and the Project Manager commits it |
| Baseline Auth-ON browser journey | 1/1 passed in Chromium; draft → r0 locked → edit retains it → replace refused, declined, then reasoned into r1 |
| Role catalogue authority | 25/25 passed; a Planning Engineer does not hold `projects.schedule.baseline` and the Project Manager does |
| Database migration posture | 327/327 applied; a baselining act is an append-only row under FORCE RLS, and the database itself refuses a replacement with no reason |
| Forecast domain rules | 17/17 passed; remaining duration rounded up, the date moving with evidence rather than with the plan, variance against the baseline, confidence never rounded up, a finished activity ceasing to be a driver, and a programme that cannot be placed |
| Forecast HTTP journey | 7/7 passed; no baseline → no variance, all three dates agreeing when nothing has moved, a measured zero and a declared zero counted differently, installation pulling the date in, a stretched plan reading late against the committed date, and an unauthored duration refused |
| Forecast Auth-ON browser journey | 1/1 passed in Chromium; the three dates apart on screen, the confidence beside them, and the drivers named |
| Full API unit/fitness suite | 544 passed / 4 skipped |

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
made five COMPLETE capabilities out of 180 (AWD-05, AWD-06, PLN-10, PLN-11, PLN-12); PLN-03
below makes six.

Two limits are knowingly accepted with the promotion rather than rounded away. Several activities
sharing one work package each inherit that package's whole sold quantity, because no apportionment
has been authored and none can be inferred from the plan. And rates are counted in calendar days
rather than working days, so a window spanning a shutdown flatters the achieved pace — the working
calendar exists (PLN-03) and is not yet read here. Neither touches an acceptance criterion; both
are recorded so a reader knows the figure's precision. As on PLN-10 and PLN-12, `actualOutput`
remains **PARTIAL** on an otherwise complete row: the rendered output is proven in the browser and
no exported productivity document exists.

### PLN-03 reconciliation

The capability reads *Durations and calendars*, and its acceptance criterion is that a planner
selects calendar and duration, saves and reloads, and the solver excludes non-working days.

| Criterion | Evidence | Open? |
| --- | --- | :---: |
| Planner selects a calendar | named in the plan header and chosen there, proven in the browser | no |
| Planner selects a duration | authored on the Gantt since iteration 6, now checked against the window it was given | no |
| Saves and reloads | the choice survives the round trip; the same window reads differently under each calendar | no |
| The solver excludes non-working days | a two-day activity from Thursday lands on Sunday under the project's calendar | no |
| The calendar is the PROJECT's, not a guess | a tenant calendar no project points at governs nothing; unassigned is said out loud | no |
| Weekends and holidays are one mechanism | a public holiday drops out of the window exactly as a weekend does | no |
| One answer to "how long is this window" | solver, save-time check and productivity rates all count under the same calendar | no |

**`PLN-03` BACKEND_ONLY → COMPLETE — applied on 2026-09-15 by the programme owner's decision**,
in one step: BACKEND_ONLY was plainly false once a proven UI existed, and the reconciliation above
leaves no acceptance row open. That was six COMPLETE capabilities out of 180 (AWD-05, AWD-06,
PLN-03, PLN-10, PLN-11, PLN-12); PLN-02 below makes seven.

One limit is knowingly carried with the proposal: **one calendar governs a whole project**. A night
shift, or a subcontractor working a different week from the main contractor, is counted under the
project's calendar because no per-activity or per-resource calendar is authored. Nothing in the
acceptance criterion asks for one, and inventing an inheritance rule nobody stated would repeat the
mistake this slice exists to correct. As on PLN-10/11/12, `actualOutput` remains **PARTIAL** on an
otherwise complete row: the rendered output is proven in the browser and no exported calendar document exists.

This also closes the limit PLN-11 recorded against itself — productivity rates no longer count a
Friday or a shutdown as a day of production.

### PLN-02 reconciliation

The capability reads *Dependencies and critical path*, and its acceptance criterion is that a planner
authors two dependent tasks in the UI, a cycle is refused, and the accepted dates follow the
dependency.

| Criterion | Evidence | Open? |
| --- | --- | :---: |
| A planner authors two dependent tasks in the UI | the activity editor's predecessor picker, proven in the browser | no |
| A cycle is refused | refused with the loop named, and the existing network left untouched | no |
| The accepted dates follow the dependency | the successor starts the first working day after its predecessor finishes | no |
| …counted under the project's calendar | the successor steps over the weekend rather than starting on a Friday | no |
| The network is judged as a whole | the whole set is sent and validated together, so no sequence of legal edits reaches a loop | no |
| An edge cannot leave the plan | a predecessor outside this schedule is refused, not created | no |
| The network survives editing the plan | an activity's edges are removed with the activity | no |

**`PLN-02` BACKEND_ONLY → COMPLETE — applied on 2026-09-15 by the programme owner's decision**, in
one step, the reconciliation above leaving no acceptance row open. That was seven COMPLETE capabilities out of 180 (AWD-05,
AWD-06, PLN-02, PLN-03, PLN-10, PLN-11, PLN-12); PLN-13 below makes eight.

One limit is carried with the proposal: **only finish-to-start is authored.** Start-to-start,
finish-to-finish and lag are understood by the solver — `lagDays` is a field on its input — and have
no way in, so a plan needing them still expresses them by moving dates by hand. Exposing a
relationship type the engine reads but no screen can set would repeat the very defect this slice
corrects, so it is recorded rather than half-built. As on PLN-03/10/11/12, `actualOutput` remains
**PARTIAL** on an otherwise complete row: the rendered plan is proven and no exported network
document exists.

### PLN-13 reconciliation

The capability reads *Look-ahead plan*, and its acceptance criterion is that a Planning Engineer
produces a dated, resource-aware two-to-six-week look-ahead from the accepted programme.

| Criterion | Evidence | Open? |
| --- | --- | :---: |
| Dated | a window from today for the weeks chosen, with its own working days under the project's calendar | no |
| Two to six weeks | selectable on the panel; a nonsensical length is clamped rather than trusted | no |
| Resource-aware | each activity's demand, whether it is committed, and the commitment's feasibility | no |
| From the accepted programme | derived on every read; an edit to the plan changes the next read, and nothing is authored | no |
| Produced by a Planning Engineer | carries `projects.schedule.read`, which the role holds | no |
| Readiness is honest | an undeclared capacity reads NOT ESTABLISHED, never ready | no |
| Scope is not double-counted | one row per work package, activities named rather than summed | no |

**`PLN-13` ABSENT → COMPLETE — applied on 2026-09-15 by the programme owner's decision**, in one
step, the reconciliation above leaving no acceptance row open. With it the register has **no ABSENT
capability left**, and eight are COMPLETE (AWD-05, AWD-06, PLN-02, PLN-03, PLN-10, PLN-11, PLN-12,
PLN-13) out of 180.

One limit is carried with the proposal: the look-ahead is **read on screen and has no exported or
printable form**, which is how a site meeting is usually handed it. That is the same
`actualOutput` gap PLN-02, PLN-03, PLN-10, PLN-11 and PLN-12 each carry, and it is now recurring
often enough to be a document-generation slice of its own rather than six separate ones — the same
argument that moved notifications into a shared authority.

### PLN-14 reconciliation

The capability reads *Delay assessment*, and its acceptance criterion is that a delay event
identifies affected activities and the critical path, and produces a reviewed impact and recovery
proposal.

| Criterion | Evidence | Open? |
| --- | --- | :---: |
| Identifies affected activities | named canonically, many per event, refused if the plan no longer holds them | no |
| Identifies the critical path | reported from the same CPM that produces the programme | no |
| Produces an impact | claimed and lost kept apart, counted in working days under the project's calendar | no |
| The impact is reviewed | a recorded act — figure, name and moment — that survives the plan moving | no |
| Concurrency is not fudged | overlapping events named with their cause and never apportioned | no |
| Produces a recovery proposal | **closed in iteration 16**: an explicit hand-off produces a proposal carrying canonical lineage to this delay and its assessment, proven Auth-ON from assessment to accepted programme | no |

**`PLN-14` PARTIAL → COMPLETE — applied on 2026-09-15 by the programme owner's decision**, together
with PLN-15 and on the joint evidence. The row that kept it PARTIAL through iteration 15 — "and recovery proposal" — is closed: an
assessment now hands off explicitly to a proposal that names the delay and the assessed figure it
was prepared against.

The hand-off is a button somebody presses rather than an automatic re-plan, and that is a design
decision rather than a shortfall: a proposal produced by itself would be one nobody asked for
against a programme nobody agreed to move, and the planner who must defend the recovery would not
have chosen its starting point. The criterion asks that a delay event "produces a reviewed impact
and recovery proposal"; it does, and both the impact and the proposal are reviewed acts with named
people behind them.

One limit is carried: a delay reaches nobody who is not looking at the screen — the same
notification gap five other rows carry.

### PLN-15 reconciliation

The capability reads *Recovery proposal and acceptance*, and its acceptance criterion is that a
planner accepts a reviewed recovery plan, with revisions, baseline and assignments staying
traceable.

| Criterion | Evidence | Open? |
| --- | --- | :---: |
| A recovery plan exists as a reviewable thing | prepared by an explicit hand-off from an assessed delay, stored beside the programme | no |
| It is reviewed before it is anything | current finish, proposed finish and working days recovered, plus per-activity date changes | no |
| A planner accepts it | acceptance is a recorded act that moves the programme to exactly the proposed finish | no |
| …and only the right authority may | a Planning Engineer prepares and reads it and is refused the acceptance (403) under a live verifier | no |
| A proposal is not a programme | preparing one moves no stored date; rejecting one moves no stored date | no |
| Revisions stay traceable | the proposal names the delay and the assessed impact it was prepared against, frozen at the hand-off | no |
| A stale proposal is caught | the planning basis is fingerprinted at run time and compared at acceptance | no |
| Unauthorised access fails server-side | a stranger is refused the scenario, the hand-off and the acceptance alike | no |
| **Baseline stays traceable** | **acceptance deliberately does not re-baseline; the baseline and a recovered programme diverge until somebody re-baselines on purpose** | **yes** |

**`PLN-15` PARTIAL → COMPLETE — applied on 2026-09-15 by the programme owner's decision**, jointly
with PLN-14. That makes ten COMPLETE capabilities in the register (AWD-05, AWD-06, PLN-02, PLN-03,
PLN-10, PLN-11, PLN-12, PLN-13, PLN-14, PLN-15) out of 180.

The open row was weighed and accepted with the promotion rather than waved through. Acceptance moves the current plan and leaves the baseline and the actuals exactly as
they were — which is correct: a baseline is what performance is measured against, and a system that
re-baselined every time a recovery was accepted would erase the very variance the recovery exists to
answer for. But it means a recovered programme and its baseline diverge, and nothing yet prompts
anybody to re-baseline deliberately. Whether "the baseline stays traceable" is satisfied by leaving
it untouched, or requires a governed re-baseline act of its own, is a judgement for the programme
owner. `PLN-05` (Baseline approval) is the row that would carry that work.

As on the other planning rows, `actualOutput` remains **PARTIAL** on an otherwise complete row: the
proposal is proven on screen and no exported recovery document exists.

### PLN-05 reconciliation

The capability reads *Baseline approval*, and its acceptance criterion is that an authorized planner
locks a dated baseline, a wrong role is denied, and later changes retain the original baseline.

| Criterion | Evidence | Open? |
| --- | --- | :---: |
| An authorized planner locks a dated baseline | committed against a name and a timestamp, as revision 0 | no |
| A wrong role is denied | a Planning Engineer authoring the same programme is refused (403) under a live verifier, with nothing locked | no |
| Later changes retain the original baseline | the activity moves, the baseline does not, and the slippage becomes visible | no |
| Replacing one is governed | refused without a reason by the domain, the API and the database alike | no |
| Replacing one destroys nothing | the act is kept by value; revision 0 still holds the original dates after revision 1 exists | no |

**`PLN-05` PARTIAL → COMPLETE — applied on 2026-09-15 by the programme owner's decision.** That
makes eleven COMPLETE capabilities out of 180. It also closes the open row PLN-15 was promoted with —
a recovered programme and its baseline can now diverge *visibly*, and re-baselining is an act with a
name, a reason and a history rather than a silent overwrite.

One limit is carried: **nothing prompts a re-baseline** after a recovery is accepted. The programme
and its baseline diverge until somebody decides to act. That is deliberate — an automatic
re-baseline would erase the variance the recovery was answering for, which is the exact defect this
iteration closed — but unprompted, and it belongs with the notification work five other rows are
waiting on. As on every other planning row, `actualOutput` remains **PARTIAL** on an
otherwise complete row: proven on screen, with no exported baseline document.

### PLN-16 reconciliation

The capability reads *Forecast completion*, and its acceptance criterion is that the accepted plan
drives forecast completion and management variance, with drilldown to contributing tasks.

| Criterion | Evidence | Open? |
| --- | --- | :---: |
| The accepted plan drives it | the forecast runs on the stored programme — the one acceptance made current — not on a proposal | no |
| Forecast completion | derived from remaining work through the same CPM, over the project's calendar and network | no |
| Management variance | against the BASELINE, with a separate figure for how far the plan itself has drifted | no |
| Drilldown to contributing tasks | the critical activities named in order, each with what is left of it and where that came from | no |
| It is a forecast, not the plan relabelled | it moves when installation moves and stays put when only the plan is edited | no |
| The figure says what it is worth | measured against declared drivers, reported and never rounded up | no |
| **Portfolio forecast** | **not built: this is one project's forecast, and no roll-up across projects exists** | **yes** |

**`PLN-16` PARTIAL → COMPLETE — applied on 2026-09-15 by the programme owner's decision.** That
makes twelve COMPLETE capabilities out of 180, and ten of the sixteen planning rows. The acceptance
criterion as written asks for forecast completion, management variance and drilldown to contributing
tasks, and all four are proven above.

The phrase *portfolio forecast* in the table came from the register’s **currentBehavior** field — a
description of the gap as found — and not from the **acceptanceProof**, which is where a promotion is
judged. Reading it as a criterion would have made a cross-project roll-up a condition of forecasting
one project, which it is not: a portfolio number needs a decision about what a rolled-up date means
across projects carrying different confidences, and the roadmap already allocates that question to
Wave 9 (`MGT-13`). The distinction is recorded because mistaking a *currentBehavior* note for a
criterion is the specific way a promotion gets mis-scoped, and it nearly widened this one.
As on every other planning row, `actualOutput` remains **PARTIAL**: proven on
screen, with no exported forecast document — now the seventh row carrying that same gap.

### Observed while proving it, not fixed

A requirement that has ever carried a booking can never be removed from a plan: the lineage foreign
key (migration 0316) is `ON DELETE RESTRICT` and a RELEASED booking still references it. Releasing
therefore frees the capacity but not the plan, and an activity that was once committed cannot be
dropped. That is adjacent to PLN-10 rather than part of it — no acceptance criterion here depends
on it — and it is recorded rather than quietly changed, because narrowing the constraint to HELD
bookings would drop the lineage of released commitments and needs deciding on its own merits.

## Iteration 19 — a milestone is a point where something must be true

The remainder audit named five capabilities. This closes the first, and the smallest: `PLN-04`,
which had **no implementation at all** — no domain rule, no table, no route — while Project 360 had
been offering a link labelled *"Add task or milestone"* that opened a screen which could only add a
task. A label for a capability that does not exist is the defect iteration 2 removed from
DocControl's "Dispatch & Send", and it is removed the same way: by building the thing the label
promises. That link is now true, unchanged.

### Not a zero-duration activity

The obvious modelling is a task with no duration, and it is wrong twice over here. The planner
refuses a duration below one day — rightly, since an activity that takes no time is not one — so a
milestone would have to carry a fake day inflating every path it sits on. And a milestone is not
work: nobody performs it. It is a statement about *when other work must be finished*, so it lives in
its own table (migration 0328) and points AT the activities.

### Three dates, kept apart

| | What it is | Moves when… |
| --- | --- | --- |
| **Target** | what was committed to | never. Authored, and deliberately not derived — a milestone that recomputes its own deadline can never be missed |
| **Forecast** | when the gating work is heading to finish | the work moves |
| **Achieved** | the day it was actually met | it is recorded, as an act with a person and a note |

The forecast is read out of the **schedule's own forecast run**, not a second CPM pass:
`forecastCompletion` now returns per-activity `placements` so anything gating on a subset of the
programme reads that one run. Two runs over one plan would eventually disagree, and a project that
answers "when does this finish" differently on two screens has no answer. The API proof asserts the
milestone's forecast equals the project's `forecastFinish` for the same work.

The status is **derived on every read and stored nowhere** — there is no status column. A stored
verdict is stale the moment an activity moves, and a milestone reading "on track" against a
programme that slipped last week is worse than having none. `MISSED` and `AT_RISK` stay different
words for different things: one is a fact about a date that has passed, the other a prediction about
one that has not, and collapsing them would report a forecast with the confidence of a measurement.

### The contradiction is stated, not refused and not hidden

An achievement recorded while the gating work is unfinished is the commonest way a programme lies to
management: the row goes green, the work is at forty percent, and nothing anywhere says both at once.

Refusing the sign-off would also be wrong — real milestones are accepted with snags by people
entitled to accept them. So it is **accepted, and then the unfinished activities are named beside it
on every read**, in the browser and over the API, surviving reload. The lie was never the sign-off;
it was the silence.

A milestone nothing gates reads `UNKNOWN` with the reason in words, never `ON_TRACK`: a date with no
work behind it is a wish.

### Authority

Authoring a milestone is planning work and the Planning Engineer holds it. Declaring one **met** is a
statement to the client about what has been delivered, and it is the Project Manager's act — the same
separation `schedule.progress-override` makes, and for the same reason: the person who maintains the
figure must not also be the one who declares it true. Asserted over the role catalogue and proven
403 over HTTP with JWT on, in both directions (record and withdraw).

### PLN-04 reconciliation

The capability reads *Milestones*, and its acceptance criterion is that a representative Planning
Engineer, Project Engineer and Project Manager execute it in the canonical Projects schedule context
with save/reload, applicable permission denials, actual output and next-role receipt proved.

| Criterion | Evidence | Open? |
| --- | --- | :---: |
| Representative roles execute it | Planning Engineer authors and reads (JWT ON); Project Manager declares met; Project Engineer reads through `projects.*.read`, asserted over the role catalogue | no |
| Canonical schedule context | mounted on the plan screen, gated on the persisted schedule; every gate resolved from the persisted plan and enforced again by composite foreign key | no |
| Save and reload | authored in the browser, reloaded from the API and re-derived, not re-rendered from the form that submitted it | no |
| Permission denials | 403 planner on record and on withdraw; 401 unauthenticated; 404 another tenant's milestone (not found, never forbidden — confirming an id exists elsewhere is itself a disclosure); 400 an activity from another project; 409 a duplicate name; 409 a second achievement; 400 a future achievement date; 400 a reasonless withdrawal | no |
| Next-role receipt | the named owner receives `Milestone: <name>` in their own My Work, with project context and the COMMITTED date as the due date — through the responsibility chain AWD-06 proved, not a second inbox | no |
| Actual output | proven on screen and over the API; no exported or printable milestone document exists | **yes** |

**`PLN-04` UNVERIFIED → COMPLETE — applied on 2026-09-15 by the programme owner's decision**, with
`actualOutput` **PARTIAL** — the eighth planning row carrying that same gap, and the same basis on
which `PLN-05` and `PLN-11`–`PLN-16` were promoted. That makes thirteen COMPLETE capabilities of 180,
and **eleven of the sixteen planning rows**.

This promotion was proposed once before and **withheld by the programme owner**, on a point that was
not `actualOutput`: an `ownerId` could be saved for somebody who is not a project member, the
responsibility service would rightly refuse to assign to them, and the milestone would still save
successfully while the named recipient received nothing — with only a log line to say so. That is a
direct contradiction of this wave's exit gate, which requires a next-role receipt to be PROVED, and
the objection was correct.

The reasoning it overturned is worth keeping, because it sounded right: *the milestone is the record,
the notification is a consequence of it, and losing the second must not destroy the first.* That
holds for a transient infrastructure failure. It was applied to an **invalid recipient**, which is
not a failure of delivery at all — it is invalid input, and the two were conflated. A log is not a
receipt.

Naming an owner is naming a recipient, so the operation now either tells them or refuses the naming:

| State | Result |
| --- | --- |
| No owner named | milestone saved, nobody told — unowned is a state, not an error |
| Owner named, member of the project | milestone saved, owner holds it in My Work |
| Owner named, NOT a member | **400, and nothing is saved** — no milestone, no orphan owner |
| Owner named and valid, but the receipt fails anyway | the milestone is removed and the caller is told; it is never left half-written |

The membership question is asked of `ProjectResponsibilityService.canReceive` — the same rule
`assign` itself uses, extracted rather than copied, so the check and the act cannot drift apart. And
the owner picker now lists the **project's own members** rather than every account in the tenant: a
picker offering a choice the server will reject is worse than no picker, and a project with no
members says so instead of presenting an empty one.

### Found while proving it, and fixed rather than worked around

Three of these were found by the repository's own gates, which is what they are for:

1. **The project-scope fitness gate** refused `milestones/:id`: it names a record by id with nothing
   resolving it to a project, so it would have been authorised org-wide only and **project members
   would have been locked out of their own milestones**. Resolver registered.
2. **The error-taxonomy gate** caught a refusal that would have escaped as a 500. Reworded so it
   classifies as the 409 state conflict it is.
3. **The handoff proof caught a receipt that had never worked at all.** The owner notification was
   written, looked right, and did nothing:

   ```ts
   @Optional() private readonly responsibilities: ProjectResponsibilityService | null
   ```

   A constructor parameter typed `X | null` emits `Object` as its design-time type, so Nest has no
   token to resolve and injects nothing. The seam then reads as unbound in *every* composition, the
   guard returned at its first line, and a milestone with a named owner told that person nothing.
   No error, no log, no failing test — this is exactly why `ScheduleService` writes
   `@Optional() @Inject(Token)` on every optional dependency. Both of this service's were missing it.

   It was caught only because the receipt was **proved rather than assumed**, which is the whole
   argument for the handoff layer being part of the definition of done.

Also corrected while there: the catch around the receipt swallowed its error entirely and now logs a
warning naming the milestone and the owner who was not told; and the API proof's middleware
hardcoded a single actor, so the handoff was being "proved" by the same principal that created the
milestone — which proves nothing.

`aura_projects_schedules` also had no lineage unique key for a composite foreign key to point at, and
its `project_id` is `uuid` rather than `text`. Both settled in the migration.

### Accepted limits, recorded rather than buried

- **No exported milestone document** (`actualOutput`). The eighth planning row with this gap; Wave 8
  owns it.
- **Nothing notifies the owner when a milestone crosses its committed date.** The receipt arrives
  when the milestone is created; a milestone going from `ON_TRACK` to `AT_RISK` reaches nobody who is
  not looking at the screen. The seventh such signal, and still one shared notification authority
  rather than seven bespoke ones.
- **Nothing prompts anybody when a gating activity is deleted.** The gate cascades away and the
  milestone reads `UNKNOWN` with its reason — loud on the screen, silent everywhere else.
- **Deleting a gating activity cascades the gate away.** Chosen over `RESTRICT`, which would block
  ordinary replanning; the milestone then reads `UNKNOWN` with its reason printed rather than
  silently staying "on track", so losing a gate is loud on the screen — but nothing tells the owner.

## Iteration 20 — a technical query response is a design decision

Second of the four remaining rows, and **investigation first** under programme rule 8. `ENG-03` was
UNVERIFIED, which is not the same as absent: domain, stores, routes, a UI and a My Work surface all
existed, and raise-then-respond worked end to end. Building a second path on top of that would have
been the worst available outcome.

What did not hold was everything that makes an *answer* trustworthy — and site builds to the answer.

### The three defects, all in one place

| | Before | Why it matters |
| --- | --- | --- |
| **Attribution** | `responded_at` existed; `responded_by` did not | A TQ you are about to build to could not say who decided it. The actor sat in the event log, and nowhere a reader would look. |
| **Supersession** | `respondToQuery` assigned the new text and returned | An answer given in March and changed in June left no trace of March — and March is what was built. The same defect migration 0327 closed for the baseline, in a place where the consequence is poured concrete rather than a variance figure. |
| **Closure** | `closed` was in the status union and **nothing in the codebase could reach it** | Every TQ ever raised sat at `responded` for ever, and nothing recorded whether the answer was adequate. |

### What it is now

Answers are **revisions** (migration 0329, append-only by grant). Giving the first is free; replacing
one costs a reason and keeps what it displaced, written **in the same transaction** as the overwrite
— anything less would let the new answer land while the history of what it replaced did not, which
is the failure itself in miniature. The revision count is on the record, so a decision that has moved
twice is visibly a different thing from one that has stood since March.

**Closing is the raiser's act.** The person who answered cannot declare their own answer adequate,
and that rule lives in the domain rather than only in a permission — a principal holding *both*
permissions is still refused. A closed decision cannot be rewritten underneath the people who acted
on it. A TQ cannot be born answered.

`drawing_id` links the query to the canonical drawing register and is refused when it resolves to
another project. Free-text `drawingReference` can name "E-101 Rev C" and be traced to nothing; an id
pointing elsewhere would be worse — a query that *looks* linked. The same fix `PLN-14` needed for its
free-text WBS code.

### ENG-03 reconciliation

The acceptance criterion asks that a representative Design / Technical Engineer, Project Engineer and
Technical Manager execute a technical query response in the canonical Engineering / DocControl
context, with save/reload, applicable permission denials, actual output and next-role receipt proved.

| Criterion | Evidence | Open? |
| --- | --- | :---: |
| Representative roles execute it | Technical Engineer raises and closes; Technical Manager answers; Project Engineer holds read and close. Proven JWT ON, and the split asserted over the shipped role catalogue | no |
| Canonical Engineering context | the workspace's technical-queries section; every gate on the canonical drawing register, cross-project refused by the service and the query reloaded from the API | no |
| Save and reload | answered in the browser, reloaded and re-derived from the record rather than re-rendered from the form | no |
| Permission denials | the raiser refused the act of ANSWERING (403); the answerer refused the act of CLOSING (403); a principal holding BOTH still refused a self-close (409); unauthenticated 401; a drawing from another project 400; a reasonless replacement 409; closing an unanswered query 409; closing twice 409 | no |
| Next-role receipt | the query reaches both the raiser and the named responder in My Work; answering moves the turn to the raiser and leaves the responder waiting; accepting clears both; somebody with no part in it never sees it | no |
| Actual output | proven on screen and over the API; no transmitted or printable TQ document exists | **yes** |

**`ENG-03` UNVERIFIED → COMPLETE — applied on 2026-09-15 by the programme owner's decision**, with
`actualOutput` **PARTIAL** — the same basis on which the planning rows were promoted. That makes
fourteen COMPLETE capabilities of 180, and takes the Wave 3 remainder to **three**. Issuing a TQ response as a controlled document to a
named recipient is `ENG-05`'s question, which is still open and still in this wave.

### Found while proving it, and fixed rather than worked around

1. **Two permission vocabularies for one exchange.** The guard derives
   `engineering.technical-query.*` from the route while the service asserts `engineering.tq.*`. Any
   role not holding a broad `engineering.*` was gated on one name and checked against another — the
   explicit assert was effectively dead for wildcard holders while the guard did the real gating. The
   routes now name the permission, so both agree on one word.
2. **No role could close a technical query at all.** Only the Technical Manager held `engineering.*`,
   and the domain rightly refuses a self-close — so the loop was unclosable by construction, not just
   unbuilt. `engineering.tq.close` now sits with the raising side (Technical Engineer, Project
   Engineer) while answering stays with the design authority.
3. **The answer reached the raiser as something they were WAITING on.** `responded` mapped to
   `waiting` for everyone, so the moment the design decision arrived, the person who now had to judge
   it and build to it was told by their own work list that there was nothing to do. Whose turn it is
   depends on who is looking; it now reads as work for the raiser and waiting for the responder.
   This is the next-role receipt, and it was wrong until it was proved rather than assumed.
4. **A refusal promising a capability that does not exist.** The closed-query message said the answer
   "can only be changed by reopening it first", and no reopen exists anywhere — a sentence offering a
   button that is not there, which is the defect `PLN-04` was raised against in the first place. It
   now says what this system actually does: a closed decision is superseded by raising a new query.
5. The service-scope fitness gate caught both the new assertion and the new drawing provenance, and
   the error-taxonomy gate caught a refusal that would have escaped as a 500. Both declared.

### Observed while proving it, not fixed

**A TQ declaring cost or time impact tells nobody who assesses either.** `costImpact` and `timeImpact`
are authored on the query, are visible on the screen, and reach neither variation nor delay
assessment. A design decision that admits it will cost time is exactly the evidence a delay
assessment is built from (`PLN-14`), and it is currently two booleans read only by whoever opens the
query. That is adjacent to this row rather than part of it — no clause of this acceptance criterion
depends on it — and it is recorded rather than quietly wired, because connecting engineering's
self-declared impact to a commercial assessment needs deciding on its own merits.

### Accepted limits, recorded rather than buried

- **No transmitted or printable TQ document** (`actualOutput`). Issuing one to a named recipient is
  `ENG-05`.
- **A closed query cannot be reopened.** Deliberate — a decision that has been accepted and built to
  should be superseded by a new query rather than edited — but it means a mistaken acceptance is
  corrected by raising, not by undoing.
- **Nothing notifies anybody who is not looking at a screen.** My Work carries the turn, which is
  more than the planning signals have, but no message leaves the system.

## Iteration 21 — ENG-04 authority investigation (no promotion)

`ENG-04` began as an authority question and it has stayed one. This records what the repository
actually contains, because the answer changes what the row can mean — and because a capability must
not be relocated between contexts silently.

**No promotion is proposed, and no user interface was built.** Building a screen over semantics this
unsettled is how a gap becomes a feature nobody can take back.

### The canonical record is Quality's Material Approval Request

Three registers touch submittals. Only one models a material:

| Register | What it carries | Verdict |
| --- | --- | --- |
| **`quality` MAR** | the product (material name, manufacturer, supplier, specification), the consultant's decision, **who made it and when**, review comments, a revision chain — and a procurement consumer | **canonical** |
| `doccontrol` submittal | controlled documents with A/B/C/D review codes and revisions | a document register, not a material one |
| `engineering` submittal | `submittalType: material` with a `status` that can read `approved` — no reviewer, no comments, no revision, nothing downstream reading it | duplicate; its material writer is now refused (`717c0124`) |

**Audit correction, recorded and NOT applied silently:** the register gives `ENG-04` the authority
*Engineering / DocControl*. The implementation that satisfies it is in **Quality**, and that is
correct on the merits — a Material Approval Request is a QA/QC document in UAE practice, which the
module's own doc comment says. The register's field was written from the capability's NAME rather
than from discovery. Correcting it is proposed as an explicit audit correction for the programme
owner to accept, not folded into a promotion.

### What `717c0124` fixed, and what it did not

It closed a real defect: the procurement gate asked whether the supplier had a **rejected** request
and passed whenever the answer was no, so a material nobody had ever submitted issued a purchase
order exactly like an approved one. The verdict now distinguishes APPROVED / APPROVED_AS_NOTED /
PENDING / REJECTED / UNKNOWN, PENDING and REJECTED refuse, and a canonical `supplier_id` replaced a
`lower(name) = lower(name)` match.

Two things it did **not** fix, both raised by the programme owner and both correct:

1. **UNKNOWN still passes the governed gate.** Recording it on the issue event makes the ambiguity
   visible; it does not make it not-an-approval. In the governed path, `passed: true` is a pass.
2. **A canonical supplier is identity, not material lineage.** One supplier supplies dozens of
   materials. An approval for fire-rated cable authorises nothing about the containment, the
   detectors or the panels bought from the same company — the question was fixed for precision and
   left wrong in its SUBJECT.

### The applicability authority does not exist

The obvious repair — treat a purchase order with no BOQ line as not buying specified material — was
**rejected before implementation**, because the repository does not support it:

| Question | Finding |
| --- | --- |
| Is `boqItemId` mandatory on a purchase order? | **No.** `boqItemId: dto.boqItemId ?? null`. Only `title` is required to create a PO. |
| Who supplies it? | The **buyer**, at order time, with no server-side validation. |
| What is it for? | The Quantity Ledger's ORDERED posting — a commercial measurement, not a governance control. |
| Is there a PO **line** model? | **No.** The purchase order is flat: one title, one value, one optional BOQ item, one quantity. |
| Is there a type/category classifying an order as material / service / hire / consumable? | **No.** None on the PO, none on the purchase request. |
| Is there any classification at all? | Only `SupplierCategory` on the supplier master (`materials`, `subcontractor`, `services`, `equipment`, `other`) — a property of the VENDOR, not of the order, and a materials supplier still invoices delivery charges. |

Encoding `boqItemId == null → NOT_APPLICABLE` would therefore have moved the defect rather than
closing it:

```
    before:  no MAR         -> pass
    after:   no boqItemId   -> pass
```

and the second is worse, because the field is optional and supplied by the person being gated. **A
missing field would have become an authorisation.** `NOT_APPLICABLE` must be an authoritative fact
somebody declares, and there is nothing in this system that declares it.

### There is no canonical material or product identity

Every candidate, and why none of them closes the chain:

| Candidate | What it is | Why it does not serve |
| --- | --- | --- |
| `StockItem` (inventory) | warehouse item master: code, name, unit, barcode | no manufacturer or model; **not referenced by a purchase order at all** |
| `ElvDevice` (elv) | `manufacturer` + `model` + tag + serial | an **installed instance** on a project, created at or after installation — it exists after the purchase, not before it |
| `MarketItem` (market-intelligence) | `manufacturer` | competitor/market intelligence, not a governed catalogue |
| `MaterialApproval` (quality) | `materialName`, `manufacturer`, `specification` | **all free text** |
| `GoodsReceipt` | `boqItemId`, quantity | scope lineage, no product identity |
| approved make/model register | — | **does not exist anywhere in the repository** |

A BOQ item is scope, not product: *"Supply and install CCTV camera"* can carry several proposed
manufacturers, models and revisions, and approving one of them approves one of them.

### So the chain cannot be completed today

The lineage the invariant needs —

```
    PO line -> canonical material/product -> BOQ scope -> exact MAR revision -> consultant decision
```

— breaks at its **first two links**: there are no purchase-order lines, and there is no canonical
material or product. Everything downstream of those is buildable; nothing upstream of them exists.

Any gate built now is necessarily weaker than the invariant. That is a structural gap wider than one
capability row, and it is reported rather than papered over.

### A second hole, found while investigating

**Site installation is not gated by material approval at all.** Nothing in `modules/site` reads a
MAR. Even a purchase order correctly refused does not stop the material being recorded as installed,
which is the point at which it is fixed to the building. The procurement gate is one of two doors,
and only one of them has ever had a lock.

### Legacy requests

Existing MARs carry free-text `supplier` and `materialName` and nothing else. They must **not** be
reinterpreted as material-level approvals by a new matching rule — an approval whose subject cannot
be identified is not an approval of a particular material. They are preserved and their material-level
authority classified honestly as **legacy / unresolved**, which is a true statement about them rather
than a permission granted retrospectively.

### Where this left ENG-04 — and where it ended

`UNVERIFIED` at the time of writing. The row was closed afterwards, on the frozen acceptance
criterion rather than on the invariant this section argued for: `stages: Engineering`, and the
criterion asks for the submittal and its decision with save/reload, denials, actual output and a
next-role receipt. It does not ask for purchased-material identity, purchase-order lines,
procurement enforcement or installation gating — those were this investigation's findings, and they
belong to Wave 4 (`BUY-01`) and to the unowned gap below. The four architectural decisions listed at
the end of this section were NOT taken, and ENG-04 closed without them.

The original assessment below is left standing rather than edited, because it was the reasoning at
the time and the correction to it is the record worth keeping: the conclusion *"cannot be closed
until the system can say which material a purchase is for"* was true of the **product** and not of
**this capability row**, and applying a self-formulated invariant to a frozen criterion is the same
error that nearly widened `PLN-16` over the phrase "portfolio forecast".

`UNVERIFIED`, and staying there. The row cannot be closed to the invariant *"only the approved
material may be bought and installed"* until the system can say **which material** a purchase is
for. What is committed (`717c0124`) is kept: the verdict, the canonical supplier identity, and the
closure of the ungoverned second writer are all improvements that survive whatever identity is
chosen.

The decisions this now needs are the programme owner's, and they are larger than this row:

1. whether a canonical **material / product identity** is introduced, and where it lives;
2. whether the purchase order gains **lines**, without which no order can name more than one
   material;
3. what **declares applicability** — the authority that says this purchase requires an approved
   material — given that no field in the system does so today;
4. whether **site installation** is gated alongside procurement.

## Iteration 22 — a conveyance goes to people, and only they can say it arrived

The last two rows Wave 3 owes, taken as one slice because they share one mechanism — and reconciled
apart, because sharing a mechanism is not sharing a criterion.

### Investigation first, and it moved the target

Far more existed than the register implied. The conveyance lifecycle is properly enforced
(`draft → sent → received → acknowledged`, no skipping, no re-send after acknowledgement), and
`TransmittalItem` already snapshots the exact register revision **by value** — document number,
title and revision captured at conveyance time so what was sent stays readable after the register
moves on.

Both frozen criteria reduced to one missing thing:

> `recipient` was a single free-text field, and `acknowledgeTransmittal` checked a permission and
> nothing else.

So a release to a Site Engineer, a Project Engineer and a Buyer could name one of them, badly —
*"Site team"* resolves to nobody — and **any** holder of `doccontrol.transmittal.acknowledge` on the
project could sign for a document addressed to somebody else. A receipt signed by a person who was
never sent the document is not a receipt; it is a second person's opinion that it probably arrived.

### What replaced it

Recipients are **rows** (migration 0332): a platform user, the capacity they receive in, and their
own acknowledgement. Acknowledging now requires two things where it required one — the permission
says you are the kind of person who acknowledges conveyances, being on the distribution says *this
one* was sent to you.

**Partial receipt is not receipt.** With three named recipients, one answering must not report that
three people have it. The conveyance reaches `acknowledged` only when the last of them answers; until
then the per-person receipts are the truth and *"the Buyer has it, Site has not"* stays readable —
which is the fact a chase starts from and the fact a single status destroys. The event payload
carries the same split, so a reader of the log is never left to infer whether the document landed
everywhere.

The distribution is fixed at `sent`: recipients go on while it is a draft, and adding somebody after
is refused, because what was conveyed is what was conveyed. A conveyance with **no** named recipients
keeps the previous permission-only behaviour — historical records carry no distribution to check
against, and refusing them all would rewrite the past rather than govern the present.

### ENG-05 reconciliation

*Attach the exact controlled register revision(s), send once, show recipient receipt/acknowledgement
and retain revision/purpose lineage under representative project and functional permissions.*

| Criterion | Evidence | Open? |
| --- | --- | :---: |
| The exact controlled register revision(s) | each item snapshots number, title and revision FROM the register, so a package cannot claim a revision the controlled record never had | no |
| …revision**s**, plural | two documents in one package, each keeping its OWN revision — a package is not one revision applied to several drawings | no |
| Send once | `draft → sent` only; a second send is refused 409 | no |
| Recipient receipt / acknowledgement | each named recipient answers for themselves; a holder of the identical permission who is not on the distribution is refused; a second answer from the same person is refused | no |
| Revision / purpose lineage retained | the items still read back at their conveyed revision and purpose after the conveyance has closed | no |
| Representative project and functional permissions | JWT ON throughout; document-controller and recipient roles kept apart; the assertion resources on the conveyance's own project; unauthenticated 401 | no |

**`ENG-05` PARTIAL → COMPLETE — applied on 2026-09-16 by the programme owner's decision.**

### ENG-06 reconciliation

*Repeat the governed release with separate Design issuer and assigned Site Engineer, Project Engineer
and Procurement recipients; prove only authorized recipients see/accept their exact drawing or
material revision and retain receipt history.*

| Criterion | Evidence | Open? |
| --- | --- | :---: |
| The governed release, repeated | `draft → submitted → under_review → approved → transmitted`, each step its own act, producing the conveyance | no |
| Separate Design issuer | the issuer is Design and is deliberately NOT on the distribution — a release nobody outside Design has to accept is an announcement, not a handover | no |
| Assigned Site Engineer, Project Engineer and Procurement recipients | three named people, each in the capacity they receive in | no |
| **Only authorized** recipients accept | a bystander holding the identical acknowledge permission is refused, and the count stays at zero; Site accepting does not accept for the Project Engineer or the Buyer | no |
| Their exact drawing revision | the conveyance code is derived from the immutable drawing-revision identity, so what was released cannot drift from what the register later becomes | no |
| Retained receipt history | the acknowledgement history names each role that accepted, and each person's own receipt carries their own note rather than a shared one | no |

**`ENG-06` PARTIAL → COMPLETE — applied on 2026-09-16 by the programme owner's decision.** That makes
seventeen COMPLETE capabilities of 180, and closes the last of Wave 3's six pinned proofs.

### Found while proving it

- **The acknowledge BFF sent a PUT declaring a JSON content-type with no body**, so the parser
  rejected it before the "only a named recipient may acknowledge" rule was ever reached — the same
  defect found on ENG-03's close route, in a second place.
- **The service-scope fitness gate** caught both the new assertion and the changed provenance on
  acknowledge; both are declared rather than silently added.
- **This service is constructed positionally by several suites**, so a dependency inserted anywhere
  but the end rebinds every later one. Noted in the constructor for whoever adds the next.

### Verified live, not merely asserted

The local verification database had been rebuilt empty overnight, so this run re-provisioned it. That
carried an independent proof worth keeping: **RLS fitness reports 265 tenant-scoped tables, every one
ENABLED, FORCED and policied**, with cross-tenant isolation verified under a non-bypass role across
15 assertions. That covers the tables added by this slice and by the material-approval work before
it — their isolation is verified live rather than asserted by the migration that wrote them.

### Accepted limits

- **No printable transmittal note.** The frozen criterion asks for the package, the send, the receipt
  and the lineage, and all four are proven; issuing a formatted conveyance document is not among
  them, and none is invented to fill a field that does not ask for one.
- **Nothing notifies a recipient who is not looking at the register.** The conveyance reaches them in
  the system; no message leaves it. The same shared notification authority still wanted elsewhere.
- **`sender` remains free text.** ENG-06 asks for a *separate* Design issuer and that is proven by
  the issuer not being on the distribution; making the sender a canonical user was not required and
  is not claimed. Recorded as **technical debt** on the programme owner's decision, not carried as an
  open clause.

## Wave 3 remainder audit

The section that stood here had become three paragraphs of accreted commentary. Every iteration
added a clause and none ever removed one, so by the eighteenth it recorded a great deal and answered
nothing — in particular it could not answer *how many capabilities are left*, which is the one
question a wave gate exists to answer. A gate nobody can count is how a programme walks from one
capability to the next without ever arriving. This replaces it with the arithmetic.

The count below is measured against the closure condition the roadmap wrote for this wave **before
any of it was built** — not against a standard assembled afterwards to fit what has been done.

### The scope this wave was actually given

[`remediation-roadmap.md`](./remediation-roadmap.md) defines Wave 3 as *Award → mobilisation →
engineering → connected plan*, owning gap records **J2-02, J2-03, F-07, F-08**, with six pinned
UNVERIFIED proofs — **AWD-06, ENG-03, ENG-04, ENG-05, ENG-06, PLN-04** — and this exit gate:

> frozen scope reconciles to WBS and Sold projection; an approved engineering release reaches
> Site/Buyer; the planner allocates real resources, detects a conflict, accepts a recovery proposal
> and sends the resulting work to the responsible people; six pinned proofs are resolved.

Waves 0, 1 and 2 were each closed against their own equivalent gate and against nothing else. Wave 2
closed on the record with `EST-07`, `EST-11`, `EST-12` and `EST-13` still UNVERIFIED, because those
rows were not in its gate; they were sequenced to Wave 4 and named in the closure report rather than
quietly carried. The same standard applies here in both directions: nothing in the gate may be
waived, and nothing outside it may be added.

### The exit gate, clause by clause

| Clause | Carried by | State |
| --- | --- | --- |
| Frozen scope reconciles to WBS and Sold projection | `AWD-05` COMPLETE; gap records J2-02 and J2-03 CLOSED / VERIFIED at iteration 1 | **MET** |
| An approved engineering release reaches Site/Buyer | `ENG-06` — the release is governed and transmitted against a named responsibility, but not yet with a separate Design issuer and assigned Site Engineer / Project Engineer / Procurement recipients accepting their exact revision | **OPEN** |
| The planner allocates real resources | `PLN-06`/`PLN-07`/`PLN-08` — employee, crew, vehicle, asset and governed shared-pool demand authored on a WBS-linked activity and committed into a held booking, proven Auth-ON | **MET** |
| …detects a conflict | `PLN-10` COMPLETE; `PLN-09` drives an HR leave request through approval and the planning desk changes with it | **MET** |
| …accepts a recovery proposal | `PLN-15` COMPLETE — delay → impact → assessment → explicit hand-off → proposal → acceptance → governed programme | **MET** |
| …and sends the resulting work to the responsible people | `AWD-06` puts a named responsibility into the assignee's My Work; a held employee booking reaches the named person and a crew's roster; an equipment commitment reaches that machine's custodian, accepted or refused with a reason | **MET** |
| Six pinned proofs are resolved | one of six | **OPEN** |

### The six pinned proofs

| Pinned | Capability | State | What is missing, concretely |
| --- | --- | --- | --- |
| `AWD-06` | Team and responsibility assignment | **COMPLETE** | — |
| `ENG-03` | Technical query response | UNVERIFIED | Domain, stores and `POST/GET /engineering/technical-queries` exist; nothing is proven about reachability, permissions, actual output or next-role receipt. Rule 8 work: investigate, then build only what investigation shows is absent. |
| `ENG-04` | Approved material submittal | UNVERIFIED | The same shape — plus the finding below, which decides what this row even means. |
| `ENG-05` | Document transmittal | PARTIAL | Attaching the exact controlled register revision(s) as a multi-document package, and the recipient's acknowledgement returning to the sender with revision and purpose lineage retained. |
| `ENG-06` | Release notification to site | PARTIAL | A separate Design issuer and named Site / Project Engineer / Procurement recipients; only authorized recipients seeing and accepting their exact drawing or material revision; retained receipt history. |
| `PLN-04` | Milestones | UNVERIFIED | **Nothing exists.** No milestone concept in `modules/projects`, no route, no table. Project 360 nonetheless offers a link labelled *"Add task or milestone"* that opens a screen which can only add a task — the same class of false affordance that iteration 2 removed from DocControl's "Dispatch & Send". |

### The answer

**Five capabilities remained to close Wave 3: `ENG-03`, `ENG-04`, `ENG-05`, `ENG-06`, `PLN-04`.**

All six are now COMPLETE — `AWD-06`, `PLN-04`, `ENG-03`, `ENG-04`, `ENG-05`, `ENG-06` — so **no
capability remains** for this wave.

**That arithmetic does not close Wave 3.** The capability count is one input to a wave-level closure
proof, not a substitute for it, and the wave is still IN PROGRESS until that proof is produced and
accepted. The live RLS verification recorded above is the same kind of thing: an excellent additional
layer, and not a shortcut past project-scope, functional or browser proof for anything it did not
itself exercise. `ENG-06` is counted
once but discharges two lines, carrying a gate clause of its own as well as a pinned proof.

**The planning line is finished for this wave.** Of sixteen planning capabilities eleven are
COMPLETE, and the five that are not (`PLN-01`, `PLN-06`, `PLN-07`, `PLN-08`, `PLN-09`) carry gaps the
roadmap assigns to later waves rather than to this gate. Wave 3 owes no further planning work.

### What the number would be under two other readings

Stating the definition matters more than the number, because three defensible readings give three
very different answers and only one of them is the programme's own.

| Reading | Count | Rows |
| --- | :---: | --- |
| **A — the roadmap's exit gate as written** *(recommended)* | **5** | `ENG-03`, `ENG-04`, `ENG-05`, `ENG-06`, `PLN-04` |
| B — A, plus the one asymmetry "detects a conflict" arguably reaches | 6 | + `PLN-08` |
| C — every AWD / ENG / PLN row COMPLETE | 17 | + `AWD-01`–`04`, `AWD-07`, `ENG-01`, `ENG-02`, `PLN-01`, `PLN-06`, `PLN-07`, `PLN-08`, `PLN-09` |

**A is recommended** because it is the standard Waves 0, 1 and 2 were closed under, and changing the
closure rule at the wave that happens to be current is how a programme loses the ability to compare
its own waves.

**B** exists because of a real asymmetry worth stating plainly: a *person's* leave now changes the
feasibility of a commitment already made (`PLN-09`), while a *machine's* breakdown does not
(`PLN-08`). A planner is told about one and never about the other. Whether the gate's "detects a
conflict" reaches that is a judgement — the conflicts the gate names, cross-project double-booking
and over-capacity, are detected — so it is offered rather than assumed.

**C** is Wave 10's job, not this one's. No wave in this programme has been held to it, and applying
it here would also mean re-opening Waves 1 and 2.

### The two recurring limits do not block this wave

Two gaps have been recorded on nearly every promoted row and re-argued from scratch each time. Both
are now placed, so that stops.

- **No exported document.** `actualOutput` is PARTIAL on seven planning rows: the figures are proven
  on screen and over the API, and no printable forecast, baseline, look-ahead or delay document
  exists. The roadmap assigns external communication, documents and governed files to **Wave 8**
  (`F-05`, `F-09`, `OUT-03`, `OUT-09`, `MAIL-02`, `MAIL-10`, `XOP-10`). It is not in Wave 3's gate
  and does not belong in this count.
- **Nothing notifies anybody who is not looking at the screen.** Six signals now: a conflict, a
  delay, an assessment, a recovery proposal, an activity losing ground, and one overspending its
  priced hours. Wave 3's scope says *"notify resource owners and Site of accepted assignments"* — an
  **assignment receipt**, which is proven (My Work, for responsibility, employee bookings, crew
  rosters and equipment custody), with the Site half sitting inside `ENG-06` and already counted.
  These six are **standing alerts**, a different thing, and none is named in the gate. They remain
  what the earlier reports called for: one shared notification/subscription authority built once,
  not six bespoke ones — and the time for it is when the sixth becomes the twelfth, not row by row.

Neither adds to the five. Both stay recorded, and neither should be re-litigated on the next
promotion.

### One finding that changes the shape of the remaining work

`ENG-04` is not a build. **Two independent submittal registers already exist:**

| | Route | Table | Identity |
| --- | --- | --- | --- |
| DocControl | `POST /doccontrol/submittals` | `aura_doccontrol_submittals` | reference · title · discipline · revision |
| Engineering | `POST /engineering/submittals` | `aura_engineering_submittals` | code · title · submittalType · discipline · status |

Two tables, two services, two controllers, one business object. The register currently scores
`DUPLICATED` and `WRONG_AUTHORITY` at zero, so this is invisible in every count above — which is
precisely what programme rule 3 (*preserve canonical authorities; do not copy business truth into
convenient duplicate fields*) exists to prevent, and what rule 8 (*investigate an UNVERIFIED leaf
before building*) exists to catch.

So the `ENG-04` slice begins by deciding which register is canonical for an approved **material**
submittal, and subordinating or retiring the other. Building a third path on top of two that already
disagree would be the worst available outcome, and it is the one that "just implement ENG-04" leads
to. `ENG-03` needs the same investigation first, though nothing yet suggests it is duplicated.

### The two gap records this wave owns beyond the pinned list

`F-07` (carried by `PLN-01`) and `F-08` (carried by `PLN-06`) describe one defect: *the planner
reaches a working solver but cannot build the WBS/resource inputs it needs on that screen.* A
WBS-linked task, dependencies, named resources, an availability conflict and a recipient handoff are
all now proven Auth-ON.

**This paragraph originally concluded that the gap records are therefore discharged. That was
wrong**, and §3 of the closure proof below corrects it. Those five items are the wave's scope
bullets, not either record's acceptance proof. `F-07` asks for cost continuity through the same
activity identity and `F-08` for the HR/Fleet availability bridge, and both are still open — so
both records remain **OPEN**. A record is discharged by its own acceptance proof or not at all.

Those same open items are what keep the carrying rows PARTIAL: `PLN-01` for cost continuity through
the same activity identity, and `PLN-06` for the Fleet/Assets half of the availability bridge.
Neither is a Wave 3 gate clause, and neither is netted against the gate.

### Sequence to closure

1. `PLN-04` — milestones. Nothing exists and a screen already offers one. The smallest of the five,
   and the only one that is purely a build.
2. `ENG-04` — decide the canonical submittal authority first, then prove the approved material
   submittal end to end.
3. `ENG-03` — technical query response; investigation first.
4. `ENG-05` + `ENG-06` — one slice: the multi-document controlled package, its named recipients,
   their acceptance and the retained receipt history. They share a mechanism, and closing them apart
   would build the recipient path twice.

Four slices. After them the gate is met and Wave 3 can be **proposed** for closure — a decision that
remains the programme owner's, as every promotion in this report has been.

**`MGT-13` is not among them.** The roadmap allocates it to Wave 9 (*Manager and CEO decision
acceptance*), and nothing in Wave 3's gate depends on a cross-project roll-up.

## Wave 3 Closure Proof

**Evidence only. Wave 3 is NOT declared closed by this section.** Closure is proposed on what
follows; the decision remains the programme owner's, as every promotion in this report has been.

**Checkpoint:** `0990bc8d` on `main` · **Proof date:** 16 September 2026

Every figure below was measured at this checkpoint. Nothing is carried forward from an earlier
iteration, and no capability was re-opened, re-proved or modified to produce it. Two claims made
earlier in this report did not survive being checked against the frozen records; both are corrected
in §3 rather than repeated.

### 0. Runtime binding — what this evidence was produced against

A proof against a stale build proves nothing, and this programme has hit exactly that three times.
So the binding is stated before the findings:

| | |
| --- | --- |
| HEAD | `0990bc8d` |
| Full workspace build | `pnpm build` — **27/27 tasks successful** |
| Newest built workspace package | 2026-09-16 **04:49:40Z** |
| API process start | 2026-09-16 **09:04:52Z** |
| API postdates every built package | **yes** |
| Database | local PostgreSQL, `e2e-disposable`, **332/332 migrations applied** |
| `aura_app` role | LOGIN=true, **SUPERUSER=false, BYPASSRLS=false** |

The verification database was rebuilt empty twice during this work and re-provisioned from nothing
both times, so the 332-migration chain is proven to land on an empty database rather than to have
accumulated through the wave.

### 1. The seven exit-gate clauses

The frozen gate, verbatim from [the roadmap](./remediation-roadmap.md):

> frozen scope reconciles to WBS and Sold projection; an approved engineering release reaches
> Site/Buyer; the planner allocates real resources, detects a conflict, accepts a recovery proposal
> and sends the resulting work to the responsible people; six pinned proofs are resolved.

| # | Clause | Carrier | Evidence at this checkpoint | State |
| --- | --- | --- | --- | :---: |
| 1 | Frozen scope reconciles to WBS and Sold projection | `AWD-05` COMPLETE | Project 360 maps the frozen item to a WBS node; the outbox reactor posts canonical SOLD quantity to the append-only ledger idempotently; a forged source/revision is ignored; an unknown item and a cross-project node are refused | MET |
| 2 | An approved engineering release reaches Site/**Buyer** | `ENG-06` COMPLETE | Design issues and is NOT on the distribution; Site Engineer, Project Engineer and **Procurement** each named in their own capacity; a bystander holding the identical permission refused; each accepts only for themselves; the conveyance closes only when the Buyer answers too | MET |
| 3 | The planner allocates real resources | `PLN-06` / `PLN-07` / `PLN-08`, all PARTIAL | employee, crew, vehicle, asset and governed shared-pool demand authored on a WBS-linked activity and committed into a held booking, Auth-ON | MET |
| 4 | …detects a conflict | `PLN-10` COMPLETE, `PLN-09` PARTIAL | cross-project double-booking and over-capacity surfaced as a derived verdict and never a stored one; an HR leave request drives through approval and the planning desk changes with it | MET |
| 5 | …accepts a recovery proposal | `PLN-15` COMPLETE | delay → impact → assessment → explicit hand-off → proposal → acceptance → governed programme; a stale basis is detected before acceptance; a rejected proposal changes nothing | MET |
| 6 | …and sends the resulting work to the responsible people | `AWD-06` COMPLETE, `PLN-07` / `PLN-08` | a named responsibility reaches that assignee's My Work; a held employee booking reaches the named person and their crew's roster; an equipment commitment reaches that machine's custodian, accepted or refused with a reason | MET |
| 7 | Six pinned proofs are resolved | §2 | all six COMPLETE | MET |

**Seven of seven met.**

Two honest qualifications, stated rather than smoothed over:

- **Clauses 3 and 4 are carried by rows that are still PARTIAL.** `PLN-06`, `PLN-07`, `PLN-08` and
  `PLN-09` remain PARTIAL for things this gate does not ask for — the Fleet/Assets availability
  bridge, and project access for an allocated non-member. The gate asks the planner to allocate real
  resources and to detect a conflict; both are proven Auth-ON. No clause here is being read as
  satisfied by a row's overall classification, and no row is being promoted by this section.
- **The scope bullet says "notify"; what is proven is in-system delivery.** The wave's scope list
  includes *notify resource owners and Site of accepted assignments*, and the work reaches the named
  person's My Work — it does not leave the system. The **exit gate's** own words are *sends the
  resulting work to the responsible people*, which the proven receipts satisfy. The gap between the
  scope bullet's verb and the gate's verb is real, and it is recorded as debt in §7 rather than
  claimed as met.

### 2. The six pinned proofs

| Pinned proof | Capability | Classification | Closed at |
| --- | --- | :---: | --- |
| `AWD-06` | Team and responsibility assignment | **COMPLETE** | iteration 3 |
| `PLN-04` | Milestones | **COMPLETE** | iteration 19 |
| `ENG-03` | Technical query response | **COMPLETE** | iteration 20 |
| `ENG-04` | Approved material submittal | **COMPLETE** | iteration 21 |
| `ENG-05` | Document transmittal | **COMPLETE** | iteration 22 |
| `ENG-06` | Release notification to site | **COMPLETE** | iteration 22 |

**Six of six resolved. No capability remains for this wave.**

Register classification at this checkpoint, recounted from the 180 leaves rather than read off the
stored totals: **COMPLETE 17** · PARTIAL 89 · UNVERIFIED 49 · WRONG_BEHAVIOR 13 · DISCONNECTED 8 ·
BACKEND_ONLY 4. The recount agrees with the stored totals block exactly.

The seventeen: `AWD-05` `AWD-06` `ENG-03` `ENG-04` `ENG-05` `ENG-06` `PLN-02` `PLN-03` `PLN-04`
`PLN-05` `PLN-10` `PLN-11` `PLN-12` `PLN-13` `PLN-14` `PLN-15` `PLN-16`.

### 3. Gap-record reconciliation — including two corrections

| Record | Carrier | Register status | Verdict |
| --- | --- | :---: | --- |
| `J2-02` — mapping UI unavailable | `AWD-05` | **CLOSED_VERIFIED** | closed; the Auth-ON browser maps the final Tender item to a WBS node |
| `J2-03` — SOLD projection missing | `AWD-05` | **CLOSED_VERIFIED** | closed; API journey and browser poll the ledger to SOLD = frozen quantity |
| `F-07` — WBS-linked activities still need connected resources, progress and cost | `PLN-01` PARTIAL | **OPEN** | **still open against its own acceptance proof** |
| `F-08` — planner cannot author task resource requirements | `PLN-06` PARTIAL | **OPEN** | **still open against its own acceptance proof** |

**Correction 1 — `F-07` and `F-08` are not discharged.** Iteration 21's remainder audit stated that
their resolution is *"WBS-linked task, dependencies, named resources, availability conflict and
recipient handoff"* and that both records are therefore discharged. Checked against the frozen
records, that is wrong on both counts. The quoted phrase is not from either record; it paraphrases
the wave's scope bullets. Their actual frozen `acceptanceProof` fields read:

- `F-07`: *"Continue the established WBS identity into employee/equipment demand, quantity-driven
  progress and **cost**; prove the planning and delivery views reconcile without re-entry."*
- `F-08`: *"Connect **HR/Fleet availability** so a leave or breakdown changes the feasibility of an
  existing commitment without re-entry."*

Cost continuity through the same activity identity and the Fleet/Assets availability bridge are both
open — this report says so itself, in the same paragraph that declared the records discharged. Two
records cannot be discharged by criteria they do not contain. **Both remain OPEN**, and the register
was never told otherwise: `master-register.json` carries them as `OPEN` at this checkpoint, so no
generated artifact ever asserted the closure. The overstatement was in prose only — in this
report's own remainder audit, and in the generated `verification-queue.md` paragraph that repeated
it. **Both are corrected in this checkpoint.**

**Correction 2 — this does not change the gate.** The frozen exit gate has seven clauses and none of
them is *"the wave's gap records are closed"*. `F-07` and `F-08` are severity CRITICAL and HIGH
against `PLN-01` and `PLN-06`, both of which the roadmap keeps open past this wave. They are carried
forward as open records, counted honestly, and not netted against the gate.

**Correction 3 — both texts are now repaired, at the generator.** `verification-queue.md` is
generated, so the edit was made in `build-register.mjs` and the register rebuilt; editing the
markdown alone would have been reverted by the next rebuild. The rebuild changed that one paragraph
and nothing else — 180 capabilities, 46 gaps, and every classification identical — so the
correction carries no reclassification hidden inside it. The remainder audit above is corrected in
place, and says plainly that it was wrong rather than quietly reading as though it never claimed
otherwise.

### 4. Connected journey — what it shows, and what it does not

Programme rule 1 requires the same awarded job to be carried through rather than a collection of
independently conjured projects. That is enforced in the fixtures themselves, not left to
convention.

`apps/api/test/helpers/governed-delivery-fixture.ts` builds the governed commercial prerequisite —
**a tender that was priced, quoted, approved and awarded, the contract it produced, and the project
that contract created, with the frozen award items intact** — and states its own rule in its header:

> Nothing downstream — a quantity, a work package's progress, an activity's progress — may be proven
> against a project conjured without it, because the frozen item is what makes "installed against
> WHAT" answerable.

**Four specs consume that fixture rather than inventing a project:** `quantity-ledger`,
`planned-output` (`PLN-11`), `activity-progress` (`PLN-12`) and `forecast-completion` (`PLN-16`).

These chains are each proven end to end on a single project within a single spec:

| Chain | Proven in |
| --- | --- |
| awarded tender → contract → project → frozen item → WBS → SOLD ledger → installed quantity | `quantity-ledger` |
| …→ priced productivity → planned output | `planned-output` |
| …→ measured versus declared activity progress | `activity-progress` |
| …→ baseline → progress → forecast finish with confidence | `forecast-completion` |
| project → WBS → schedule → dependencies → milestone → achievement → the owner's My Work | `project-milestones` |
| drawing → submit → review → approve → transmit → named recipients → per-person receipts | `transmittal-receipt` |
| MAR raise → submit → decision recorded against the consultant → the proposer's My Work | `material-approval` |

**What this does not show, said plainly: no single specification walks all three gate arcs — frozen
scope, engineering release, and the planning chain — on one project in one run.** The arcs are proven
individually, and the commercial arc is genuinely shared by the four specs above through the frozen
fixture rather than re-created in each. A single end-to-end spec spanning all three does not exist at
this checkpoint, and this proof does not claim one. `j2-j6-delivery-audit.e2e-spec.ts` is a J2–J6
characterization, not that spec, and it is one of the twelve failing files in §6.

### 5. Wave 2 frozen authority — consumed, not re-derived

Wave 2 closed on a frozen award basis. Wave 3's obligation is to **consume** it rather than
re-compute it. That is what the fixture above enforces at the test boundary; inside the product, it
shows up in the mechanisms:

- `AWD-05` derives immutable source lineage **from the persisted handover snapshot**, and a forged
  source or revision supplied in the request is ignored rather than trusted.
- `PLN-11`'s frozen productivity basis is populated **per awarded line at handover** and carries no
  money — rates stay behind `tendering.internal-pricing.access`.
- The SOLD projection is posted by a reactor from the frozen snapshot, idempotently, into an
  append-only ledger with a deterministic source key.
- `ENG-05`'s package items snapshot number, title and revision **by value** at conveyance time, so a
  conveyance cannot later claim a revision the controlled record never carried.

**Nothing in Wave 3 re-derives a commercial figure that Wave 2 froze.**

### 6. Regression and runtime evidence

All measured at `0990bc8d`, against the runtime bound in §0.

| Gate | Result |
| --- | --- |
| `pnpm build` | **27/27 tasks successful** |
| `pnpm typecheck` | **51/51 tasks successful** |
| `pnpm test` (every workspace package) | **51/51 tasks successful** |
| API unit + all fitness gates (`vitest run src/`) | **541 passed**, 4 skipped · 69 files passed, 1 skipped |
| API e2e (`vitest.config.e2e.ts`) | **59 files passed, 12 failed** (71) |
| Auth-ON browser, the five Wave 3 specs | **5 passed** in one run, 58.8s |
| `pnpm lint` | **0 errors**, 683 warnings — unchanged from the pre-wave baseline |
| Migration policy | **332 files, sequential, `@DOWN` present from 137 on** |
| RLS fitness | **265 tenant-scoped tables · enabled 265 · forced 265 · with-policy 265** |
| Cross-tenant isolation under a non-bypass role | **15 assertions passed** |

#### The twelve failing e2e files

`account-snapshot` · `c4-certification` · `c5-cost-ledger.pg` · `c6-change-control.pg` · `chains` ·
`crm-qualification-at-award` · `sales-mutation-release-proof` · `service-scope-closure` ·
`site-daily-report-uniqueness` · `tender-lifecycle` · `tender-pricing-governance` ·
`tender-submission`

**All twelve are pre-existing, and none carries a Wave 3 row.** This is measured rather than
assumed: the identical twelve were captured before this wave's engineering work, three of them were
re-confirmed failing against a `git stash` of the work in progress, and the set did not grow. The
passing count rose from 58 to 59 as the transmittal suite was added.

`service-scope-closure` was checked individually, because this wave edited one line of its permission
vocabulary. It fails inside its own `beforeAll` on `expect(auth.enabled).toBe(true)` — its harness
never sets the JWT secret — which is neither the edit nor anything to do with material approvals.

#### The browser runs, in one invocation

| Row | Spec | What it proves on screen |
| --- | --- | --- |
| `PLN-16` | `forecast-completion` | baseline, planned and forecast kept visibly apart |
| `PLN-04` | `project-milestones` | the committed date holds while the plan slips; sign-off against open work shows both facts |
| `ENG-03` | `technical-query-response` | the answer's author is named; a silent replacement refused; a self-acceptance refused |
| `ENG-04` | `material-approval` | "decision recorded by"; an as-noted approval kept unfinished |
| `ENG-05` / `ENG-06` | `transmittal-receipt` | per-person distribution; one answer is not receipt; the act offered only to somebody addressed |

Both BFF empty-body defects found during this wave are fixed **in the delivered code and exercised by
these passing runs**, not merely recorded: transmittal `acknowledge` in `243b4dcc`, which the
transmittal run clicks through, and technical-query `close` in `427debf3`, which the ENG-03 run
clicks through. A browser path found broken during a proof is not left broken and counted as proven.

#### What the RLS proof is and is not

The live RLS verification is a strong **additional** layer: 265 tenant-scoped tables, every one
ENABLE'd and FORCE'd with a policy, isolation verified under a role that cannot bypass it, covering
the tables this wave added rather than asserting them from the migrations that wrote them.

**It is not a substitute for project-scope, functional or browser proof.** Tenant isolation says
nothing about whether a given role may perform a given act, whether the right recipient was reached,
whether a receipt is somebody's own, or whether a screen tells the truth. Those are proven
separately, above, and the RLS figures are not permitted to stand in for any of them.

### 7. Debt and findings carried out of this wave

None of these is an exit-gate clause. All are recorded so that closure does not bury them.

**Technical debt**

- `sender` on a transmittal remains free text. `ENG-06` asks for a *separate* issuer, proven by the
  issuer not being on the distribution; a canonical sender identity is debt, not a claim.
- No exported or printable document on the planning rows or the transmittal — `actualOutput` is
  proven on screen and over the API.
- **Nothing notifies anybody who is not looking at a screen.** Seven such signals are now owed:
  conflict, delay, assessment, recovery proposal, an activity losing ground, one overspending its
  priced hours, and a milestone crossing its committed date. One shared notification authority, built
  once — not seven.
- Finish-to-start dependencies only; one working calendar per project.
- Several activities on one work package each inherit its whole sold quantity — **these must not be
  summed by any rollup** until an apportionment authority exists.
- Accepting a recovery does not prompt a re-baseline.
- A requirement that has ever carried a booking cannot be removed from a plan (`ON DELETE RESTRICT`).
- ~~The `verification-queue.md` paragraph asserting `F-07` / `F-08` discharge needs the correction
  in §3.~~ Corrected at the generator; see §3, correction 3.

**Defects found and deliberately not fixed here**

- Four actor columns are still typed `uuid` and will fail on their own approve paths:
  `hr_expense_claims`, `hr_staff_advances`, `hr_timesheets` and `subcontracts_variations`, all
  `approved_by`. The same defect class as migrations 0142, 0150 and 0331 — the third, fourth and
  fifth recurrence of one mistake.
- **Site can record an installation without proving the installed material is the approved one.** A
  discovered gap that no wave currently owns. It is not assigned to Wave 5 merely because Site
  appears in it.

**Carried to Wave 4**, whose frozen scope already names them: canonical procurement material/product
identity; PR/PO lines; `BUY-01` material requisition lines; make/model identity; selected-line
continuity through RFQ → PO → GRN → stock → site issue; and exact MAR-to-purchased-material
applicability.

### 8. What closing Wave 3 would and would not mean

**It would mean** that the bounded *award → mobilisation → engineering → connected planning* journey
meets the exit gate the roadmap wrote for it before any of this work began, with all six pinned
proofs resolved and no capability remaining in the wave.

**It would not mean:**

- that AURA is functionally complete or production ready — **163 of 180 leaves are not COMPLETE**;
- that the PARTIAL rows inside Wave 3's own groups are finished — `PLN-01`, `PLN-06`–`PLN-09`,
  `AWD-01`–`AWD-04`, `AWD-07`, `ENG-01` and `ENG-02` all remain open against later waves;
- that `F-07` and `F-08` are discharged — §3 shows they are not;
- that procurement, site execution or commercial delivery are proven — Waves 4 to 10 are untouched;
- that the twelve failing e2e files are acceptable — they are pre-existing and out of this wave's
  scope, and they are still owed.

**A capability remainder of zero is an input to closure, not closure itself.** The gate is what
closes the wave, and the gate is what §1 addresses.

### 9. Closure decision

**Wave 3 is CLOSED / VERIFIED for its bounded journey.** Decided by the programme owner on
16 September 2026, on the evidence in §§0–8 of this proof, at checkpoint `a9c19c05`.

The decision was the programme owner's alone, as every promotion in this report has been. This
section records it; it does not make it.

#### What was closed

The bounded *award → mobilisation → engineering → connected planning* journey, against the exit gate
the roadmap froze before any of this work began: **seven of seven clauses met, six of six pinned
proofs resolved, no capability remaining in the wave.** Seventeen of the 180 leaves are COMPLETE.

Twenty-two iterations, each promoted only after domain rules, API, permissions, UI, actual output,
browser usability and cross-role handoff were proven — and several of them only after a promotion was
refused and the slice sent back.

#### What closing this wave does NOT close

Stated here so that the closure cannot later be read as more than it is:

- **AURA is not functionally complete and not Production Ready.** 163 of 180 leaves are not COMPLETE.
  Waves 4 to 10 are untouched: procurement, site execution, stores, subcontracts, HR, finance,
  commercial and closeout are unproven as journeys.
- **`F-07` and `F-08` remain OPEN — and Wave 3 owns them.** The roadmap's scope table names them as
  this wave's primary gap ownership alongside `J2-02` and `J2-03`. The other two closed; these two did
  not. They stay open on `PLN-01` and `PLN-06` for cost continuity through the same activity identity
  and the HR/Fleet availability bridge, at severity CRITICAL and HIGH. This is the one place where the
  wave closes without finishing something it was given, and it is stated rather than folded away:
  neither record is an exit-gate clause, the gate is what closes a wave, and neither was netted
  against it to reach this decision (§3). They do not transfer to Wave 4 by being left behind — they
  remain Wave 3's, owed.
- **The PARTIAL rows inside this wave's own groups stay open:** `PLN-01`, `PLN-06`–`PLN-09`,
  `AWD-01`–`AWD-04`, `AWD-07`, `ENG-01` and `ENG-02`.
- **Twelve e2e files still fail.** They are pre-existing, none carries a Wave 3 row, and the set did
  not grow during the wave — but they are owed, not forgiven.
- **No arc-spanning specification exists.** The three gate arcs are proven individually, not in one
  run on one project (§4).
- **The debt inventory in §7 travels with the closure**, not behind it: seven notification signals
  owed to one shared authority; four `uuid` actor columns that will fail on their own approve paths;
  activities that must not be summed by any rollup until an apportionment authority exists; free-text
  `sender`; no exported document; and the unowned gap where Site can record an installation without
  proving the material was the approved one.

#### The standard this closure was held to

- A zero capability remainder was treated as an **input** to closure, never as closure itself. The
  gate closed the wave.
- The live RLS verification — 265 tenant-scoped tables, enabled, forced and policied — was counted as
  an additional layer and **not** as a substitute for project-scope, functional or browser proof.
- Every figure was bound to a running API that postdates every built workspace package, because this
  programme was bitten three times by proofs run against a stale `dist`.
- Two claims in this report did not survive being checked against the frozen records and were
  corrected before the decision, not after it (§3).

**Next:** Wave 4 — supplier decision and material delivery. It is NOT STARTED. Closing Wave 3 does not
start it, and nothing in Wave 4's scope may be assumed from this closure.

## Programme state

- **Wave 0 — CLOSED / VERIFIED**
- **Wave 1 — CLOSED / VERIFIED**
- **Wave 2 — CLOSED / VERIFIED**
- **Wave 3 — CLOSED / VERIFIED** for its bounded award-to-connected-planning journey
- **AURA overall — still OPEN / NOT Functionally Complete / NOT Production Ready**
