# AURA OS — Master Reverse-Engineering & Production-Readiness Audit

> **Verdict (Rev 2):** AURA OS is at **Architectural Maturity Level 3.5 (Production Application trending Enterprise Platform)**, with **~68/100 production readiness**, and requires **3 P0 blockers** and **7 P1 items** resolved before enterprise production deployment.
>
> The readiness headline is **unchanged from Rev 1 by design**: all three P0 blockers remain open. Rev 2 records that the *delivery-half depth* gap (G-08) is now largely closed by five merged workflow verticals.

This audit is **evidence-driven**. Every material claim is anchored to a file path, migration, endpoint, or test in the repository as it exists at the commit below. Documentation and developer claims were treated as the *lowest* tier of evidence and verified against executable source. Where something could not be verified from the repository (e.g. the live posture of the staging/production database), it is explicitly marked **NOT VERIFIED**.

---

## Audit metadata

| Field | Value |
|---|---|
| Audit date (Rev 1) | 2026-08-10 |
| **Revision 2 date** | **2026-08-12** |
| Git commit SHA (Rev 1) | `24cbb47a4ead27a33afdd95ff01e7c4025a68176` (doc commit `246b8dd9`) |
| **Git commit SHA (Rev 2)** | **`1a14a0361259082b222d53a54b8ea344e39ca374`** (`main`) |
| Branch | `claude/aura-os-audit-fd8b9c` → refreshed on `claude/aura-audit-refresh-6a104f` |
| Repo version | `package.json` → `0.0.0` (private monorepo) |
| Auditor | Principal Architect / CTO / Security / QA composite review |

## Revision history

### Rev 2 — 2026-08-12 (delivery-half workflow refresh)

Five governed workflow verticals merged to `main` **after** Rev 1 was written (Rev 1 doc commit `246b8dd9`, 2026-08-10; all five feature commits land 08-11/08-12). Rev 1 flagged exactly these as the back-half depth gap, so its claims are stale and are corrected here.

| PR | Merge commit | Migration | What landed |
|---|---|---|---|
| #205 | `687c10c4` | `0224` | Engineering: governed shop-drawing state machine + immutable revisions + submission/review + Register/360 UI |
| #206 | `bab03a90` | `0225` | Quality: NCR corrective-action loop + immutable verification records + IR→NCR provenance + NCR 360 |
| #207 | `f2a104e4` | `0226` | Doc control: `DocumentRevision` state machine + revision history + transmittal lifecycle/acknowledgement |
| #208 | `22a68535` | `0227` | Site: governed `SiteDailyReport` aggregate + 5 typed child line-items + approval workflow |
| #209 | `1a14a036` | `0228` | Commissioning: itemised test sheet + punch list + service-level retest gate + Commissioning 360 |

**Scope of this revision — what changed and what deliberately did not:**

- **Counts** in this file, `02`, `06`, `14`, `23` are **re-measured** at `1a14a036` using Rev 1's own stated commands. The method was validated by reproducing Rev 1's numbers exactly at Rev 1's commit (tables 198, indexes 331, FKs 54, controllers 99, pages 151, migrations 220).
- **Module depth scores** in `02`, `10`, `11` are **re-estimates from merged source**, on the same design-review basis as Rev 1 — *not* a live benchmark run.
- **The overall ~68/100 readiness score is unchanged.** Per this audit's scoring rule, it is gated by the three P0 blockers, all of which remain open. The weighted component arithmetic does rise (73.4 → 75.4, see `20`), but effective readiness does not move until the P0 gate clears.
- **P0 G-03 (browser E2E) is NOT closed**, despite browser specs rising 1 → 10. The Rev 1 ship-gate is the *spine* journey (lead→quote→contract→project→invoice→payment); a grep across `apps/web/e2e` for those entities returns **no matches**. The new specs cover the five delivery-half workflows, not the spine.
- **One Rev 1 metric is corrected as a mismeasurement**, not a change: see the RLS row in the table below.
- **G-07 (rate limiting + CORS) was found closed incidentally** while verifying the workflow claims. It was **not** delivered by these five PRs — it landed via commit `2377a5a1` on a parallel branch dated the same day as Rev 1, so Rev 1 was accurate at its own commit and went stale on merge. Docs `05`, `07`, `17`, `19`, `20`, `22` are updated accordingly. *Implication: this register can drift from any merge, not only from the work under review — a periodic re-verification sweep is worth more than a per-PR update.*

## Repository facts (measured, not claimed)

Re-measured at Rev 2 commit `1a14a036`. The Rev 1 column is retained so every delta is auditable.

| Metric | Rev 1 (`246b8dd9`) | **Rev 2 (`1a14a036`)** | How measured |
|---|--:|--:|---|
| Business modules (`modules/*`) | 20 | **20** | `ls modules` |
| API controllers | 99 | **101** | `find apps/api/src -name '*.controller.ts'` |
| HTTP endpoint decorators | 854 | *not re-measured* | `grep -rhoE '@(Get\|Post\|Put\|Patch\|Delete)\('` |
| Web pages (`page.tsx`) | 151 | **164** | `find apps/web/app -name page.tsx` |
| DB tables (CREATE TABLE) | 198 distinct | **218 distinct** | `grep 'CREATE TABLE' infrastructure/migrations` |
| SQL migrations | 220 (gap-free →`0220`) | **228** (gap-free →`0228`) | `ls infrastructure/migrations` |
| DB indexes | 331 | **358** | `grep 'CREATE (UNIQUE )?INDEX'` |
| Explicit FK / REFERENCES | 54 | **62** | `grep 'REFERENCES\|FOREIGN KEY'` |
| RLS policy statements | ~~128~~ *(see note)* | **148** `CREATE POLICY` · 40 `ROW LEVEL SECURITY` lines in 15 files | `grep -c 'CREATE POLICY'` |
| Test files (source) | 249 | **262** | `find … -name '*.test.ts'` excl. dist/node_modules |
| API E2E specs (Supertest) | 33 | **41** | `find apps/api/test -name '*.e2e-spec.ts'` |
| Web E2E specs (Playwright) | 1 | **10** | `find apps/web/e2e -name '*.spec.ts'` |
| Cross-module reactors | 28 | **29** | `grep -c "subscribe('…'" cross-module-subscriber.ts` |
| Persistence stores | 284 (110 PG / 93 in-memory) | *not re-measured* | every in-memory store has a Postgres counterpart |
| ADRs | 19 | *not re-measured* | `find *adr* -name '*.md'` |

> **Correction (Rev 2).** Rev 1's "RLS-touching migrations — 128, measured by `grep 'ROW LEVEL SECURITY'`" is **not reproducible**. Re-running that exact grep at Rev 1's own commit yields 38 matching lines across 14 migration files (56 lines / 24 files repo-wide) — not 128. The nearest reproducible figure at Rev 1 was `CREATE POLICY` = 132. The row is restated above as a policy-statement count with its real command. **This is a Rev 1 measurement error, not a change in the codebase**, and it does not alter any Rev 1 conclusion: RLS breadth was and remains substantial.

## Scores (0–100; methodology in `20-PRODUCTION-READINESS.md`)

Rev 2 scores are **re-estimates from merged source on the same design-review basis as Rev 1**, not a live benchmark run. Unchanged dimensions are shown once.

| Dimension | Rev 1 | **Rev 2** | One-line basis |
|---|--:|--:|---|
| Architecture | 86 | 86 | Modular monolith, ports/adapters, dual-store seam, event-driven, 19 ADRs |
| Backend | 80 | 80 | 20 well-factored domain packages; back-half orchestration now deeper (see `02`) |
| Frontend | 64 | **68** | 164 SSR pages (+13); back-half registers/360s added; error-swallowing unfixed |
| Database | 84 | 84 | 218 tables, gap-free migrations, 358 indexes, comprehensive RLS |
| Security | 71 | **74** | Fail-closed design **+ edge hardening now real** (rate-limit guard, CORS allowlist, CSP, body cap); still config-gated on auth |
| Multi-tenancy | 83 | 83 | App-guard + RLS + tenant-scoped pool; **not verified on prod DB** |
| ERP functionality | 66 | **72** | Five delivery-half verticals moved from CRUD to governed lifecycle |
| Workflow integrity | 72 | **75** | 29 cross-module reactors + 5 new in-module state machines with enforced gates |
| Testing | 62 | **68** | 262 unit/module + 41 API E2E + 10 browser E2E; spine browser journeys still absent |
| DevOps | 80 | 80 | Mature CI + migration gate + restore drill + Docker |
| Observability | 70 | 70 | Metrics, correlation IDs, OTLP, health, migration gate |
| Performance/Scale | 52 | 52 | In-memory search fan-out; no caching layer; unbenchmarked |
| UX | 62 | **66** | Delivery-half journeys now completable in-app; degraded-state masking remains |
| Data integrity | 74 | **76** | 62 explicit FKs (+8); new child records keyed to parents |
| Documentation | 80 | 80 | Extensive ADRs, reports, master-report |
| **Overall** | **~68** | **~68** | **Unchanged — gated by 3 open P0s.** Weighted arithmetic rises 73.4 → 75.4; see `20` |

## Gap & risk headline

- **P0 blockers: 3 (all still open)** — (1) RLS enforcement posture on staging/prod **NOT VERIFIED** (dev-only per code + prior state); (2) authorization is **inert until a JWT verifier is configured** — production must set it (fail-closed gate exists but is an ops precondition); (3) **no browser E2E over the spine journey**. Rev 2 nuance: browser specs rose 1 → 10 and now cover the five delivery-half workflows end-to-end in CI against a real API, but the Rev 1 ship-gate — lead→quote→contract→project→invoice→payment — remains **uncovered** (verified by grep over `apps/web/e2e`).
- **P1 items: 7** (Rev 1: 9 by count, "~11" in the Rev 1 headline) — search fan-out scaling (G-04), silent frontend error-swallowing (G-05), thin FK-level referential integrity (G-06), no caching / unenforced pagination (G-09), float money (G-10), no outbox operator UI (G-11), inventory lot/valuation depth (G-12).
  - **G-08 (delivery-half UI journeys) largely closed** → downgraded to **P2**, scoped to the four modules still at CRUD level (hse, fleet, assets, amc).
  - **G-07 (rate limiting + CORS allowlist) CLOSED** — edge hardening is on `main` (commit `2377a5a1`). Note this was **not** delivered by the five workflow PRs; it landed on a parallel branch and Rev 1 simply went stale on merge. See the note in `18`.

## Document index

| # | Document | Scope |
|---|---|---|
| 00 | [Executive Summary](00-EXECUTIVE-SUMMARY.md) | CTO-level verdict |
| 01 | [Repository Architecture](01-REPOSITORY-ARCHITECTURE.md) | Structure, stack, patterns |
| 02 | [Module Inventory](02-MODULE-INVENTORY.md) | Every module + maturity matrix |
| 03 | [Business Workflows](03-BUSINESS-WORKFLOWS.md) | End-to-end lifecycle + reactors |
| 04 | [Data Architecture](04-DATA-ARCHITECTURE.md) | Tables, relationships, integrity |
| 05 | [API Audit](05-API-AUDIT.md) | Endpoints, auth, RBAC, validation |
| 06 | [Frontend / UX Audit](06-FRONTEND-UX-AUDIT.md) | Pages, IA, states |
| 07 | [Security Audit](07-SECURITY-AUDIT.md) | Full security assessment + severity matrix |
| 08 | [Multi-tenancy Audit](08-MULTITENANCY-AUDIT.md) | Isolation runtime, RLS |
| 09 | [Finance / ERP Audit](09-FINANCE-ERP-AUDIT.md) | Commercial & financial logic |
| 10 | [Project / Engineering Audit](10-PROJECT-ENGINEERING-AUDIT.md) | Projects, engineering, site, QA/QC, HSE |
| 11 | [Commissioning / Handover / AMC](11-COMMISSIONING-HANDOVER-AMC.md) | Post-execution lifecycle |
| 12 | [Inventory / Procurement Audit](12-INVENTORY-PROCUREMENT-AUDIT.md) | P2P + stock |
| 13 | [Admin Control Plane](13-ADMIN-CONTROL-PLANE.md) | `/admin` architecture |
| 14 | [Testing / QA Audit](14-TESTING-QA-AUDIT.md) | Test maturity |
| 15 | [DevOps / Infrastructure](15-DEVOPS-INFRASTRUCTURE.md) | CI/CD, Docker, deploy |
| 16 | [Performance / Scalability](16-PERFORMANCE-SCALABILITY.md) | Scale risks |
| 17 | [Technical Debt](17-TECHNICAL-DEBT.md) | Debt register |
| 18 | [Master Gap Register](18-MASTER-GAP-REGISTER.md) | All gaps, prioritized |
| 19 | [Risk Register](19-RISK-REGISTER.md) | Top architectural risks |
| 20 | [Production Readiness](20-PRODUCTION-READINESS.md) | Scoring methodology |
| 21 | [Enterprise Maturity](21-ENTERPRISE-MATURITY.md) | Tier-1 comparison |
| 22 | [Recommended Roadmap](22-RECOMMENDED-ROADMAP.md) | P0–P4 plan |
| 23 | [Traceability Matrix](23-TRACEABILITY-MATRIX.md) | Requirement → module → API → DB → UI → test |

## Evidence classification legend

`VERIFIED_IMPLEMENTED` · `IMPLEMENTED_BUT_UNVERIFIED` · `PARTIALLY_IMPLEMENTED` · `MOCKED` · `PLACEHOLDER` · `DEAD_CODE` · `DOCUMENTED_ONLY` · `MISSING` · `BROKEN` · `BLOCKED_BY_CONFIGURATION` · `BLOCKED_BY_INFRASTRUCTURE`
