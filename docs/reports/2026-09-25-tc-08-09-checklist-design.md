# TC-08 / TC-09 — the approved checklist: what exists, measured, and the smallest design

2026-09-25. Design only — **no code changed.** Written against the checklist contract the programme
owner froze, measured against the running API with auth on, PostgreSQL rebuilt from zero, and the
shipped roles (`u-e2e-tc` commissioning engineer, `u-e2e-qaqc` / `u-e2e-qaqc2` QA/QC).

## The contract (frozen)

Quality owns the ITP and its acceptance criteria; T&C executes tests and does not write the criteria.

1. **Tenant-level system template library** — reusable, bound to a canonical `ELV_SYSTEMS` id, with a
   version, test points and acceptance criteria.
2. **Project-specific ITP — Quality authority** — Quality selects a template, reviews and adapts it to
   the project's specification, and approves it through a workflow and its permissions.
3. **Approved immutable revision** — system id, revision, points and criteria; never silently changed.
4. **T&C execution** — a commissioning record is created from the approved revision and records each
   point's result, evidence, defects and retests.

Rules: no automatic matching of free-text `discipline` to `ElvSystem`; a template is not a project
approval; a later template change does not alter existing test records; T&C cannot add a point and
count it as part of the approved checklist without a governing Quality act; a system is not PASS while
a mandatory point is unexecuted or failed; **no invented technical templates for every system** — prove
the library structure and its coverage, use genuinely approved points in fixtures, and show systems
without an approved template as not ready.

## What exists — measured

```
T&C registers a CCTV system              201  system=cctv
T&C TYPES its own point and criteria     201  "Works" — expected "It works"
T&C passes it                            201  pass
workspace                                eligible=true  pointsTotal=1  itpRequirements=[]  blockers=[]
T&C COMMISSIONS the system               200  commissioned

QA/QC raises an ITP                      201  discipline="CCTV"  system=null  revision=null  draft
QA/QC activates it (same person)         200  active  activatedBy=u-e2e-qaqc
```

**A system can be commissioned on one point its own tester typed.** Everything the contract governs is
absent at the root:

| Contract layer | Today |
|---|---|
| Template library | Does not exist. |
| Project ITP bound to a system | `aura_quality_itps` carries a free-text `discipline` and no system; no revision, no template lineage. Its points store `result` — execution recorded on the plan. |
| Approval | `activate` by any holder of `quality.itp.activate`, including the author. No review step, no immutability. |
| T&C executes approved points | `POST commissioning/records/:id/test-items` lets the T&C engineer type `pointNo`, `description` and `expected` — the acceptance criterion. The link to Quality (`commissioning-itp-link`) is optional, made by T&C, and gates nothing. |
| PASS rule | Commissioning needs "every point passed" — over the points T&C chose to create. One is enough. |
| No discipline matching | Honoured: the code already refuses to match `discipline` to `ElvSystem` (commissioning-itp-link, asbuilt-link) and reads Quality through an evidence port. |

**What is already right and is kept:** the commissioning record carries a canonical `system`; each test
point keeps an append-only run history (every fail and every retest — TC-09's lineage); a failed point
raises a punch item that blocks commissioning (TC-08's loop); witness and signature evidence (XOP-12).

**What depends on today's ITP and must not break:** its point results gate WBS completion
(`11012c56`, open hold points block a work package) and are read by commissioning readiness. Those
are *installation inspection* plans — hold and witness points QA/QC executes on site.

## The smallest design

**S1 — the library.** `aura_quality_itp_templates`: tenant, `system` (an `ELV_SYSTEMS` id, never
`other`), `version`, title, points (stable `code`, activity, method, acceptance criterion, `mandatory`),
`status` draft → published → retired. Publishing freezes that version; a change is a new version.
Held by QA/QC (`quality.itp-template.manage`). **The product ships no templates** — the library starts
empty and every system reads *no approved template* until Quality publishes one.

**S2 — the project ITP revision.** The existing ITP gains a `system`, a `revision`, a parent, and its
template lineage (`source_template_id`, `source_template_version`). An ITP **with a system** follows a
governed lifecycle: draft (Quality adapts the copied points) → submitted → **approved by a different
QA/QC person** → immutable; a change is the next revision, which supersedes it. PostgreSQL refuses an
update to an approved revision's system, points or criteria (a trigger, as in 0387). An ITP **without**
a system is today's installation-inspection plan and keeps exactly its current behaviour, WBS gate
included.

**S3 — T&C executes the approved points only.** A commissioning record is **bound** to the approved
ITP revision for its project and its `system` — equality of canonical ids, never text. Binding
instantiates the test points from the revision: code, activity, acceptance criterion and `mandatory`
copied read-only, each carrying its revision-point lineage. Typing a test point on a bound record is
refused; a missing point is Quality's to add, by a new revision. Execution, runs, retests, punch
items and evidence are today's, unchanged. A record stays bound to the revision it started from — a
newer revision or template never rewrites it (rule 3).

**S4 — the PASS rule.** A system may be commissioned only when it is bound to an approved revision,
every **mandatory** point's latest run is a pass, no point is failing, and no punch item is open.
Readiness and the workspace say *no approved checklist* when unbound, instead of `eligible=true`.

**S5 — coverage.** Per tenant: each `ELV_SYSTEMS` id → published template or not. Per project: each
system in commissioning scope → *no approved template* / *template, no approved project ITP* /
*approved revision N* / *bound and executing*. Unready is shown, never hidden.

**S6 — screens and proof.** Quality: template library, project ITP revision (adapt, submit, approve).
T&C: bind the approved revision; points arrive from it; no add-point form on a bound record. Proof with
shipped roles in a browser on PostgreSQL: QA/QC publishes a template from genuinely approved points,
adapts it into a project revision, a second QA/QC approves it (the author refused); T&C binds, is
refused typing a point, fails a point → punch → correction → retest → pass (history kept), cannot
commission while a mandatory point is open, then commissions; a later template version and a later
ITP revision leave the executed record unchanged; SQL tests for the immutability triggers. Then
TC-08, TC-09 and TC-11 are assessed independently; TC-10 (the certificate) is its own slice.

## Decisions needed

1. **One ITP authority, extended** — system checklists are the existing ITP entity with a `system` and
   the governed revision lifecycle, while system-less ITPs stay exactly as they are *(recommended)* —
   or a separate "system test plan" entity beside it?
2. **Within Quality, the preparer is not the approver** of a project ITP revision — two QA/QC people,
   as NCR verification already requires *(recommended)*?
3. **Unbound records in progress** can no longer be commissioned until bound to an approved revision;
   already-commissioned records are untouched *(recommended)*?
4. **A newer revision reaches only new records** — an executing record stays on its revision, and
   moving it is a later, explicit slice *(recommended, smallest)* — or should adopting a newer revision
   be possible now?

None of these changes who owns what. Quality owns the criteria; T&C executes them.
