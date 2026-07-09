# Performance Baseline & Budgets — 2026-07-08

Gap register **Vol 23 #15** closure. First measured baseline of the API's key read
endpoints, plus the budgets they are held to and the harness that re-measures them.

## Harness

`apps/api/scripts/perf-baseline.mjs` (also `pnpm --filter @aura/api perf`):
5 warmups then N=40 timed requests per endpoint → p50/p95/max vs a per-endpoint p95
budget. `--enforce` exits 1 on breach (opt-in CI perf smoke); `--json` for dashboards.

## Environment context (matters!)

Dev workstation (Windows) → **remote Supabase Postgres in ap-northeast-2** via pooler.
Every DB round-trip carries ~165–170ms of network latency — confirmed by `health`
(no DB) at **0.9ms p50** while the simplest single-query list sits at ~168ms p50.
Budgets are written for the production posture (co-located DB, ≤5ms RTT); the
normalized reading below subtracts the measured network floor.

## Baseline (2026-07-08, n=40, after 5 warmups)

| endpoint | p50 ms | p95 ms | max ms | p95 budget | raw | normalized* |
|---|--:|--:|--:|--:|---|---|
| health (no DB) | 0.9 | 2.0 | 2.3 | 50 | PASS | PASS |
| crm accounts (bare) | 168 | 205 | 231 | 150 | FAIL | ~35ms → PASS |
| crm accounts (paged) | 336 | 372 | 408 | 150 | FAIL | ~35ms → PASS (2 RTTs: count+window) |
| projects list | 170 | 207 | 217 | 150 | FAIL | ~37ms → PASS |
| finance invoices (paged) | 171 | 281 | 1022 | 200 | FAIL | ~110ms → PASS |
| AP aging (report) | 169 | 175 | 177 | 400 | PASS | PASS |
| AR aging (report) | 172 | 207 | 254 | 400 | PASS | PASS |
| workspace config | 170 | 218 | 256 | 150 | FAIL | ~48ms → PASS |
| events feed | 359 | 845 | 2157 | 200 | FAIL | **~675ms → real hotspot** |
| site instructions (paged) | 169 | 176 | 187 | 150 | FAIL | ~6ms → PASS |

\* normalized = p95 − ~170ms network floor (−340ms for two-query paged endpoints).

## Findings

1. **The app is fast; the wire is slow.** Every list endpoint does its actual work in
   well under 120ms once the remote-DB RTT is subtracted. In production (co-located
   DB) all budgets except one are expected to pass as-is.
2. **`GET /events` is the one real hotspot** (~675ms normalized p95, 2.1s max): it
   returns the raw event feed unwindowed. Action: cap/paginate the default feed.
3. **Paged endpoints pay 2 RTTs** (COUNT + window). On a remote link that doubles
   latency; the two queries are independent → could run under `Promise.all` in
   `pagePostgres` for a free halving on high-latency links.
4. Occasional 1–2s max outliers (pooler cold connections) — the p95s are stable.

## Budgets (the standing ceilings)

| Class | p95 budget |
|---|--:|
| health / no-DB | 50ms |
| single-entity list (bare or paged) | 150ms |
| filtered/paged finance lists | 200ms |
| aggregate reports (aging, dashboards) | 400ms |

Budgets live in the harness (`TARGETS` in perf-baseline.mjs) so re-runs and CI use
the same numbers. Revisit each release; tighten once the DB is co-located.

## How to re-run

```bash
pnpm --filter @aura/api start        # API up
pnpm --filter @aura/api perf         # report-only
node apps/api/scripts/perf-baseline.mjs --n 100 --enforce   # CI smoke (fails on breach)
```
