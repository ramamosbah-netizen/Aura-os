# Report — Intelligence Layer (L3) v1: deal-chain projection + AI briefing

**Date:** 2026-06-24 · **Repo:** `Desktop/aura-os` (local, branch `main`) · **Increment:** the first **Layer-3** slice — a read-only consumer of the event spine, on the kernel AI substrate. The payoff of building the spine: it's consumable with no special glue.

> The intelligence layer **observes and proposes** — it derives a read-model from the event stream and produces an AI briefing, and it **never writes a business module's table**. Its own insight goes back onto the spine as an event.

---

## What was built

**`intelligence/` — the `@aura/intelligence` package** (Layer 3, alongside `core`/`shared`):
- `src/pipeline.ts` — framework-free fold: `foldEvent`/`foldPipeline` reduce deal-chain `*.created` events into a `Funnel` (counts + summed values per stage) + `winRate` (tender→contract conversion). Pure, no Nest.
- `src/briefing.ts` — `buildBriefingPrompt(funnel)` shapes a provider-agnostic `AiCompletionRequest` (executive-copilot system prompt + the pipeline numbers); `INSIGHT_EVENT = 'intelligence.insight.generated'`.
- `src/pipeline-projection.ts` — `PipelineProjection` (read-only consumer): **subscribes then replays** the event log on boot, folds live events off the `EventBus`, **idempotent by event id** (the outbox is at-least-once). In-memory, per tenant.
- `src/insight.service.ts` — `InsightService`: snapshot → `buildBriefingPrompt` → `AiService.complete()` → emits `intelligence.insight.generated` back onto the spine. 
- 6 vitest tests (folding, conversion, value coercion, prompt assembly).

**API** (`apps/api`): `IntelligenceController` — `GET /api/intelligence/pipeline` (pure read of the projection) + `POST /api/intelligence/insights` (generate briefing, emit event). Wired into `AppModule`. **No migration** — the read-model is derived, schema-free state (rebuilt from the log); insights live in the existing `aura_events`.

**Web** (`apps/web`): an **Intelligence** nav group → `/intelligence` page (Server Component renders the funnel: Accounts → Tenders → Contracts → Projects with values + conversion %) + `components/insight-panel.tsx` (`'use client'`, "Generate briefing" → BFF route `app/api/intelligence/insights`).

## Verified

- `pnpm build` → **9/9**. Web routes now include `/intelligence` + `/api/intelligence/insights`.
- `pnpm test` → **71/71** (65 + **6 new intelligence**).
- **Live**: (1) projection **replayed from the spine** on boot → accounts 1 / tenders 4 / contracts 2 / projects 1 / 50% conversion; (2) **live fold off the bus** — created a tender, projection incremented 4→5; (3) **AI briefing** built from the real pipeline (`provider=local`, prompt carried "Tenders: 5 worth 11,199,000 · Contracts: 2 …"); (4) **`intelligence.insight.generated` on the spine** (`[Intelligence] Insight generated … via local` → relayed). PASS.

## Decisions

- **Read-only, derived, rebuildable.** The funnel is in-memory and reconstructed from the append-only log on every boot — so it needs no schema and can't drift from the truth. That's why this slice ships with **no migration**.
- **Idempotent because the spine is at-least-once.** The projection dedupes by event id, so boot-replay + live-bus overlap (and outbox redelivery) are harmless. The textbook consumer contract for a transactional outbox.
- **Intelligence both consumes and emits.** Its insight is itself a `intelligence.insight.generated` event — auditable, and automatically deliverable by the webhook dispatcher. The layer participates in the spine without coupling to any module.
- **AI through the one kernel seam.** Briefings call `AiService.complete()` — local echo today, real Claude (`claude-opus-4-8`) the moment `ANTHROPIC_API_KEY` is set, with zero code change. The local echo proves the prompt is assembled from live data.

## Next

Deepen L3 on the same substrate (forecasting, risk/anomaly scoring, an insights feed read from `intelligence.insight.generated`); or the cross-cutting **auth** work (the standing structural debt across all modules); or wire the briefing into the Workspace home so it greets the user.
