# Report — Intelligence L3.2: project profitability (budget vs actual) on the spine

**Date:** 2026-06-25 · **Repo:** `Desktop/aura-os` (local, branch `main`) · **Increment:** deepen the Intelligence layer — a read-only **per-project P&L** that folds *both* axes (deal-chain revenue + operate-loop spend) off the event spine. The concrete payoff of running both chains on one stream.

> Per project: **budget** (the deal-chain project value) vs **committed** (POs), **received** (GRNs), **invoiced** (supplier spend), with **variance** = budget − invoiced. Derived purely from event payloads — no joins, no module-table reads.

---

## What was built

**`intelligence/` (`@aura/intelligence`):**
- `src/project-ledger.ts` — framework-free `ProjectLedger` + `foldProjectLedgers(events)`: folds `projects.project.created` (budget, name, account) and the operate-loop spend events (`procurement.po.created` → committed, `inventory.grn.created` → received, `finance.invoice.created` → invoiced) keyed by `payload.project.id`; computes variance; sorts by budget. Tracks spend even for a not-yet-seen project (stub), ignores unrelated/unreferenced events. 5 vitest tests.
- `src/pipeline-projection.ts` — `PipelineProjection` now also keeps the per-tenant ledger events (idempotent by event id, same as the funnel) and exposes `ledgers(tenantId)`.
- `src/briefing.ts` — `buildBriefingPrompt(funnel, ledgers)` folds a profitability section into the AI prompt (top projects' budget/committed/invoiced/variance) and the system prompt now asks for over-budget callouts.
- `src/insight.service.ts` — passes ledgers into the briefing and includes them in the emitted `intelligence.insight.generated` payload.

**API**: `GET /api/intelligence/projects` → the per-project ledger array for the tenant (pure read of the in-memory projection).

**Web**: the `/intelligence` page now renders a **Project profitability** table (Project · Account · Budget · Committed · Invoiced · Variance), with negative variance shown in the bad-state colour. Fetched in parallel with the pipeline.

**No new package, no new deps, no migration** — the ledger is derived, schema-free state rebuilt from the log.

## Verified

- `pnpm build` → **12/12**; `pnpm test` → **99/99** (94 + **5 new project-ledger**).
- **Live**: seeded a fresh project (budget 200,000) + an issued PO against it (120,000) + an approved invoice (80,000); `GET /api/intelligence/projects` folded them live off the bus into `budget 200000 / committed 120000 / invoiced 80000 / variance 120000`. `POST /api/intelligence/insights` produced a briefing whose prompt includes the profitability section. The same projection correctly showed the other seeded projects (e.g. an over-budget one with negative variance).

## Decisions

- **The payoff of one spine, two axes.** Revenue (deal chain) and spend (operate loop) are joined *per project* purely by snapshot reference in event payloads — the read-model needs no FK, no cross-module query. A genuine cross-cutting view that would normally require joins across six tables.
- **Still read-only + rebuildable + idempotent.** The ledger rebuilds from the log on boot and folds live; dedupe-by-id keeps it correct under the at-least-once outbox.
- **The copilot sees money now.** The AI briefing folds profitability in, so (with a real key) it can flag the most over-budget project — the executive-copilot thesis, now backed by the full business.

## Next

- **Web Supabase login** — the one remaining auth piece (API already accepts Supabase JWKS tokens).
- **Kernel hardening** — relay/webhook retry + backoff + dead-letter; atomic event-in-transaction.
- Further L3 — forecasting / cashflow projections on the now-complete spine.
