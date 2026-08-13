# 17 — Technical Debt

The codebase is **notably clean** for its size: **14** TODO/FIXME/HACK markers and **0 `console.log`** in non-test source (structured logging via Nest `Logger` + `console.error` only in the pg pool recovery path). This is well below typical debt density.

## Debt register (ranked by business impact)

| # | Debt item | Status | Evidence | Impact |
|---|---|---|---|---|
| D1 | **Search fan-out** loads all entities in memory | `PARTIALLY_IMPLEMENTED` | `search.service.ts` | Scale wall (`16`) |
| D2 | **`getJson` swallows all errors → `null`** | `PARTIALLY_IMPLEMENTED` | `apps/web/lib/api.ts` | Masks 4xx/5xx as empty state (`06`) |
| D3 | **Thin DB referential integrity** (62 FKs / 218 tables @ Rev 2; ratio unchanged) | `PARTIALLY_IMPLEMENTED` | migrations | Orphan risk (`04`) |
| D4 | **Back-half module UI/orchestration thinness** | `PARTIALLY_IMPLEMENTED` | `02` | Journeys not completable in-app (`03`,`10`,`11`) |
| D5 | **Pagination adopted additively, not enforced** | `PARTIALLY_IMPLEMENTED` | `*/paged` routes | Unbounded lists |
| D6 | **No caching layer** | `MISSING` | — | Recompute cost |
| ~~D7~~ | ~~**Permissive CORS + no rate limiting**~~ **CLEARED (Rev 2)** | `VERIFIED_IMPLEMENTED` | `main.ts:55-60`, `core/src/http/` | Perimeter (`07`, G-07 closed) |
| D8 | **`ssl.rejectUnauthorized:false`** for managed PG | `IMPLEMENTED_BUT_UNVERIFIED` | `pg-pool.ts:23` | MITM surface on DB link |
| D9 | **Money as `number` + `toFixed(2)`** | `PARTIALLY_IMPLEMENTED` | `wbs.ts`, aging | Float rounding drift (`09`) |
| D10 | **Coverage gate absent** despite coverage run | `PARTIALLY_IMPLEMENTED` | `ci.yml` | Regressions slip |
| D11 | **Dev default tenant `dev-tenant`** path | by design | `main.ts` | Fine while auth-off is dev-only; must never reach prod (fail-closed gate guards it) |
| D12 | **Compiled `dist/` committed in modules** | housekeeping | `modules/*/dist` present | Repo bloat, drift risk vs source |

## Duplicated / dead code

- No large-scale duplication observed in the sampled kernel/modules. Prior project history notes a resolved duplicate `IdempotencyService`; current tree shows a single `core/src/commands/idempotency.service.ts` — appears consolidated (`VERIFIED` single copy).
- `demo`/seeders exist for fixtures (`*.seeder.ts`) — intentional, not dead.

## Recommendations (highest ROI first)

1. Fix **D2** (error semantics) — cheap, high trust impact.
2. Address **D1/D5/D6** together (search + pagination + cache) — the scale triad.
3. Introduce a **money type** (D9) before finance goes live with real ledgers.
4. Add **D7** perimeter controls and **D10** coverage gate to CI.
5. Stop committing `dist/` (D12); build in CI.

**Technical-debt posture: healthy** — the debt is concentrated in a handful of well-understood, individually tractable items, not diffuse rot.
