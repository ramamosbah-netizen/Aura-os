# §22 Step 8 — calendar integration (complete; no deferred DB proof)

**Status:** complete and proven at the unit boundary. Unlike Step 7, nothing here waits for the
disposable database: the calendar bridge is proven against the real `@aura/core` `CalendarService` in
its in-memory mode, which is the same code path the app uses, minus Postgres.

## What Step 8 is

Design Gate §5.2 #5: the working calendar is **consumed** (`@aura/core`), not assumed — otherwise a
plan, or a resource conflict, works through Fridays and Eid. Design Gate §5.1: the pure engine must
never import a calendar service; it receives resolved facts. Step 8 satisfies both at once by making
the calendar a **value the engine can ask a synchronous, total question of**, and putting the impure
fetch behind a bridge.

Before Step 8, the Step 6/7 day iteration walked raw calendar days: two projects holding one crane on
a Friday nobody works read as a conflict, and a booking spanning a weekend could be dragged to
UNKNOWN because no capacity was declared on days no one works.

## What landed, and where

| Piece | File | Role |
|---|---|---|
| Calendar as data | `modules/projects/src/domain/working-calendar.ts` | `WorkingCalendar` predicate, `ALL_DAYS_WORKING`, `workingCalendarOf`, `eachDay`, `workingDaysInRange` — pure, leaf, no idea a database exists |
| Bridge | `modules/projects/src/resource-calendar.ts` | `resolveWorkingCalendar(source, calendarId, interval)` — consumes `CalendarService` (weekends, holidays, Ramadan adjustments) into a `WorkingCalendar`; structurally typed on `WorkingHoursSource`, so no Nest coupling |
| Threaded through | `resource-facts.ts`, `resource-booking.ts` | `resolveResourceLoad`, `assessResourceAcrossProjects`, `dayLoadsForBooking` and `assessBooking` all take a `WorkingCalendar`, defaulting to `ALL_DAYS_WORKING` |

The default is the key to non-disruption: **passing no calendar means every day is worked** — a
caller's assertion, exactly as the planner treats an empty `nonWorkingDays`. Every pre-Step-8 caller
and every Step 6/7 proof behaves identically; the 33 Step 6 and 17 Step 7 tests pass unchanged.

## Disciplines proven (9 new unit tests, 396 projects tests total)

- `working-calendar.test.ts` (5): `ALL_DAYS_WORKING`; `workingCalendarOf` on/off; timestamp
  normalises to its day; `eachDay` inclusive and month-spanning; `workingDaysInRange` drops off days,
  keeps order, defaults to all-working.
- `resource-calendar.test.ts` (2): against the real `CalendarService` in-memory — weekends off,
  holiday off, a Ramadan-adjusted day (6 hours, > 0) still on; a weekend-only interval resolves to no
  working days.
- `resource-facts.test.ts` (+2): a clash that only overlaps on a non-working day is **not** a
  conflict (calendar-blind it is); a weekend no longer drags a booking to UNKNOWN when capacity is
  declared only on working days.

`ResourceFeasibility` remains defined once; no vocabulary was duplicated. Typecheck clean.

## What is intentionally NOT here

- **The tenant's actual calendar id.** Choosing which calendar a project's resources are planned
  against, and fetching it, is a wiring concern for the planning run (Step 9) and the API (Step 11).
  Step 8 delivers the plumbing and the bridge; the composition root supplies the id.
- **Commit-time judgement.** `commitBooking`'s creation-validity snapshot is assessed against the
  availability the caller supplies at commitment; Step 8 changes the CURRENT-feasibility path (the
  resolver and `assessBooking`), which is where raw-calendar day iteration actually bit.

## Next in the approved sequence

Step 9 — Planning Run / Proposal: a solver run persisted as a proposal, separate from the current
plan, that a governed acceptance (Step 10) promotes. Plus, when the database returns, Step 7 part 2
(the `PostgresResourceFactsStore` and its cross-project / cross-tenant DB proof).
