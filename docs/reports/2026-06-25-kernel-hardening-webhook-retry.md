# Report — Kernel hardening: webhook retry + backoff + dead-letter

**Date:** 2026-06-25 · **Repo:** `Desktop/aura-os` (local, branch `main`) · **Increment:** production-grade outbound delivery — the WebhookDispatcher fired once and lost transient failures. Now failed deliveries are retried with exponential backoff and dead-lettered after a cap (poison-pill guard). One of the two logged kernel follow-ups.

> A failed POST is recorded `pending` with the request body + a `next_attempt_at`; a new **WebhookRetryWorker** re-sends due deliveries with exponential backoff, marking them `success` or — after `WEBHOOK_MAX_ATTEMPTS` — `dead`. Bodies are stored so retries are self-contained (re-signed each send).

---

## What was built

**`@aura/shared`**: `webhookBackoffMs(attempt, baseMs, capMs)` — pure exponential backoff (doubling, capped). 3 vitest tests.

**`@aura/core` (integration):**
- `webhook-send.ts` — `sendWebhook(url, secret, body, eventType)`: one signed POST that never throws (network/HTTP failures become a result). Shared by the dispatcher's first try and the worker's retries.
- `webhook-retry-worker.ts` — `WebhookRetryWorker`: a polling worker (mirrors the OutboxRelay) that claims due `pending` deliveries, re-sends, and transitions them `success` / reschedules with backoff / `dead` after the cap. Re-entrancy-guarded, `unref`'d timer.
- `webhook-dispatcher.ts` — now uses `sendWebhook`; on first-try failure records `pending` (+ `nextAttemptAt`) instead of a terminal `failed`, or `dead` immediately if retries are disabled.
- `WebhookDelivery` gained `attempts`, `nextAttemptAt`, `body`; status widened to `success | pending | dead`. `WebhookStore` gained `getSubscription`, `updateDelivery`, `duePendingDeliveries` (Postgres + in-memory).

**Migration `0012`**: adds `attempts`, `next_attempt_at`, `body` to `aura_webhook_deliveries` + a partial index on `(next_attempt_at) WHERE status = 'pending'` (the worker's claim).

**Config** (env): `WEBHOOK_RETRY_MS` (5000), `WEBHOOK_MAX_ATTEMPTS` (5), `WEBHOOK_BACKOFF_MS` (2000).

## Verified

- `pnpm build` → **12/12**; `pnpm test` → **102/102** (3 new backoff).
- `pnpm db:migrate` → applied **`0012`**.
- **Live** (fast-retry env: 600ms poll, max 3, 300ms base):
  - **Success path** — webhook to a live receiver → delivery `success`, `attempts=1`, `200`.
  - **Dead-letter path** — webhook to an unreachable URL → first try `[pending]`, worker `attempt 2 [pending]`, `attempt 3 [dead]` (`error="fetch failed"`). Backoff timing (≈300ms → 600ms) confirmed in the logs.

## Decisions

- **Store the body, re-sign per send.** The delivery row carries the exact request body, so the worker retries without re-reading the event or re-deriving the payload; the HMAC signature is recomputed from the stored body each attempt.
- **A separate worker, not inline retries.** Retrying inline would block the bus/relay for the backoff duration. The worker polls like the OutboxRelay — same proven shape, `unref`'d, re-entrancy-guarded.
- **Dead-letter, not infinite retry.** After `WEBHOOK_MAX_ATTEMPTS` a delivery is `dead` (terminal) — a permanently-broken endpoint can't be retried forever. The audit row keeps the last error.

## Next

- **Relay dead-letter cap** — the sibling follow-up: an attempts cap on `aura_events` so a poison event (throwing subscriber) is dead-lettered instead of retried every tick (the relay already records `processing_error` + retries; it just needs the cap).
- **Atomic event-in-transaction** — `appendWithClient` so a module's write and its event commit in one tx.
- **Web Supabase login** — the remaining auth-UX piece.
