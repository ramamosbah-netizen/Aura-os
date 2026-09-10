# §22 Step 13 — permissions / events / audit

**Status:** complete. The three governed planning acts are now guarded by explicit permissions, emit
domain events (since Step 11), and write an immutable audit entry.

## Permissions

Explicit `@Permissions(...)` on the planning endpoints, so the permission is intentional rather than
the guard's route-derived default (which would have produced `projects.schedule.planning-runs`):

| Endpoint | Permission |
|---|---|
| `POST schedules/:projectId/planning-runs` (run) | `projects.schedule.plan` |
| `GET  schedules/:projectId/planning-runs` (list) | `projects.schedule.read` |
| `GET  planning-runs/:runId` | `projects.schedule.read` |
| `POST planning-runs/:runId/accept` | **`projects.schedule.accept`** |
| `POST planning-runs/:runId/discard` | `projects.schedule.plan` |

**Accept is a distinct permission from plan** — running a proposal and PROMOTING one to the current
plan are different privileges, so a narrower role can be granted the first without the second. Both
fall under a `projects.*` grant, which the delivery/PM roles already hold (`access.service.ts`), and
the matcher treats `projects.*` as covering the three-segment `projects.schedule.accept`
(`permissionMatches` test). Discard is part of planning, not the consequential promote, so it shares
`plan`. Enforcement engages only once a verifier is configured; the dev/in-memory default passes
through, exactly as every other seam does.

## Events (already emitted in Step 11, confirmed here)

`SCHEDULE_EVENT.planningRan`, `.proposalAccepted`, `.proposalDiscarded` — appended to the event store
on each act, aggregate `projects.schedule`/`<scheduleId>`, payload carrying the run id and verdict.

## Audit

`ScheduleService` now injects `AuditService` (optional, like every other seam) and writes an immutable
`aura_audit_log` entry for each governed act, alongside the event:

| Act | module | entityType | entityId | action | changes |
|---|---|---|---|---|---|
| run | `projects` | `planning_run` | runId | `ran` | feasibility, coverage, established |
| accept | `projects` | `planning_run` | runId | `accepted` | established, acknowledgeReason |
| discard | `projects` | `planning_run` | runId | `discarded` | reason |

Each carries `{ projectId, scheduleId, source }` in metadata, so the audit browser can filter the
planning trail by module/entity and trace a run back to its project and schedule. The acknowledgement
recorded when a not-established plan is accepted is in the audit `changes` — the governed overrun is
not only permitted and evented but permanently recorded with its reason and its actor.

## Proven

- `schedule-planning.service.test.ts` (+1, now 7): a mock `AuditService` receives a
  `projects / planning_run / ran|accepted|discarded` entry for each act. Projects suite 423 passed.
- `@aura/projects` typecheck clean; API `tsc` clean with the decorators.
- Wildcard coverage confirmed against `shared/src/identity/access.ts` (`projects.*` ⊇
  `projects.schedule.accept`).

## Next in the approved sequence

Step 14 — browser evidence: the two-projects-one-crane walkthrough live in the app, against the
running stack and the local database, with the run → conflict → governed accept visible on screen.
