# Report — Kernel hardening: outbox relay dead-letter cap

**Date:** 2026-06-25 · **Repo:** `Desktop/aura-os` (local, branch `main`) · **Increment:** the sibling to the webhook hardening — a max-attempts cap on the event spine so a *poison* event (a subscriber that always throws) is dead-lettered instead of retried forever. Completes poison-pill safety for the whole stream.

> The OutboxRelay already records `processing_error` and retries a failed event each tick. This adds an `attempts` counter: after `OUTBOX_MAX_ATTEMPTS` the event is dead-lettered — `processed_at` stamped (stops retrying) with the error kept for inspection — and surfaced at `GET /api/events/dead-letters`.

---

## What was built

**`@aura/core` (events):**
- `outbox-relay.ts` — on a handler failure, increments `attempts`; below the cap it leaves the row unprocessed (retry next tick, as before); at `OUTBOX_MAX_ATTEMPTS` it **dead-letters** (stamps `processed_at`, keeps `processing_error`). The claim query now selects `attempts`.
- `event-store.ts` — new `DeadLetteredEvent` type + `EventStore.listDeadLettered(limit)`.
- `postgres-event-store.ts` — `listDeadLettered`: rows where `processing_error IS NOT NULL AND processed_at IS NOT NULL`, newest first.
- `in-memory-event-store.ts` — returns `[]` (no outbox/relay in memory mode).

**API**: `GET /api/events/dead-letters` — ops visibility into events the relay gave up on. Plus a **gated, test-only `PoisonSubscriber`** (`apps/api`, inert unless `OUTBOX_TEST_POISON=true`) that throws on `kernel.poison.test`, so the cap is verifiable end to end.

**Migration `0013`**: adds `attempts` to `aura_events` + a partial index for the dead-letters query.

**Config** (env): `OUTBOX_MAX_ATTEMPTS` (default 5).

## Verified

- `pnpm build` → **12/12**; `pnpm test` → **102/102** (relay is integration-level — verified live, not via new unit tests).
- `pnpm db:migrate` → applied **`0013`**.
- **Live** (fault injection on, cap 3, 600ms poll): emitted `kernel.poison.test` (handler always throws) and a normal `kernel.ok.test`. The poison event was **dead-lettered after exactly 3 attempts** (`GET /api/events/dead-letters` → `attempts=3`, `error="DEAD after 3 attempts: …"`); the normal event processed and was **never** dead-lettered. Relay logs show the retries then the dead-letter.

## Decisions

- **Dead-letter = `processed_at` + `processing_error` both set.** Reusing the existing columns (plus the new `attempts`) avoids a status enum: success = processed + no error; dead = processed + error; retrying = unprocessed + error.
- **Keep the error, stop the retries.** Dead-lettering stamps `processed_at` so the poison row leaves the unprocessed set (no more wasted ticks), but the error is preserved so ops can inspect + replay later.
- **Gated fault injection, not a mock.** A real (env-gated, default-off) throwing subscriber proves the path through the actual relay + DB, not a unit stub.

## Status — kernel hardening

Both logged delivery follow-ups are now done: **webhook retry/backoff/dead-letter** (`dc8ec7c`) and the **relay dead-letter cap** (this). The remaining hardening item is **atomic event-in-transaction** — note that `PostgresEventStore.appendWithClient` already exists; modules just need to adopt it (write their row + the event on one caller-owned tx) instead of the current create-then-append.

## Next

- **Atomic event-in-tx adoption** — thread one transaction through a module's store + `appendWithClient` (CRM as the template), closing the last create-then-append gap.
- **Web Supabase login** — the remaining auth-UX piece.
