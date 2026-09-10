# §22 Step 12 — Project 360 UI (the planning workspace)

**Status:** complete at the component + build boundary. The planning workspace runs a plan, shows the
proposal and its diff to the current plan, surfaces the cross-project conflict, and accepts or
discards — against the real Step 11 endpoints. The interactive, seeded browser walkthrough is Step 14.

## What landed

**BFF routes (`apps/web/app/api/projects/…`)** — thin proxies to the Step 11 API, following the
existing `apiFetch`/`authHeader` pattern and forwarding the API's status (so a 400 from the governance
refusal reaches the UI as a 400, not a generic 500):

```
GET  /api/projects/schedules/[projectId]/planning-runs     list a schedule's runs
POST /api/projects/schedules/[projectId]/planning-runs     run the solver, persist a proposal
GET  /api/projects/planning-runs/[runId]                    one run + its comparison
POST /api/projects/planning-runs/[runId]/accept            promote ({acknowledgeReason?})
POST /api/projects/planning-runs/[runId]/discard           reject ({reason})
```

**`components/planning-run-panel.tsx`** (client) — the workspace:
- a **Run plan** button that posts a run and renders the returned proposal + comparison;
- verdict badges — *no conflict / conflicted*, *coverage complete / partial*, *established / not
  established* — coloured by state (good / warn / bad), never collapsing UNKNOWN into either;
- a **resource conflicts** list: each conflicted or unknown resource with its reason, capacity vs peak
  demand, and the specific conflict days — this is where the cross-project crane clash shows;
- a **what accepting would change** table: per task, current dates → proposed dates and a change badge
  (Unchanged / Moved / Newly placed / Unplaceable), plus current-finish → proposed-finish and a moved
  count;
- **Accept** and **Discard**. Accept is disabled until an acknowledgement is typed when the proposal
  is **not established** — the UI mirror of the domain's governance, so the refusal is explained before
  it happens rather than returned as an error;
- a **run history** strip (status dot + verdict + any acknowledgement).

**`app/projects/schedule/page.tsx`** — renders the panel as a "Resource planning" section when a
project is selected (`?projectId=`), below the Gantt, on the page Project 360 already links to as
"Plan & schedule".

## Verified

- `tsc --noEmit` clean for `@aura/web`.
- `pnpm --filter @aura/web build` — compiled successfully; all five new routes and the schedule page
  are registered in the route manifest.

## Deliberately deferred

- The interactive walkthrough (run → conflict → accept, two projects one crane) against the live API
  with seeded data is **Step 14 — browser evidence**, which owns that scenario end to end.
- Resource labels are shown as their typed reference (`asset · 1a2b3c4d`) rather than a fetched name;
  wiring the `RESOURCE_LABEL_RESOLVER` to HR/Fleet/Assets for display is a later nicety, and showing
  the reference is the honest interim (never a fabricated name).
- Permissions on these endpoints/actions are Step 13.

## Next in the approved sequence

Step 13 — permissions / events / audit: who may run, accept and discard; the events are already
emitted (Step 11), and this adds the guards and the audit trail around the governed acts.
