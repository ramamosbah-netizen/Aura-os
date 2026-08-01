# Performance Audit

**Score: 6.0 / 10** — sound fundamentals (indexes, parameterized queries, metrics) but no caching tier, `force-dynamic` everywhere, composite roll-ups assembled in app code, and mega client bundles.

## 1. Backend

| Area | Finding | Evidence |
|---|---|---|
| Query safety | Parameterized; tenant-scoped composite indexes | `postgres-*` stores; mig indexes `(tenant_id, created_at desc)` |
| **Caching tier** | **None** — no Redis, no `CacheModule`, no HTTP cache | grep: no `cache-manager`/`CacheModule`/`redis` in app code |
| Read models | Projections exist (mig 0034/0035) but under-used; most reads hit primary stores | Architecture §4 |
| **N+1 / roll-ups** | "No cross-module joins" law → composite views assembled with multiple sequential queries in services (e.g. account portfolio, pipeline, dashboards) | `crm/accounts/portfolio` composes in one API call but across many store reads |
| Event replay | Append-only event store, unbounded; projections rebuilt from replay can be slow at volume | `core/src/events/*` |
| Metrics | ✅ OTLP push + `/metrics` Prometheus counters (low-cardinality, by method/status) | `apps/api/src/main.ts` |
| Rate limiting | ❌ none (no throttler) — a single client can hammer any endpoint | `main.ts` |

**Biggest backend risk:** as data grows, roll-up endpoints that fan out into N per-entity reads (because joins are banned across contexts) will degrade linearly. Mitigation is exactly what CQRS projections are for — materialize the roll-ups and read them in one query. The infrastructure exists; apply it to hot paths.

## 2. Frontend

| Area | Finding |
|---|---|
| Rendering | Server-component pages + `export const dynamic = 'force-dynamic'` on every page → **no caching/ISR**; TTFB bound to API latency |
| Data layer | No SWR/query cache → every mutation = full-page `router.refresh()` server round-trip |
| Loading states | 0 `loading.tsx` → no streamed skeletons; user waits on a blocked page |
| **Bundle size** | Mega client components: `project-detail.tsx` 1,899 LOC, `tender-detail.tsx` 1,447, `engineering-client.tsx` 1,235, `crm-pipeline-client.tsx` 1,095 — all `"use client"`, shipped to browser |
| Re-renders | Monolithic client components with broad state → wide re-render surfaces |

## 3. Scalability

- API is stateless → scales horizontally, **except** the outbox relay (in-process poller, assumes single runner). Needs leader election / a durable queue before multi-instance.
- No CDN/edge strategy evident for the web app.
- No load/perf test harness for the web tier (backend perf harness exists per memory: P1 tier).

## Recommendations (ranked by impact)

1. **Materialize hot roll-ups via projections** (pipeline, account portfolio, finance dashboards, operations overview) — read in one query instead of N. Highest backend win.
2. **Add a caching tier** (Redis or in-memory LRU) for reference data (users, modules, feature flags, exchange rates, numbering) and expensive read models; add HTTP `Cache-Control` on genuinely static GETs.
3. **Replace blanket `force-dynamic`** with per-route caching where data tolerates staleness; stream with `loading.tsx` + Suspense.
4. **Introduce a client data layer** (React Query) for optimistic mutations instead of full refresh.
5. **Decompose mega-components**; push static parts to server components to cut client JS.
6. **Add rate limiting** (`@nestjs/throttler`) and per-tenant quotas (especially for AI endpoints, which are token-metered).
7. **Add a web perf budget** (Lighthouse CI) and load-test roll-up endpoints under seeded-at-scale data.
