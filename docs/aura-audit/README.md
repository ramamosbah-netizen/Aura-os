# AURA OS — Master Reverse-Engineering & Production-Readiness Audit

> **Verdict (Rev 2.6):** AURA OS is at **Architectural Maturity Level 3.5 (Production Application trending Enterprise Platform)**, with **~68/100 production readiness**, and requires **2 P0 blockers** and **6 P1 items** resolved before enterprise production deployment. **Both remaining P0s are operational** — no code change in this repository can close them.
>
> The readiness headline is **unchanged from Rev 1 by design** — a gate is binary, and two P0s are still unproven. What has changed is *which* work remains: **G-03, G-07 and G-08 are closed**, and **G-05 dropped to P2**. Every P0 a repository change could close is closed. The two survivors, G-01 (production RLS posture) and G-02 (auth configuration), are assertions about environments this repo cannot inspect — so **no further code here moves the number**.

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

### Rev 2.6 — 2026-08-13 (G-05: reads stop lying about emptiness)

`getJson` returned `null` for every failure, so a 500, a 403 and a genuinely empty list rendered identically. In an ERP that is not cosmetic — *"you have no unpaid invoices"* and *"we could not load your unpaid invoices"* are different statements about the business, and only one of them is ever true.

`fetchJson` now returns either data or a **classified** error, and `DataStateNotice` renders each distinctly from `EmptyState`. Migrated the surfaces the browser suite covers: accounts, quotations, contracts, projects, invoices, and the permit/work-order/asset registers. On multi-fetch pages only the load-bearing read moved — an empty bond or PO picker degrades harmlessly, *"no contracts"* does not.

`getJson` is **kept**, delegating to `fetchJson`, so the ~440 other call sites are untouched. That is a decision, not unfinished work: for badges and secondary panels an empty render is the right degradation, and rewriting 451 call sites to make a point would be churn.

Three pages had already tried to draw this distinction and called every failure **"API offline"** — wrong for a 403, and useless to someone whose session simply lapsed.

**The wording is the remedy**, so the unit tests assert it: no message may claim emptiness, a refusal must say the records may exist, an expired session must say what to do and that nothing was lost.

**Negative control:** reverting the accounts page to the old behaviour makes the new browser test fail (element not found); restoring it makes it pass. The assertion bites.

**Verified:** full browser suite **42 passed / 0 failed / 1 skipped, twice**, on a fresh auth-enabled API · web unit 8 · typecheck clean · lint 0 errors. G-05 drops **P1 → P2**; Frontend 68 → 72, weighted total 76.4 → 76.7.

*Suite-stability note:* runs against an API carrying data from a dozen earlier runs showed 2–11 varying failures; a fresh API is green twice over, so that is accumulated local state. G-05 does make a transient read failure fail **fast and visibly** rather than time out — which is the intended behaviour, and worth knowing when reading a red run.

### Rev 2.5 — 2026-08-13 (G-03 CLOSED — the suite now signs in)

The last P0 a repository change could close. **P0 count 3 → 2**, the first movement since Rev 1.

The blocker was never writing the spec. Setting `AUTH_JWT_SECRET` engages `PermissionsGuard` across the *whole* surface, and grants only ever hydrated from Postgres — so an in-memory boot had none and every route refused. Measured directly:

| Request | Result |
|---|---|
| `POST /crm/accounts` unauthenticated | **403** |
| the same call with a granted token | **201** |

`AUTH_SEED_DEV_ADMIN` supplies that grant, behind three independent guards — the flag must be the literal `"true"`, `NODE_ENV` must not be production (refused *loudly* if it is), and no `DATABASE_URL` may be configured. Each guard has its own test. It takes a **list** of users, because segregation of duties cannot be exercised by one principal.

Playwright global setup signs in through the **real login form** once and shares the session; CI boots the API with a verifier and **fails the job if auth did not engage**, so the suite cannot quietly pass on the unauthenticated path — which is the failure mode this whole gate exists to prevent.

**Turning auth on immediately made a real control bite.** `permit-workflow` started failing because the signed-in user both requested *and* approved a permit, and segregation of duties refused it — correctly. That gate had been **inert** for as long as auth was off: no actor meant no recorded requester. A new browser test now asserts that refusal, which could not have been written before.

Also pins the locale on three client components whose bare `toLocaleDateString()` renders `en-AE` on the server and `en-US` in the browser, so React discarded the subtree on hydration and elements vanished mid-assertion. A real bug, still live on `main`; overlaps the wider sweep in PR #213.

**Verified:** full browser suite **41 passed / 0 failed / 1 skipped, twice**, on a cold web server against a fresh auth-enabled API — including the login test and all six spine journeys. core identity 50 · api unit 76 · api e2e 43 files / 220 tests · typecheck clean · lint 0 errors.

**What is NOT claimed:** G-01 and G-02 are untouched. This proves the app works for an authenticated user against a dev-seeded grant. It says nothing about production RLS posture or a real IdP — and **no further code in this repository will move the readiness number.**

### Rev 2.4 — 2026-08-13 (`offline-sync:168` closed — and two corrections to how it was reported)

The flaky spec this audit has now mis-diagnosed twice is fixed (PR #210). Both earlier readings were wrong, and the second error is the one worth recording: **Rev 2.2 called it a test-isolation defect, and it was not.**

| Rev 2.2 said | What it actually was |
|---|---|
| A flaky spec | A spec that **raced its own setup**. It killed the page against the reconnect; when the close won, the item was still `pending`, so the reopened session sent it for the *first* time and the deduplication under test was never exercised. The **green** runs were the ones that failed to stage the scenario |
| Its offline queue poisons the next spec | Unreproducible at `1a14a036`, where `permit-workflow.spec.ts` does not exist. Playwright isolates contexts per test. The one genuinely shared channel was an **aborted in-flight request against the common `next dev` server** |
| An open test-isolation defect | **Two engine defects.** A reclaimed stranded item served a backoff it had never earned (`updateOfflineItemStatus(…, 'pending')` stamps `lastAttemptAt = now`), and nothing anywhere acted on a computed backoff — every deferred retry fell through to the 60s sweep, past the spec's own 30s poll |

Staging the crash properly then surfaced a live product bug the suite had never been able to reach: the Next BFF rebuilt its outbound headers and **dropped `Idempotency-Key`**, so every offline replay double-committed. A field engineer's report, filed offline and replayed after a crash, was landing twice.

**Verified:** `offline-sync.spec.ts --repeat-each 6` → 24/24, the crash test ~3.9s where it previously timed out at 32s · full browser suite on `main` **28 passed / 0 failed / 1 skipped** · five `offline-sync` → *X* pairings all green · typecheck, web unit, `next build` clean · lint 0 errors. Negative control: removing the header forwarding makes the spec read **2 rows**, so the assertion is load-bearing.

**The poisoning claim does not reproduce.** Run five times at `104e67f1` in an isolated worktree with the spec **unfixed**: `offline-sync:168` failed once, in the genuine way, and **both `permit-workflow` tests passed in that same run** (10/10 across all five). Rev 2.2 called it "reproduced deterministically"; one counterexample settles that. Measured pre-auth, at the commit the claim was made against — Rev 2.5 has since changed how `permit-workflow` behaves, so the pairing is worth re-checking under auth. Scores are untouched: nothing here was measured against the readiness rubric.

### Rev 2.3 — 2026-08-12 (G-08 CLOSED: amc, assets, fleet)

The last three modules named in G-08. None is a safety control, so each was judged on whether it kept a **financial or recovery record honest** — and none of them did.

| Module | The refusal that was missing |
|---|---|
| **amc** (mig `0230`) | A work order could be raised against an **expired or terminated contract** — and the AMC→AR reactor would invoice against it. The **PPM sweep** created visits directly, bypassing the check entirely; a schedule left running on a dead contract minted billable visits forever |
| **assets** (mig `0231`) | An asset could be **disposed mid-repair**, posting cost to a settled asset and computing gain/loss from a book value maintenance was still moving. Depreciation also continued after disposal |
| **fleet** | `disputed` was a **dead end** — a contested fine could never be recovered or written off, while still counting toward outstanding exposure |

AMC also now stamps the **SLA outcome** at completion from the contract that governed the visit — snapshotted, not recomputed, because contract terms change and a recomputed figure quietly re-judges history. Ad-hoc orders read "not measured", never "missed". And `startWork()` had been on the class since the beginning with **nothing ever calling it**; `in_progress` was unreachable.

**Verified:** amc 19→33 · assets 20→30 · fleet 28→35 module tests · API E2E 42→43 (every gate asserted as a 409) · browser E2E 12→13 · **full browser suite 39 passed / 0 failed** on a fresh API · api unit 76 · typecheck clean · lint 0 errors.

**G-08 is closed.** Every module it named now enforces its lifecycle. Tests that encoded the *ungoverned* behaviour were corrected rather than relaxed — one scheduled maintenance against an asset id that did not exist, which is exactly the hole that would let the disposal gate be bypassed.

### Rev 2.2 — 2026-08-12 (G-08 residue: the HSE permit-to-work engine)

HSE was the last delivery-half module still at CRUD, and the one where CRUD is a safety matter rather than a reporting one. Migration `0229` makes it governed.

**Permit to work** is now an authorisation, not a status field. Three gates stand in front of approval, all enforced in the service and all asserted as **409 refusals** in the E2E suite:

| Gate | Refusal |
|---|---|
| Approved risk assessment | A permit citing none — or citing a `draft` one — cannot be approved |
| Segregation of duties | The requester cannot approve their own permit |
| Validity window | A permit outside its own window cannot be issued |

**Incident investigation** gains `reported → investigating → closed` with a mandatory root cause, and closure is **refused while corrective actions raised against that incident are still open** — the same shape of control as the commissioning punch list. Incidents (unlike permits) can be reopened: new evidence must not force a second, disconnected record.

The **Permit 360** shows the gates *before* the user clicks approve and names the failing one. The disabled button is a convenience; the service is the control.

**Verified:** HSE module tests 18 → 34 · API E2E 41 → 42 · browser E2E 11 → 12 · full browser suite **35 passed / 1 failed** on a fresh API, the single failure being the pre-existing flaky `offline-sync:168` (see the correction in `14`). typecheck clean · lint 0 errors.

**G-08 drops P2 → P3.** Every safety- and delivery-critical module is now governed; what remains (fleet, assets, amc) are asset registers.

### Rev 2.1 — 2026-08-12 (G-03 remediation: the spine browser suite)

First revision to record work done **in response to** the audit rather than merely discovered by it.

`spine-journey.spec.ts` (commit `dee209bc`) covers the acquisition-to-cash spine — account, opportunity, quotation, contract, project, invoice — each **created through the real UI and read back through the real UI**. Root cause of its long absence: the spine pages carried **0 `data-testid` attributes** while every delivery-half page had them, so the specs that existed were the specs that were cheap to write.

**Measured, both ways, against a fresh in-memory API:**

| Run | Result |
|---|---|
| Clean `1a14a036` | 27 passed · 1 failed · 1 skipped |
| With `dee209bc` | **34 passed · 0 failed · 1 skipped** |

A product bug surfaced while making it pass: `FormDrawer` keyed its remount on *"the overrides fetch resolved"* rather than *"the schema changed"*, so every drawer in the app remounted once for nothing — and a user who opened one before that request landed had it **silently closed and their typed input discarded**. Fixed in the same commit.

*(Rev 2.1 also claimed this fix cured `offline-sync:168`. It did not — see the corrections in `14`. Rev 2.2 then called it an open test-isolation defect; **Rev 2.4 corrects that too** and closes the spec, for reasons that had nothing to do with isolation.)*

**G-03 remains P0.** Its acceptance reads *"login → create+read"*; the create+read half is done and green, the **login** half is blocked — `AUTH_JWT_SECRET` engages `PermissionsGuard` across the whole surface, and on an in-memory boot no user holds a grant, so every route would 403. That needs a dev-grant seeding decision, which belongs with G-02. Per Rev 2's own rule — *a gate is binary* — the P0 and the ~68 headline stand.

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
- **The overall ~68/100 readiness score is unchanged.** Per this audit's scoring rule, it is gated by the three P0 blockers, all of which remain open. The weighted component arithmetic does rise (73.4 → 76.1, see `20`), but effective readiness does not move until the P0 gate clears.
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
| SQL migrations | 220 (gap-free →`0220`) | **231** (gap-free →`0231`) | `ls infrastructure/migrations` |
| DB indexes | 331 | **358** | `grep 'CREATE (UNIQUE )?INDEX'` |
| Explicit FK / REFERENCES | 54 | **62** | `grep 'REFERENCES\|FOREIGN KEY'` |
| RLS policy statements | ~~128~~ *(see note)* | **148** `CREATE POLICY` · 40 `ROW LEVEL SECURITY` lines in 15 files | `grep -c 'CREATE POLICY'` |
| Test files (source) | 249 | **262** | `find … -name '*.test.ts'` excl. dist/node_modules |
| API E2E specs (Supertest) | 33 | **43** | `find apps/api/test -name '*.e2e-spec.ts'` |
| Web E2E specs (Playwright) | 1 | **13** (41 tests, run **authenticated**) | `find apps/web/e2e -name '*.spec.ts'` |
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
| Frontend | 64 | **72** ᴿ²·⁶ | 164 SSR pages; back-half registers/360s; **error states no longer masquerade as empty** |
| Database | 84 | 84 | 218 tables, gap-free migrations, 358 indexes, comprehensive RLS |
| Security | 71 | **74** | Fail-closed design **+ edge hardening now real** (rate-limit guard, CORS allowlist, CSP, body cap); still config-gated on auth |
| Multi-tenancy | 83 | 83 | App-guard + RLS + tenant-scoped pool; **not verified on prod DB** |
| ERP functionality | 66 | **76** | **Every** business module owning a lifecycle now enforces it (G-08 closed) |
| Workflow integrity | 72 | **75** | 29 cross-module reactors + 5 new in-module state machines with enforced gates |
| Testing | 62 | **76** ᴿ²·⁵ | 262 unit/module + 43 API E2E + 13 browser E2E (**41 passing, executed, authenticated**) |
| DevOps | 80 | 80 | Mature CI + migration gate + restore drill + Docker |
| Observability | 70 | 70 | Metrics, correlation IDs, OTLP, health, migration gate |
| Performance/Scale | 52 | 52 | In-memory search fan-out; no caching layer; unbenchmarked |
| UX | 62 | **68** | Delivery-half journeys completable in-app; failure vs refusal vs empty now distinguishable |
| Data integrity | 74 | **76** | 62 explicit FKs (+8); new child records keyed to parents |
| Documentation | 80 | 80 | Extensive ADRs, reports, master-report |
| **Overall** | **~68** | **~68** | **Unchanged — gated by 2 open P0s, both operational.** Weighted arithmetic rises 73.4 → 76.7; see `20` |

## Gap & risk headline

- **P0 blockers: 3 (all still open)** — (1) RLS enforcement posture on staging/prod **NOT VERIFIED** (dev-only per code + prior state); (2) authorization is **inert until a JWT verifier is configured** — production must set it (fail-closed gate exists but is an ops precondition); (3) **no browser E2E over the spine journey**. Rev 2 nuance: browser specs rose 1 → 10 and now cover the five delivery-half workflows end-to-end in CI against a real API, but the Rev 1 ship-gate — lead→quote→contract→project→invoice→payment — remains **uncovered** (verified by grep over `apps/web/e2e`).
- **Closed outright: G-07** (edge hardening) and **G-08** (delivery-half journeys, closed at Rev 2.3).
- **P1 items: 6** (Rev 1: 9 by count, "~11" in the Rev 1 headline) — search fan-out scaling (G-04), thin FK-level referential integrity (G-06), no caching / unenforced pagination (G-09), float money (G-10), no outbox operator UI (G-11), inventory lot/valuation depth (G-12). *(G-05 dropped to P2 at Rev 2.6.)*
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
