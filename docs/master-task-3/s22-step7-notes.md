# §22 Step 7 — cross-project capacity engine (COMPLETE — pure engine + DB proof)

**Status:** complete. The pure engine and port landed first (part 1); part 2 — the
`PostgresResourceFactsStore` and its cross-project / cross-tenant proof against real PostgreSQL —
landed once the local disposable database was rebuilt (2026-09-10).

## Part 2 — the Postgres store and its proof (green)

- `modules/projects/src/postgres-resource-facts-store.ts` — two tenant-scoped reads, typed-pair
  reference match (`(resource_type, canonical_resource_id)` via `unnest`), no project filter so the
  read genuinely spans projects.
- `modules/projects/src/resource-facts-store.pg-int.test.ts` — under the enforced `aura_app` role
  (gated on `AURA_PG_APP_URL` + `AURA_PG_OWNER_URL`): two projects book one crane on the same Tuesday
  → `CONFLICTED`, both named, `committed 2 > capacity 1`; a **third project in another tenant** on the
  same crane id is never returned (RLS keeps "across every project" inside the tenant); a released
  booking holds nothing and returns the crane to `AVAILABLE`. 3 tests green.

The rest of this note (part 1) is unchanged below.

## What Step 7 is

The point where a resource's day-by-day facts stop being **supplied** by a caller and start being
**computed across every project's held bookings**. Steps 4 and 6 gave a resource a capacity and let
one project commit against it; nothing yet looked at the *other* project. Two sites could each book
the one tower crane next Tuesday and each be told it was free — the exact failure §22 exists to fix.

## What landed, and where

Split along the §5.1 layering — the querying is impure and isolated; the arithmetic is pure and
exhaustively tested.

| Piece | File | Role |
|---|---|---|
| Pure engine | `modules/projects/src/domain/resource-facts.ts` | `assessResourceAcrossProjects`, `resolveResourceLoad`, `dayLoadsForBooking`, `externalCommitmentsFor` — all pure functions of `(windows, bookings, interval)` |
| Port | `modules/projects/src/resource-facts-store.ts` | `ResourceFactsStore` — the one place in §22 that reads ACROSS projects: `heldBookingsFor`, `capacityWindowsFor`, tenant-scoped |
| In-memory impl | `modules/projects/src/in-memory-resource-facts-store.ts` | the no-database implementation; the second reading of the port contract |

The pure engine reuses the vocabulary already fixed in Steps 3–6: `capacityOn` (Step 4), `sameResource`
typed identity (Step 3), `assessBooking` + `DayLoad` (Step 6), and `ExternalCommitment` (the planner's
existing cross-project input). It defines no second answer to any question those already answer;
`ResourceFeasibility` is imported from `schedule-planning.ts`, not redeclared.

## Disciplines proven (19 unit tests)

`resource-facts.test.ts` (15) and `in-memory-resource-facts-store.test.ts` (4):

- **The crane conflict.** Two projects, one crane, same Tuesday → `CONFLICTED`, both projects named,
  `committed 2 > capacity 1`, `overBy 1`.
- **Visible on both.** Each project's booking, assessed via `dayLoadsForBooking` → `assessBooking`
  against the cross-project load, reports `CONFLICTED`. A booking that fitted alone flips to
  `CONFLICTED` the instant the other project books — with nothing about its own record changed.
- **Unknown ≠ available ≠ known zero.** Unknown capacity + demand → `UNKNOWN`; a known **zero** +
  demand → `CONFLICTED`; unknown capacity + **no** demand → `AVAILABLE` (nothing at risk).
- **A known conflict is never hidden behind a missing one** — a clash on a day with declared capacity
  surfaces even when another day in the interval is unknown.
- **Units are never summed or converted** — capacity in `units`, a booking in `persons` → `UNKNOWN`,
  `UNIT_CONFLICT`.
- **Typed identity** — a vehicle and an asset sharing a uuid are two resources; the vehicle's capacity
  does not satisfy the asset's booking.
- **Released holds nothing**; overlapping capacity windows sum within one unit; ordering is
  deterministic; `externalCommitmentsFor` excludes the asking project's own bookings and released ones.

Full projects suite: **387 passed, 1 skipped** (the gated pg-int), typecheck clean.

## The deferred half — the DB proof, to run when the database is up

1. **`PostgresResourceFactsStore`** implementing the port with two tenant-scoped `SELECT`s over
   `aura_projects_resource_bookings` (held only, overlap) and the capacity table from migration 0286,
   filtered by `(resource_type, canonical_resource_id)` — typed match, never bare id.
2. A gated pg-int proof (pattern: `schedule-store-atomicity.pg-int.test.ts`) run under the enforced
   NOSUPERUSER/NOBYPASSRLS role, asserting:
   - two projects in one tenant book the same crane on the same Tuesday against capacity 1 → the
     resolver reports `CONFLICTED`, both projects named, and `assessBooking` on each booking agrees;
   - a third project in **another tenant** booking the same crane id does **not** appear — RLS keeps
     "across every project" inside the tenant;
   - releasing one booking returns the resource to `AVAILABLE`.

Only then is Step 7 closed. Until the database is reachable, the pure engine stands on its unit proofs
and the Postgres impl is not written, so nothing reads as proven that is not.

## Next in the approved sequence

Step 8 — calendar integration (`@aura/core`), so the resolver's day iteration counts working days
rather than raw calendar days.
