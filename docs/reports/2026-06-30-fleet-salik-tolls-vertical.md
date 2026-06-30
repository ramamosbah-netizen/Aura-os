# Module-depth vertical — Fleet Salik (toll charges)

**Date:** 2026-06-30
**Module:** `@aura/fleet`
**Migration:** `0077_fleet_salik_charges.sql` (applied live → DB at 77)

## What & why

Fleet tracked vehicles, fuel, maintenance and traffic fines but had no **Salik**
(Dubai road toll) register — flagged in the gap analysis ("Salik/tolls, 0 Salik
hits"). UAE fleets reconcile a monthly Salik statement and recover tolls from the
relevant cost owner. This records each toll and moves it through its life.

## Domain (`modules/fleet/src/domain/salik-charge.ts`)

- `makeSalikCharge` — validates vehicleId / gate / `YYYY-MM-DD` date / optional `HH:MM`;
  defaults amount to **4 AED** (the fixed Salik fee; 6 at Sheikh Zayed Rd peak).
- Lifecycle: `recorded → allocated` (to a driver/project cost owner) `| disputed`.
- `summariseSalik` — counts by status + total AED, **excluding disputed** from the total.
- Events: `fleet.salik.recorded | allocated | disputed`.

## Vertical (clones the traffic-fine vertical)

- domain `salik-charge.ts` + **6 unit tests**
- store: extended `SalikChargeStore` port + in-memory + postgres impls (`dateOnly()` mapping)
- migration `0077` — `aura_fleet_salik_charges`, indexed (tenant / vehicle / status), RLS-locked
- service: record / allocate / dispute / list / summary (atomic `TX_RUNNER` + spine events);
  new `SALIK_CHARGE_STORE` token + module provider
- API on `FleetController`: `POST/GET /api/v1/fleet/salik`, `/salik/summary`,
  `PUT /salik/:id/{allocate,dispute}`
- web: BFF routes + `/fleet/salik` page + client (vehicle picker, gate/date/amount form,
  status badges, allocate/dispute, total-excl-disputed bar) + nav entry

## Verification

- `pnpm typecheck` **42/42**; `pnpm test` **41/41** tasks (fleet **20/20**, 6 new;
  fixed the 3 existing `fleet.test.ts` `new FleetService(...)` calls for the added store arg).
- **Live-DB E2E** (Supabase, API on :4145): record (default **4 AED**, recorded) →
  allocate → `project-A` (allocated) → record 6 AED → dispute (disputed) → summary
  `{count 2, totalAmount 4, allocated 1, disputed 1}` (disputed excluded); guards:
  missing gate → **400**, allocate-without-owner → **400**, dispute-allocated → **400**.

## Next candidates

- Salik → cost: post allocated tolls to the project/driver cost (mirror of the fleet expense flow).
- Mulkiya / insurance renewal tracking + driver-licence expiry (remaining Fleet limbs).
- AMC persistence (P0 risk — in-memory module).
