# AURA OS — Consolidated Gap Register **v2** — Current Tree Verification

**Date:** 2026-08-10 · **Supersedes:** [Baseline v1 — 2026-08-05](2026-08-05-consolidated-gap-register.md) (frozen)
**Tree verified:** `claude/audit-diff-contract-invoice` **after merging `main`** (merge `0eddb22`), level with `main`, `pnpm typecheck` 47/47 · `pnpm test` 47/47 · `pnpm build` 25/25.

This re-tests all 50 v1 IDs against the tree and adds the gaps that emerged from the Admin, Offline and Idempotency work. v1 remains the provenance record — where each ID was defined, and where the 2026-08-05 fix wave and the two retractions are written down.

---

## Read this first — the merge that had to happen before any of it counted

The branch carrying the Admin / Offline / Idempotency work was **45 commits behind `main`**, and `main` already held the 2026-08-05 fix wave. Verifying against it unmerged would have reported **G-04, G-05, G-08, G-11, G-24 as re-opened** when they are closed — the exact "stale closed row" failure v1's own change log warns about.

Merging surfaced something worse. Three conflicts, **two of them duplicate implementations of work `main` already had**:

| Conflict | `main` | The batch |
|---|---|---|
| `customer-invoice.service.ts` | `evaluateContractCap` + `CONTRACT_CAP_PORT`, ADR-0004 port/adapter, VAT-exclusive, 10 domain + 5 HTTP e2e | inline `validateContractCeiling` comparing **gross** — the exact trap v1 records as caught-before-merge on G-08 |
| `purchase-order.service.ts` | G-12 diff via shared `diffFields` + real actor stamping | local diff over a hardcoded field list |

Both resolved in `main`'s favour; the dead duplicate rule and its tests removed. This is the **third** instance of the same defect in one batch — the first was a second `IdempotencyService` shadowing the wired one. See **N-05**.

---

## How to read this

| Mark | Means |
|:--:|---|
| ✅ | **Re-verified by me on 2026-08-10** against the merged tree — grep over the working tree, live SQL against the running DB, or an HTTP probe against the booted API |
| 📄 | **Carried from v1 on its author's authority — NOT re-tested in this pass.** Treat as v1's claim, not mine |
| 🆕 | First recorded 2026-08-10 |

**Severity:** **P0** ship-blocking · **P1** required for a complete lifecycle · **P2** production hardening · **P3** strategic.

**Not claimed anywhere here:** any readiness or journey score, production-build performance, or functional-completeness percentage. None were measured today.

---

## The three gates, in order

Everything else waits behind these.

### ✅ P0 · G-03 — RLS live enforcement — **CLOSED on dev 2026-08-10**

> **Was:** `current_user = postgres`, `rolbypassrls = true` — every policy on 182 tables bypassed.
> **Now:** `current_user = aura_app`, `rolbypassrls = false`, and the boot gate agrees:
> `✓ RLS posture: DB role "aura_app" is non-BYPASSRLS — FORCE RLS tenant policies are active.`
>
> **The two acceptance tests you set, run live against Supabase** (`rls-isolation-test.mjs`, 15/15):
> `✓ tenant A sees exactly its own row` · `✓ tenant A cannot SELECT tenant B's row`
> — plus UPDATE/DELETE/INSERT-attribution denial, fail-closed on missing context, no leak across a
> context switch, and the global-template path still visible to both tenants.
>
> **Connection split, exactly as specified — the API never holds the owner secret:**
> `DATABASE_URL` → `aura_app` (runtime) · `MIGRATION_DATABASE_URL` → owner (schema, seeding,
> cross-tenant maintenance). Escape hatch `ALLOW_RLS_BYPASS=true` retained and still fatal in
> production.
>
> **Runtime proven under the restricted role:** reads 200, `POST /crm/accounts` 201, outbox relay
> 0 permission errors, `pnpm db:migrate` applies as owner, `rls-fitness` 183/183 enabled + forced
> + policied.
>
> **Still open on this row:** staging and production have not been flipped — only dev. Closing
> there is the same four steps in
> [the runbook](../runbooks/rls-tenant-isolation.md#the-two-connection-split-g-03-activated-on-dev-2026-08-10).

**The original finding, for the record:**

```sql
select current_user, (select rolbypassrls from pg_roles where rolname = current_user);
-- current_user = postgres    rolbypassrls = true
```

`DATABASE_URL` in `apps/api/.env.local` points at `postgres.jzhvmempkpgitmfunoyr`. Every policy on all 182 tables is bypassed at runtime. The mechanism is complete and CI-proven; **only the connection role is wrong.**

**Agreed shape — enforce, but keep development able to write.** The escape hatch already exists: `apps/api/src/main.ts:76` honours a loud `ALLOW_RLS_BYPASS=true` override, and `evaluateRlsPosture` refuses to boot production under a bypassing role. So this is configuration plus a seam check, not construction:

1. Point the app's `DATABASE_URL` at the least-privilege `aura_app` role.
2. Keep a separate owner-role URL for migrations, seeding and schema work — `ALLOW_RLS_BYPASS=true`, loudly logged, never in production.
3. Verify the split: app connection returns `rolbypassrls = false`; the migration path still applies `infrastructure/migrations` end to end.
4. Re-probe tenant isolation before calling it closed.

Until step 1, **every multi-tenant guarantee in this platform is unenforced at runtime.**

### ◑ P1 · G-07 — HTTP edge security — **headers, CSP, CORS, body cap and rate limiting DONE; SCIM still open**

**Was:** `helmet` 0, CSP 0, throttle 0, SCIM 0; `RateLimiter` present at
`core/src/reliability/rate-limiter.ts` but bound to nothing, which is why the register recorded
rate limiting as absent despite the class existing.

**Now, measured against the booted API:**

```
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
X-Content-Type-Options: nosniff      Referrer-Policy: no-referrer
X-Frame-Options: SAMEORIGIN          Origin-Agent-Cluster: ?1
X-RateLimit-Limit: 5                 X-RateLimit-Window: 60
```

Swagger UI gets its own, looser policy (`script-src 'self' 'unsafe-inline'`) because it is real
HTML — a JSON API otherwise needs no resources at all, hence `default-src 'none'` everywhere else.

**Rate limiting is live, and it is the existing `RateLimiter` bound rather than a new dependency.**
With the cap set to 5: `200 200 200 200 200 429 429`, `Retry-After: 60`, and `/health` exempt
across 20 consecutive calls. Per-IP, so one noisy caller cannot block everyone; `trust proxy` is
set, without which every request shares one bucket behind a load balancer and the limiter throttles
everybody at once.

Also: CORS moved off bare `enableCors()` (which reflects **every** origin) to an allowlist that
locks down and warns loudly if production has none, and an explicit 2MB body cap in place of the
framework default.

Decisions live in `core/src/http/edge-security.ts` as pure functions — 29 tests — for the reason
this row existed: a security gate inline in a 300-line bootstrap is one nobody reads, and this one
was mis-reported as "partial" for weeks while being wholly absent.

**Still open on this row: SCIM — 0 files.** User provisioning/de-provisioning against an IdP is an
identity programme, not an edge control, and is not covered by any of the above.

### 🟠 P1 · Field E2E + G-20 ELV compliance

Two halves of one gate: can the field actually be worked, and is this an *ELV* ERP.

- **Field E2E** — the offline engine now exists (**G-25, G-26 closed below**), but the end-to-end run has never been done: create offline → kill network → reconnect → sync → kill the browser mid-sync → reopen → confirm the queue resumes and nothing double-commits. See **N-01**.
- **G-20 ELV compliance** — **measured today: 0 files** matching SIRA/DCD across `modules` and `apps/web/app`. Unchanged from v1. Market-entry blocker for UAE ELV security systems.

---

## 1 · Security & access control

| ID | Status 2026-08-10 | Sev | Ev |
|---|---|:--:|:--:|
| **G-01** | **OPEN.** Auth off by default in dev; unauthenticated reads return live data. Staged pass-through, not a production hole (G-02) | P2 | 📄 |
| ~~G-02~~ | RETRACTED in v1 — production refuses to boot without a verifier | — | 📄 |
| ◑ **G-03** | **CLOSED on dev 2026-08-10** — `aura_app`, `rolbypassrls = false`, 15/15 isolation assertions live. **Staging/production not yet flipped.** See the gate above | **P0** → P1 | ✅ |
| ~~G-04~~ | **CLOSED, confirmed.** `apps/api/src/auth/elv-roles.ts` present, 11 roles | — | ✅ |
| ~~G-05~~ | **CLOSED, confirmed.** Read-only `client` role in the same file | — | ✅ |
| ~~G-06~~ | CLOSED in v1 | — | 📄 |
| ◑ **G-07** | **MOSTLY CLOSED 2026-08-10.** helmet + per-path CSP + CORS allowlist + 2MB body cap + per-IP rate limiting, all verified live (`200×5 → 429`, `Retry-After: 60`, `/health` exempt). **SCIM still 0 files** — an identity programme, not an edge control | ~~P1~~ → P2 (SCIM) | ✅ |

## 2 · Data integrity & audit

| ID | Status 2026-08-10 | Sev | Ev |
|---|---|:--:|:--:|
| ~~G-08~~ | **CLOSED, confirmed.** `modules/finance/src/domain/contract-cap.ts` present and bound. The batch's duplicate was removed in the merge | — | ✅ |
| ~~G-09~~ | CLOSED in v1 | — | 📄 |
| **G-10** | 7 dangling references in the dev DB. Not re-tested | P2 | 📄 |
| ~~**G-11**~~ | **CLOSED 2026-08-10 — cleanup executed.** Was 7 duplicated names (Majid Al Futtaim had reached ×4). `merge-duplicate-accounts.mjs --apply` re-pointed **50 rows across 12 referencing tables** and retired **13 accounts**, in one transaction, with an undo map naming every moved row. Losers are **renamed** `Name [merged→<id>]`, not deleted, so the merge is reversible. **After: 0 active duplicate names**, 13 retired and still queryable, and the orphan scan holds at **7** — the pre-existing G-10 figure, so the merge created none. CRM close-out is unblocked | — | ✅ |
| ~~G-12~~ | **CLOSED, confirmed.** `diffFields` in `purchase-order.service.ts` with real actor stamping | — | ✅ |
| **G-13** | Cross-module orphans by design (ADR-0001), orphan scan CI-enforced. Count not re-tested | P3 | 📄 |

## 3 · Delivery-to-service spine

| ID | Status 2026-08-10 | Sev | Ev |
|---|---|:--:|:--:|
| **G-14** | Field-service loop has no field end — dispatch exists, technician mobile does not. Partially eased by the new capture primitives, but no technician surface | **P1** | 📄 |
| **G-15** | AMC field execution loop missing | **P1** | 📄 |
| **G-16** | Handover O&M / as-built bundle not generated from the DMS | P2 | 📄 |
| ~~G-17~~ | **CLOSED 2026-08-10.** `modules/site/src/domain/survey.ts` present; `site.survey.completed` subscribed in `cross-module-subscriber.ts`, raising an Opportunity with `source='site-survey'` and the survey id. ⚠️ See **N-02** — the AMC half of the same reactor hooks the wrong event | — | ✅ |
| **G-18** | No progress-tracking UI for execution | P2 | 📄 |
| **G-19** | EVM surfaced but shallow; no per-project controls cockpit | P2 | 📄 |

## 4 · ELV vertical fit

| ID | Status 2026-08-10 | Sev | Ev |
|---|---|:--:|:--:|
| **G-20** | **OPEN — P1 gate.** SIRA/DCD: **0 files** | **P1** | ✅ |
| **G-21** | **OPEN.** Device schedules / as-built device registers: **0 files** | **P1** | ✅ |
| **G-22** | **OPEN.** KNX: **0 files**. BMS remains a discipline label only | P2 | ✅ |
| **G-23** | **OPEN.** Cable schedule / port mapping: **0 files** | P2 | ✅ |
| ~~G-24~~ | CLOSED in v1 (10-SKU ELV catalogue). My live count query hit the wrong table, so **not re-confirmed today** — carried | — | 📄 |

## 5 · Field & mobile

| ID | Status 2026-08-10 | Sev | Ev |
|---|---|:--:|:--:|
| ~~G-25~~ | **CLOSED 2026-08-10.** `apps/web/public/sw.js` + `manifest.json` + `lib/offline-store.ts` (IndexedDB queue) + `lib/offline-sync.ts` (backoff/jitter, error classification). Daily reports and labour returns run through it; topbar shows Synced / Pending / Offline / Failed. **Not yet E2E-proven — see N-01** | — | ✅ |
| ~~G-26~~ | **CLOSED 2026-08-10.** Signature capture in **8 components** (was 0). File inputs in 4. ⚠️ **Camera capture is still 1 file** — `capture=` is very nearly as absent as v1 found it | — | ✅ |
| **G-27** | **OPEN.** No technician/site mobile surface. The primitives now exist; the surface does not | **P1** | 📄 |

## 6 · UI / UX

| ID | Status 2026-08-10 | Sev | Ev |
|---|---|:--:|:--:|
| ~~G-28~~ / ~~G-29~~ | CLOSED in v1 | — | 📄 |
| **G-30** | Inline buttons/tables not migrated to the shared kit. `AuraDataTable` now exists and BOQ uses it — one register of many | P2 | 📄 |
| ◑ **G-31** | **PART-CLOSED.** Next-best-action now on **6 components** (was 4 CRM 360s): + contracts register, payment certificates, commissioning, handover, customer invoices. Operational forms still have none | P2 | ✅ |
| ◑ **G-32** | **PART-CLOSED.** Busy/`aria-busy` + "Saving…" on the Opportunity 360 money-cycle actions. Not swept app-wide | P2 | ✅ |
| **G-33** | Full-page refresh on every mutation | P2 | 📄 |
| **G-34** | **OPEN.** No unified approvals inbox. `/inbox` exists but is not an approvals queue | P2 | ✅ |
| **G-35** | **OPEN.** `/tendering/pricing` still orphaned — **0 references in `nav.ts`**, despite now being the flagship AuraDataTable screen | P3 | ✅ |

## 7 · Performance & scale

| ID | Status 2026-08-10 | Sev | Ev |
|---|---|:--:|:--:|
| **G-36** | Global search in-memory O(n) fan-out | P2 | 📄 |
| **G-37** | No latency validation at 1k–10k rows | P2 | 📄 |
| ~~G-38~~ | Retired claim — do not quote the "5–7s first paint" figure | — | 📄 |
| **G-39** | No caching, APM or load test | P2 | 📄 |

## 8 · Commercial & platform modules

| ID | Status 2026-08-10 | Sev | Ev |
|---|---|:--:|:--:|
| ◑ **G-40** | **PART-CLOSED.** Clause library landed on `main` — `modules/contracts/src/clause.service.ts`, `clause-store.ts`, `clause-library-client.tsx`. Variation approval still does not auto-adjust contract value | **P1** | ✅ |
| **G-41** | No Analytics OS / report builder | P2 | 📄 |
| **G-42** | No governed master-data management | P2 | 📄 |
| **G-43** / **G-44** | No subcontractor / customer / vendor portals | P3 | 📄 |
| **G-45** | Two pricing engines still not unified | P2 | 📄 |
| **G-46** | No unified document layer | P2 | 📄 |
| **G-47** | Warehouse depth thin; estimator UI thin | P2 | 📄 |
| **G-48** | AI platform in LOCAL fallback — 29 `ANTHROPIC_API_KEY` references in code, key not set in the running env | P2 | 📄 |
| ~~G-49~~ / ~~G-50~~ | RETRACTED / CLOSED in v1 | — | 📄 |

---

## New rows — from the Admin / Offline / Idempotency work

| ID | Gap | Sev | Ev |
|---|---|:--:|:--:|
| **N-01** | **The offline engine has no meaningful test and no E2E run.** `apps/web/lib/offline-sync.test.ts` is **one assertion over `generateUUID`**. Queue ordering, retry backoff, the failed-after-5-attempts terminal state, and 409 handling are untested; the crash-recovery scenario (browser killed mid-sync → reopened → queue resumes, nothing double-commits) has never been run. This is the Field-E2E half of gate 3 | **P1** | ✅ 🆕 |
| **N-02** | **AMC drafts off the wrong event.** `cross-module-subscriber.ts` triggers `amc.createFromHandover` on `projects.project.completed`. Project completion is not handover signed — the warranty clock starts at signature, so the AMC can be drafted before the client has accepted anything. Should hook a handover-signed event | **P1** | ✅ 🆕 |
| **N-03** | **Duplicate-implementation defect class.** Three in one batch: a second `IdempotencyService`, a second AR billing cap, a second PO field diff — each shadowing working code already on `main`. Root cause is building against a stale tree; the control is to rebase before starting, not to review harder | **P1** | ✅ 🆕 |
| ◑ **N-04** | **Browser verification now exists** — `apps/web/e2e/admin-control-center.spec.ts`. The shell itself is fine: `/admin` renders with its domain tabs and throws no client-side exception. **Four DoD rows did not survive it**, each recorded as a `fixme` rather than deleted: (a) **legacy routes do not redirect** — no middleware, no `next.config` redirect, `app/admin/users/page.tsx` renders standalone, so `/admin` is a **24th** admin surface beside the 23, not a consolidation; (b) **sub-tab deep links are discarded** — `?tab=users&sub=roles` never surfaces Roles & Grants; (c) **tab changes never reach the URL**, so no admin view is linkable, bookmarkable, or reachable with Back; (d) **the restore guard has no backend** — `backup-restore-panel.tsx` makes **0** API calls and fabricates the string `"Audit event logged: {…}"`; no server-side restore endpoint exists and `RESTORE PRODUCTION` appears nowhere under `apps/api`/`core`. The typed confirmation is real; what it guards is not. Also fixed in passing: `overview` was missing from the BFF allowlist, so `/api/admin/platform/overview` 404'd client-side while the API served 200. **Still open:** RBAC 403s and tenant isolation are deliberately not covered here — auth is off in dev, so a browser assertion would pass for the wrong reason; they belong in the API e2e suite | **P1** | ✅ |
| ~~**N-05**~~ | **CLOSED 2026-08-10 — and the diagnosis was wrong.** The guard already existed: `scripts/migration-policy-check.mjs` checks duplicate numbers, gap-freedom and `@DOWN`, and CI has run it since 2026-07-09. It would have caught **both** collisions. The gap was *when* it ran — CI only fires on push, and this branch was never pushed, so two duplicate numbers reached commits unchallenged. Fixed by running the existing checks at commit time: `.githooks/pre-commit` (migration policy · ADR registry · a staged-diff credential scan), enabled with `pnpm hooks:install`, bypassable with `--no-verify`. **Proven:** a duplicate `0221` and a planted `postgresql://user:pass@host` were each blocked. The check also caught a real violation in `0221_idempotency_records.sql` — no `@DOWN` section, which CI would have failed on | — | ✅ |
| **N-06** | **`docs/reports/README.md` — the reports index — does not exist** on this branch or in `HEAD`, though the estate convention treats it as authoritative and it is the documented home of the only quotable measured numbers | P2 | ✅ 🆕 |
| **N-07** | **`apps/web` had no test task at all** until 2026-08-10 (`@aura/web#test -> <NONEXISTENT>`), and its tsconfig excluded `**/*.test.ts(x)`. Fixed, but every web-side test written before now was inert. Worth assuming the same of any other package before quoting its coverage | P2 | ✅ 🆕 |

### Closed remediation — **not** open gaps

**Idempotency is proven, not pending.** Per your instruction, recorded here as remediation:

- Duplicate migration renumbered `0078` → `0220`; the duplicate-prefix guard passes over 220 migrations.
- One `IdempotencyService`, Postgres-backed on `aura_idempotency_records`, single-upsert lease claim, hash-guarded reclaim, `ConflictException` (the dead copy's `Error('409: …')` classified as **500**).
- `IdempotencyInterceptor` bound as `APP_INTERCEPTOR`; mutations only, no header → pass-through.

**Verified live against the booted API, Postgres-backed:**

```
POST /api/v1/crm/accounts  key=K payload=A  -> 201, id cfef52ea…
POST same key, same payload                 -> 201, X-Idempotent-Replay: true, same id
POST same key, payload B                    -> 409 CONFLICT
```

Three POSTs → **1 row**. Lease persisted as `status=completed, response_status=201`, confirming the Postgres path, not the in-process fallback. Commits `f1b1ff7`, `94853b9`, `199f12e`.

---

## Provenance

**Re-verified live 2026-08-10** (✅): G-03, G-04, G-05, G-07, G-08, G-11, G-12, G-17, G-20, G-21, G-22, G-23, G-25, G-26, G-31, G-32, G-34, G-35, G-40, and all seven N-rows.
Method: grep over the merged working tree; SQL against the running Supabase DB (`current_user`/`rolbypassrls`, account-name duplicate counts, `aura_idempotency_records`); HTTP probes against the API booted from the production build on port 4137; `pnpm typecheck` / `test` / `build`.

**Carried from v1, not re-tested** (📄): G-01, G-02, G-06, G-09, G-10, G-13, G-14, G-15, G-16, G-18, G-19, G-24, G-27, G-28, G-29, G-30, G-33, G-36, G-37, G-38, G-39, G-41–G-48, G-49, G-50.

**Not measured, not claimed:** journey scores, readiness scores, production-build performance, module-completeness percentages.
