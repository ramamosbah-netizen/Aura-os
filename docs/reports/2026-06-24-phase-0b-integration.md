# Report — Phase 0b.4c: Integration skeleton (kernel) — Phase 0b COMPLETE

**Date:** 2026-06-24 · **Repo:** `Desktop/aura-os` (local, branch `main`) · **Increment:** Phase 0b step 4, part 3 of 3 — the last kernel piece.

> The outbound half of the Integration Platform: turn the event stream into something external systems can consume. A webhook is just another bus subscriber — so this rides everything we already built.

---

## What was built

**Framework-free model in `@aura/shared`** (`src/integration/`):
- `webhook.ts` — `WebhookSubscription` model + pure matching/signing: `eventTypeMatches` (same wildcard rules as the event taxonomy), `subscriptionMatches`, and `signPayload` (HMAC-SHA256, GitHub-style `sha256=<hex>`). 11 tests.
- `csv.ts` — thin import/export seam: `DataExporter`/`DataImporter` interfaces + a dependency-free `toCsv`/`parseCsv` codec (quoted fields). 4 tests.

**Core impls + service in `@aura/core`** (`src/integration/`), wired into `CoreModule`:
- `WebhookStore` port (+ `WebhookDelivery` audit shape) with `PostgresWebhookStore` / `InMemoryWebhookStore` (chosen from `DATABASE_URL`).
- `WebhookDispatcher` — subscribes to the EventBus `*`, matches active subscriptions by tenant + event type, POSTs a signed payload (`x-aura-signature`, `x-aura-event`), and records every delivery attempt.
- `WebhookService` — register / list / read-deliveries facade.

**Migration** `0004_kernel_webhooks.sql` — `aura_webhook_subscriptions` + `aura_webhook_deliveries` (FK, indexes, RLS-locked). **Demo controller** `POST/GET /api/integration/webhooks` (+ `/deliveries`).

## Verified live (dedicated Supabase project)

`pnpm db:migrate` applied `0004` (idempotently skipped 0001–0003). Stood up a local HTTP receiver, then over HTTP:
- Registered a webhook → `kernel.smoke.tested` flowed **events controller → pg store → outbox relay → EventBus → WebhookDispatcher → signed POST** to the receiver.
- **HMAC signature verified**: the receiver-computed HMAC-SHA256 over the exact body equalled `x-aura-signature` (`sha256=07fff5a6…`) → MATCH. Tamper-evident.
- Delivery persisted: `status: success, statusCode: 200`; dispatcher logged `kernel.smoke.tested → http://localhost:4111/hook [success 200]`.

`pnpm build` → 3/3 · `pnpm test` → **50/50** (12 identity + 9 AI + 6 DMS + 8 workflow + **11 webhook + 4 csv**).

## Decisions

- **Webhooks = another bus subscriber** — no special egress path; the dispatcher consumes the same spine as the sample subscriber, so anything relayed becomes a webhook for free.
- **Signed + audited** — every delivery is HMAC-signed and recorded (success/failure, status code, error) for replay/debugging.
- **Import/export is a seam, not an engine** — modules implement `DataExporter`/`DataImporter`; the kernel ships only the CSV codec. Connectors (REST pull, queue) plug in behind the same idea later.
- **Known follow-ups (not blocking):** delivery retries/backoff + dead-letter; inbound webhooks (HMAC-verify incoming) when a module needs them.

## Phase 0b — COMPLETE ✅

```
① Identity & Access      ✅ fa8fa08
② Event store + outbox   ✅ f4cf521   (live)
③ AI Provider Layer      ✅ c0f5830
④ Substrates
   a) DMS                ✅ 4714e55   (live)
   b) Workflow engine    ✅ 556b165   (live)
   c) Integration         ✅ (this)   (live)
```

The kernel is done — built once, correctly, and proven to **compose**: a workflow approval flows through the access platform and emits an event; that event is persisted by the outbox, relayed to the bus, and turned into a signed webhook — with no glue code between the layers.

## Next — Phase 0c

The Next.js shell + **Workspace ("My Work")** home, command palette, and AI dock — where the platform finally becomes visible. (Read the bundled Next.js guide first per `AGENTS.md` — this version has breaking changes.)
