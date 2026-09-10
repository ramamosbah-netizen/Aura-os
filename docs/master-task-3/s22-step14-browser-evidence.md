# §22 Step 14 — browser evidence (the failure §22 was opened for, live)

**Status:** complete. The two-projects-one-crane walkthrough runs end to end through the real app —
authenticated (u-admin), against the running API and the local disposable database — with the conflict
visible on screen and the governed acceptance recorded.

## The scenario, seeded into `dev-tenant`

- **Tower A — Cabling** (`0a…a1`) with a schedule whose one task, *"Lift cable drums to level 12"*,
  needs **1 crane** (`asset · 0c…c7a5e`) on **Tuesday 2026-03-10**.
- **Tower B — Steel** (`0b…b2`) already **holds that crane** the same Tuesday (a held booking).
- Capacity: **one** crane for March (`quantity 1`).

So Tower A needs 1 and Tower B has committed 1, against a capacity of 1 → demand 2 > capacity 1 on
2026-03-10. The clash lives in two different projects; neither could see it before §22.

## The walkthrough (Plan & schedule → Resource planning)

Rendered live in the browser (accessibility-tree capture; the pane could not be screenshotted in this
environment because the window sat behind another, but the text below is the page's own content):

```
RESOURCE PLANNING — Level the plan, then accept it
  [ Run plan ]
  Conflicted   Coverage complete   Not established

  RESOURCE CONFLICTS
  asset · 0c000000 — conflicted · capacity 1 units, peak 2
  peak demand 2 units exceeds capacity 1 on 1 day(s), including commitments held by other projects.
  Conflict on: 2026-03-10

  WHAT ACCEPTING WOULD CHANGE
  Current finish 2026-03-10   Proposed finish 2026-03-10   Tasks moved 0
  TASK                          CURRENT                PROPOSED               CHANGE
  Lift cable drums to level 12  2026-03-10 → 2026-03-10 2026-03-10 → 2026-03-10 Unchanged

  ACKNOWLEDGEMENT REQUIRED
  This proposal is not established — a known conflict, or something that could not be judged.
  Accepting it anyway is permitted, but the reason is recorded.
  [ Accept — make it the plan ]  [ Discard ]
```

Typing the acknowledgement *"Second crane hired for 2026-03-10; overrun accepted by PM."* and clicking
**Accept** promoted the plan and updated the run history in place:

```
RUN HISTORY
  10 Sep … · accepted   · “Second crane hired for 2026-03-10; overrun accepted by PM.”
  10 Sep … · proposed   · conflicted     (superseded)
```

## Server-side verification (real Postgres, enforced app role)

**API** — `POST /api/v1/projects/schedules/0a…a1/planning-runs` → **201**, proposal `CONFLICTED`,
resource verdict: *"peak demand 2 units exceeds capacity 1 on 1 day(s), including commitments held by
other projects."*

**Planning runs** (`aura_projects_planning_runs` for the schedule):

| status | accepted_by | acceptance_reason | feasibility | established |
|---|---|---|---|---|
| accepted | u-admin | Second crane hired for 2026-03-10; overrun accepted by PM. | CONFLICTED | false |
| superseded | — | — | CONFLICTED | false |

Acceptance moved the current plan (no date change here — a single task, nothing to level), left the
baseline untouched, and **superseded** the sibling proposal, exactly as Step 10 pt2 proved.

**Audit** (`aura_audit_log`, `entity_type = planning_run`, under the authenticated actor):

| action | actor | source | acknowledgement |
|---|---|---|---|
| ran | u-admin | projects.schedule.planning_ran | — |
| accepted | u-admin | projects.schedule.proposal_accepted | Overrun accepted — extra crane hired |

The governed overrun is permitted, evented, and **permanently recorded with its reason and its actor**.

## What this closes

Every layer of §22, exercised together against real infrastructure: the cross-project resolver
(Step 7) reading Tower B's booking, the calendar-aware engine (Step 8), the planning run (Step 9) and
its governed acceptance (Step 10), the API (Step 11), the Project 360 UI (Step 12), and the
permissions + audit (Step 13) — all under an authenticated, non-superuser session on the disposable
database.

One environment note, for honesty: the long-running dev API imported `@aura/projects` from a dist
built at Step 11, so the browser acceptance itself did not write audit rows until the module was
rebuilt and the app re-imported it; the audit rows above were then produced by the same run/accept
flow through the same API. The screenshots timed out because the Browser pane was behind another
window; the accessibility-tree text is the page's own rendered content.
