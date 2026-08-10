# 16 — Performance & Scalability

> **No benchmarks exist.** Everything below is an **architectural estimate** from code reading, explicitly distinguished from measurement. `NOT MEASURED`.

## Known scaling limits (from code)

| Concern | Status | Evidence | Impact |
|---|---|---|---|
| **Global search fan-out** | `PARTIALLY_IMPLEMENTED` | `apps/api/src/search/search.service.ts` lists *every* spine entity per tenant and filters **in memory** (`has(...)`) | O(total rows) per query; degrades sharply past ~10⁴ rows/entity. Author acknowledges "a search projection can replace the fan-out later." |
| **No caching layer** | `MISSING` | no Redis/in-proc cache observed; `getJson` uses `no-store` | Every page render re-fetches; repeated dashboard aggregations recompute |
| **Pagination partial** | `PARTIALLY_IMPLEMENTED` | additive `*/paged` routes alongside unpaged `list` | Unpaged lists load full tables into memory |
| **In-process event bus** | `PARTIALLY_IMPLEMENTED` | reactors run in the API process | Reactor bursts compete with request handling; no independent scaling |
| **Connection pool default `max=5`** | by config | `pg-pool.ts` (`DATABASE_POOL_MAX ?? 5`) | Low ceiling under concurrency unless tuned |
| **Reporting recompute** | `PARTIALLY_IMPLEMENTED` | P&L via projection; dashboards likely recompute per request | CPU/DB load scales with dashboard use |

## Scale estimates (architectural, `NOT MEASURED`)

| Users | Assessment |
|---|---|
| 10 | Comfortable. Single instance, in-memory search fine. |
| 100 | Fine with pool tuning (`DATABASE_POOL_MAX`) and pagination on hot lists. |
| 1,000 | **Search fan-out and unpaged lists become the bottleneck.** Needs a search projection + caching + pool sizing. |
| 10,000 | Requires: search index (Postgres FTS/pgvector already available, or external), read replicas, cached aggregations, and moving reactors out-of-process (broker). Single-process monolith becomes a scaling ceiling. |
| 100,000 | Requires re-architecting search, extracting hot modules or a broker-backed event pipeline, horizontal API scaling with sticky-free tenancy (already stateless per request — good), and materialized reporting. Not achievable on the current single-deployable topology without significant work. |

## Positive scalability properties

- **Stateless request handling** (tenant via ALS + JWT) — horizontal API scaling is architecturally straightforward.
- **Tenant-scoped pool + RLS** hold under horizontal scale (no shared mutable tenant state).
- **Outbox** gives durable async without losing events under load.
- **pgvector** is already in the DB image — a search projection has a home.

## Recommendations

1. **P1:** replace search fan-out with a Postgres FTS or projection-backed index.
2. **P1:** complete pagination; forbid unbounded `list` on large tables (lint/fitness rule).
3. **P2:** add a caching layer for dashboard aggregations; materialize heavy reports.
4. **P2:** move reactors to a broker (or a dedicated worker process reading the outbox) for scale-out.
5. **P1 (process):** establish a load-test harness and actual baselines — the current absence of any measurement is itself a production risk.

**Performance/scalability score: 52/100** — sound stateless foundation, but concrete bottlenecks (search, caching, pagination) and **zero measurement**.
