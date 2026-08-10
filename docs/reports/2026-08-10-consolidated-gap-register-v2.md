# AURA OS — Consolidated Gap Register **v2** — Current Tree Verification

**Date:** 2026-08-10 · **Last updated:** 2026-08-10, end of remediation session
**Supersedes:** [Baseline v1 — 2026-08-05](2026-08-05-consolidated-gap-register.md) (frozen)

**Tree verified:** `claude/audit-diff-contract-invoice` **after merging `main`** (merge `0eddb22`), **35 commits ahead of `main`**, nothing pushed.

**Measured at the close of the session** — every figure below was run, none carried:

| Gate | Result |
|---|---|
| `pnpm typecheck` | **49 / 49** |
| `pnpm test` | **49 / 49** |
| `pnpm build` | **26 / 26** |
| API HTTP e2e | **35 files · 187 tests**, no skips |
| Web browser e2e | admin **11 passed / 1 skipped** · offline **4 passed** |
| `rls-fitness` | **184 / 184** tenant-scoped tables enabled + forced + policied |
| `rls-isolation-test` | **15 / 15** live against Supabase |
| migration policy | **222** files, sequential, `@DOWN` present from 0137 |

This re-tests all 50 v1 IDs against the tree, adds the gaps that emerged from the Admin, Offline and Idempotency work, and records the remediation done against them. v1 remains the provenance record — where each ID was defined, and where the 2026-08-05 fix wave and the two retractions are written down.

---

## Read this first — the merge that had to happen before any of it counted

The branch carrying the Admin / Offline / Idempotency work was **45 commits behind `main`**, and `main` already held the 2026-08-05 fix wave. Verifying against it unmerged would have reported **G-04, G-05, G-08, G-11, G-24 as re-opened** when they are closed — the exact "stale closed row" failure v1's own change log warns about.

Merging surfaced something worse. Three conflicts, **two of them duplicate implementations of work `main` already had**:

| Conflict | `main` | The batch |
|---|---|---|
| `customer-invoice.service.ts` | `evaluateContractCap` + `CONTRACT_CAP_PORT`, ADR-0004 port/adapter, VAT-exclusive, 10 domain + 5 HTTP e2e | inline `validateContractCeiling` comparing **gross** — the exact trap v1 records as caught-before-merge on G-08 |
| `purchase-order.service.ts` | G-12 diff via shared `diffFields` + real actor stamping | local diff over a hardcoded field list |

Both resolved in `main`'s favour; the dead duplicate rule and its tests removed. This is the **third** instance of the same defect in one batch — the first was a second `IdempotencyService` shadowing the wired one. Two more surfaced later (a second AMC reactor, a second `ElvSystem` taxonomy), bringing it to five. See **N-03**.

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
> + policied (184/184 after the ELV table landed).
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

### ◑ P1 · Field E2E ✅ + G-20 ELV compliance 🔴

Two halves of one gate: can the field actually be worked, and is this an *ELV* ERP. The first half is closed; the second is the largest thing still open on this register.

**Field E2E — CLOSED.** `apps/web/e2e/offline-sync.spec.ts`, 4 passing, drives the whole journey: create → offline → queued in IndexedDB → reconnect → drain → **server holds exactly one** — then the crash case, killed mid-sync and reopened, **still exactly one**. It found a real defect on its first run (see **N-01**). This is also the test that finally exercises the idempotency work end to end: the offline queue and the server-side lease are only safe *together*, and nothing had proven the pair.

**G-20 ELV compliance — OPEN, and now the biggest single gap.** Still **0 files** matching SIRA/DCD across `modules` and `apps/web/app`. Approval workflow, authority submission, guard licensing, compliance register, expiry tracking, certificates — none of it exists. Market-entry blocker for UAE ELV security systems.

What changed underneath it: **G-21 and G-23 now have a foundation** (the ELV device model, §4), so a compliance layer has something real to attach to — a SIRA submission is about *these devices on this project*, not free text. That was the sequencing argument for doing the model first.

---

---

## What changed this session — 35 commits, nothing pushed

Ordered as worked. Every row was verified before its commit; the gates in the header are the totals at the close.

| # | Commit | What |
|---|---|---|
| 1 | `f1b1ff7` | renumber the colliding idempotency migration |
| 2 | `94853b9` | fold the duplicate `IdempotencyService` into the wired one |
| 3 | `199f12e` | bind `IdempotencyInterceptor` — `Idempotency-Key` finally means something |
| 4 | `adf125d` | run the web test suite instead of excluding it from typecheck (**N-07**) |
| 5 | `11b043f` | name the 2026-08 reports to convention, drop scratch files |
| 6–19 | `2c60c91` … `d78ffdc` | the ChatGPT-side batch, committed in 14 reviewable slices: UI primitives, new-tab law, money-cycle busy states, PO audit diff, ops-screen adoption, BOQ `AuraDataTable`, offline daily reports, finance/CRM domain rules, survey→opportunity, AI swarm + RAG + WBS rollup, the `/admin` Control Center, closeout routes, seeder dedupe, docs |
| 20 | `0eddb22` | **merge `main`** — 45 commits behind; two conflicts were duplicate implementations |
| 21 | `6b8f5ac` | freeze v1 as Baseline, open this register |
| 22 | `fbd9ea1` | **G-03** RLS enforced under `aura_app`, owner split to `MIGRATION_DATABASE_URL` |
| 23 | `16ea755` | **G-11** merge the duplicate CRM accounts |
| 24 | `2377a5a` | **G-07** HTTP edge hardening |
| 25 | `14822a3` | **N-05** run the migration/ADR guards at commit time |
| 26 | `632b935` | **N-04** browser verification for the Control Center |
| 27–28 | `69e4cfc` `a448fac` | **N-02** AMC on client acceptance, not project completion |
| 29 | `46251a1` | RBAC + tenant isolation over HTTP — **found N-08** |
| 30 | `b01bec2` | **N-08** scope the accounts read path, ratchet the rest |
| 31 | `6b4b87c` | **N-01** offline field journey end to end — **found the crash bug** |
| 32 | `4412078` | **N-08** finish the sweep, ratchet to zero |
| 33 | `694e409` | **N-04** stop the restore panel claiming an audit entry it never wrote |
| 34 | `a22b530` | **Phase 3** unify the ELV taxonomy, add the device model |
| 35 | `5557b12` | **Phase 3** persistence + API for the device register |

### Bugs the remediation itself surfaced

Worth listing separately, because each was found by the work rather than reported into it:

1. **The offline queue stranded reports permanently.** `flushOfflineQueue` selected only `status === 'pending'`, and an item is marked `syncing` immediately *before* its request goes out. A browser dying in that window left the report visibly queued on the device and never sent again. Found by the N-01 crash test on its first run.
2. **Two AMC contracts per project.** The batch's reactor and the existing one both fired; the batch's also used the wrong event.
3. **`aura_idempotency_records` had `ENABLE` but not `FORCE` RLS**, so the owner still bypassed its policy. Caught by `rls-fitness`, which is CI-enforced — this would have failed CI.
4. **The migration collision fired twice in one branch** — `0078`, then `0220` after the merge brought main's own. That is the evidence for N-05, not a hypothetical.
5. **A test fake had drifted.** `purchase-order.service.test.ts` stubbed `TenantContext` with only `get()`; the real class has always had `boundTenantId()`.
6. **The restore panel fabricated an audit entry** it never wrote, while making zero API calls.

### Corrections to this register's own earlier claims

Recorded rather than quietly edited, because a register is only as good as its last verification:

- **Two N-04 gaps were wrong.** "Sub-tab deep links discarded" and "tab changes never reach the URL" both pass. Playwright's baseURL was `127.0.0.1`, where Next dev blocks cross-origin dev resources — the page server-renders so the DOM looks correct while **nothing hydrates**. Three false readings in this session traced to that one cause; the harness now targets `localhost` and the config carries a comment.
- **N-05's diagnosis was wrong.** The guard already existed and CI had run it since 2026-07-09. The gap was *when* it ran, not whether it existed.
- **N-08's remaining count was wrong at first.** Three of the "unguarded" services were already safe in longhand; the detector needed teaching, not the code fixing.
- **One commit message overstated its own verification** (`69e4cfc` claimed 47/47 when it was 46/47); corrected in `a448fac`.

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
| **G-20** | **OPEN — the gate. Discovery + ADR done; implementation gated on sourced regulatory data.** [Discovery](2026-08-10-g20-compliance-discovery.md) · [ADR-0018 Compliance Core](../adr/0018-compliance-core.md). SIRA/DCD still **0 files**. The decision is fixed: **a Compliance Core, not a SIRA/DCD module** — authorities are reference data (no `OTHER` bucket), applicability resolves to *obligations* not just *which body*, scope is `scope + subjectType + subjectId` (SIRA licenses the company and cards technicians; DCD does not), `ComplianceDecision` is its own append-only entity so a rejection survives the later approval, inspection is optional, certificates are append-only with renewal as a new row, and device coverage is explicit (`ALL_SYSTEM_DEVICES | SELECTED_DEVICES`). Critically, `ComplianceObligation` is held **distinct from** the kernel `DocumentRequirement`: an obligation is discharged *through* evidence, not made of it. Prerequisites cleared first — N-08 kernel gate (`34d74aa`) and the expiry consolidation (`5101de6`). **Blocked on information, not engineering:** no requirement, fee or validity period will be seeded without `source · sourceVersion · retrievedAt · authority` | **P1** | ✅ |
| ◑ **G-21** | **FOUNDATION BUILT 2026-08-10.** Was 0 files. Now `modules/elv` — device model, both store adapters, service, Nest module, `GET/POST/PATCH/PUT /api/v1/elv/devices`, migration `0222_elv_devices`. A device carries system, tag, location, drawing ref, serial, MAC, IP and its warranty date, plus seams (`commissioningRecordId`, `assetId`) to the modules that own those stages. **Still open: the schedule UI.** The register serves it; nothing renders it | **P1** → P2 (UI) | ✅ |
| ◑ **G-22** | **PARTLY MOVED.** `network` is now a first-class ELV system rather than absent (it existed only in Commissioning's private copy). KNX: still **0 files**; BMS is still a label with no commissioning data capture | P2 | ✅ |
| ◑ **G-23** | **FOUNDATION BUILT 2026-08-10.** Was 0 files. `cable_ref`, `home_run_to` and `port_ref` are columns on the device — deliberately **the same rows** as the device schedule, filtered differently, so the two lists cannot disagree about how many cameras are on level 3. **Still open: the schedule UI** | P2 | ✅ |
| ~~G-24~~ | CLOSED in v1 (10-SKU ELV catalogue). My live count query hit the wrong table, so **not re-confirmed today** — carried | — | 📄 |

## 5 · Field & mobile

| ID | Status 2026-08-10 | Sev | Ev |
|---|---|:--:|:--:|
| ~~G-25~~ | **CLOSED 2026-08-10.** `apps/web/public/sw.js` + `manifest.json` + `lib/offline-store.ts` (IndexedDB queue) + `lib/offline-sync.ts` (backoff/jitter, error classification). Daily reports and labour returns run through it; topbar shows Synced / Pending / Offline / Failed. **Now E2E-proven** (N-01, 4 passing) — and that E2E found a browser dying mid-sync stranded the report permanently, since fixed | — | ✅ |
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
| ~~**N-08**~~ | **CLOSED 2026-08-10 — sweep complete, ratchet at zero.** Was: tenant B could list, read and mutate tenant A's account over HTTP, and 38 further services fetched by id with no tenant check. The `assertSameTenant`/`sameTenantOrNull` guard was **promoted from finance to `@aura/shared`** (finance keeps its path via a re-export), then applied across **37 files / 109 call sites** — 40 getters wrapped in `sameTenantOrNull`, 69 fetch-before-mutate sites in `assertSameTenant`, 30 constructors given an `@Optional() @Inject(TenantContext)`. Done by codemod against two verified shapes, with everything it could not match reported rather than guessed; 4 fell out for manual handling, of which 3 turned out to be **already safe** longhand (`x.tenantId !== tenantId`) and only needed the detector taught to recognise them. `apps/api/src/tenant-isolation.fitness.test.ts` now sits at **RATCHET = 0** and is a plain regression gate. **At the time: `pnpm typecheck` 47/47 · `pnpm test` 47/47 · API e2e 34 files / 177 tests, no skips** (49/49 and 35/187 at the close of the session) | — | ✅ |
| ~~**N-01**~~ | **CLOSED 2026-08-10 — and it found a real defect.** `apps/web/e2e/offline-sync.spec.ts`, 4 passing, drives the full journey: create → offline → queued in IndexedDB with an operationId → reconnect → drain → **server holds exactly one**; plus the crash case — killed mid-sync, reopened in the same browser context, queue resumes, **still exactly one**. The crash test failed first time: `flushOfflineQueue` selected only `status === 'pending'`, and an item is marked `syncing` immediately *before* its request goes out, so a browser dying in that window stranded the report forever — visibly queued on the device and never sent again. Fixed by reclaiming `syncing` items on a session's first flush (module state proves no sync of this session's own can be in flight); the replay is safe precisely because it carries the same Idempotency-Key and the server's lease returns the original response | — | ✅ |
| ~~**N-02**~~ | **CLOSED 2026-08-10.** The batch hooked `amc.createFromHandover` to `projects.project.completed` — so a service contract opened before the client had signed for anything, and the warranty clock starts at signature. It was also a **duplicate**: `handover-amc-subscriber.ts` already reacted to `commissioning.handover.accepted` and did it better (real `warrantyStartDate`/`warrantyMonths` from the payload rather than a hardcoded year from today, plus an idempotency guard). With both wired, a completed-and-handed-over project drafted **two** AMC contracts. Removed the wrong subscription and the now-uncalled `createFromHandover`. Added the 6 tests neither reactor had, including a regression guard that `project.completed` opens nothing. Fourth instance of **N-03** | — | ✅ |
| **N-03** | **Duplicate-implementation defect class — now five instances.** A second `IdempotencyService`, a second AR billing cap, a second PO field diff, a second AMC reactor (**N-02**), and a second `ElvSystem` taxonomy that had already forked inside the repo before this session started. Root cause is building against a stale tree; the control is to rebase before starting, not to review harder. **Partial mitigation shipped:** `.githooks/pre-commit` (N-05) catches the collision *class* for migrations and ADRs, and the merge itself is what surfaced three of the five. A behind-count check before starting remediation is still not automated | **P1** | ✅ |
| ◑ **N-04** | **Browser verification done — and it found something bigger than the row described.** `admin-control-center.spec.ts` (6 passing) + `admin-consolidation.spec.ts` (5 passing). **Measured: ZERO of the 23 Control Center panels fetch any data** — not one `fetch`, `getJson` or `useEffect` — and **18 of 23 render a paragraph plus a link INTO the legacy screen** they were said to replace. The Users panel is prose and `Open Full User Manager → /admin/users`. So `/admin` is a **directory over** the 23 screens, not a consolidation of them: DoD rules 1 and 2 do not hold. **Legacy redirects investigated and deliberately NOT implemented** — the panels link into those routes, so redirecting them back would loop and would remove the only working admin UI. The fix that row needs is the panels built for real, not redirects over an empty shell. **Fixed:** the backup/restore panel no longer fabricates `✅ … Audit event logged: {…}` while making zero API calls; it now states that the guard passed, nothing executed and nothing was audited. **Still open:** no backup/restore backend exists (left unbuilt deliberately — a real database restore is not something to write speculatively), and SCIM. ⚠️ Two gaps this row originally reported — sub-tab deep links and tab→URL sync — were **wrong**, caused by Playwright pointing at `127.0.0.1` where Next dev blocks dev resources so nothing hydrates | **P1** | ✅ |
| ~~**N-05**~~ | **CLOSED 2026-08-10 — and the diagnosis was wrong.** The guard already existed: `scripts/migration-policy-check.mjs` checks duplicate numbers, gap-freedom and `@DOWN`, and CI has run it since 2026-07-09. It would have caught **both** collisions. The gap was *when* it ran — CI only fires on push, and this branch was never pushed, so two duplicate numbers reached commits unchallenged. Fixed by running the existing checks at commit time: `.githooks/pre-commit` (migration policy · ADR registry · a staged-diff credential scan), enabled with `pnpm hooks:install`, bypassable with `--no-verify`. **Proven:** a duplicate `0221` and a planted `postgresql://user:pass@host` were each blocked. The check also caught a real violation in `0221_idempotency_records.sql` — no `@DOWN` section, which CI would have failed on | — | ✅ |
| **N-06** | **`docs/reports/README.md` — the reports index — does not exist** on this branch or in `HEAD`, though the estate convention treats it as authoritative and it is the documented home of the only quotable measured numbers | P2 | ✅ 🆕 |
| ~~**N-07**~~ | **CLOSED 2026-08-10.** `apps/web` had no test task at all until 2026-08-10 (`@aura/web#test -> <NONEXISTENT>`), and its tsconfig excluded `**/*.test.ts(x)`. Fixed: vitest added, `test` script wired, exclusion dropped — `pnpm test` went 46 → 47 tasks (49 now). ⚠️ **Standing caution:** every web-side test written before this was inert, so do not quote historical web coverage; check the task exists before trusting any package's figure | — | ✅ |

### Closed remediation — **not** open gaps

**Idempotency is proven, not pending.** Per your instruction, recorded here as remediation:

- Duplicate migration renumbered `0078` → `0220` → **`0221`**: merging `main` brought its own `0220_finance_tax_point_date.sql`, so the same collision class fired twice in one branch. That is the evidence behind **N-05**. The duplicate-prefix guard now passes over 222 migrations.
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

## Where this stands now

**Closed this session:** G-03 (dev), G-11, G-17, G-25, G-26, N-01, N-02, N-05, N-07, N-08 — plus G-07 and N-04 substantially, and G-21/G-23 given a foundation.

**Open, in the order I would work them:**

| | Row | Why it is next |
|---|---|---|
| 1 | **G-20 — SIRA/DCD compliance** | 0 files. The market-entry blocker, and the row that decides whether AURA is an ELV platform or a very good generic ERP. Now has the device model to attach to |
| 2 | **G-03 staging + production** | Dev only. Same four runbook steps; until then the enforcement proven here protects one environment |
| 3 | **N-04 — build the 23 admin panels** | `/admin` is a directory over the legacy screens, not a consolidation. Redirects are the wrong fix; the panels are the work |
| 4 | **G-21/G-23 schedule UI** | The register serves both schedules; nothing renders them |
| 5 | **G-14 / G-15 / G-27 — field & AMC execution** | The offline engine and capture primitives now exist; the technician surface does not |
| 6 | **G-22 — KNX/BMS** | Commissioning data capture for BMS; `network` is now a first-class system but KNX is still 0 files |
| 7 | **G-07 — SCIM** | Dropped to P2. An identity programme, not an edge control |

**Not attempted, and not to be read as done:** everything marked 📄 below was carried from v1 on its author's authority and was **not** re-tested. That is 31 of the 50 original rows.

---

## Provenance

**Re-verified live 2026-08-10** (✅): G-03, G-04, G-05, G-07, G-08, G-11, G-12, G-17, G-20, G-21, G-22, G-23, G-25, G-26, G-31, G-32, G-34, G-35, G-40, and all eight N-rows.
Method, in the order it was applied:

- **grep over the merged working tree** for presence/absence rows (helmet, CSP, SCIM, SIRA/DCD, KNX, cable schedule, next-best-action adopters, nav references)
- **live SQL against the running Supabase DB** — `current_user`/`rolbypassrls`, duplicate account names before and after the merge, `aura_idempotency_records` lease state, `aura_migrations` contents, table/grant checks for `aura_app`
- **HTTP probes against the API booted from the production build** (ports 4137/4141/4143/4144) — idempotent replay, rate limiting, security headers, the ELV device register against Postgres
- **`rls-isolation-test.mjs`** against Supabase under a non-bypassing probe role — 15/15
- **Playwright against a hydrated dev server on `localhost`** — admin and offline journeys
- **`pnpm typecheck` / `test` / `build`, the API e2e suite, `rls-fitness`, and the migration policy check**, all re-run at the close and reported in the header table


**Carried from v1, not re-tested** (📄): G-01, G-02, G-06, G-09, G-10, G-13, G-14, G-15, G-16, G-18, G-19, G-24, G-27, G-28, G-29, G-30, G-33, G-36, G-37, G-38, G-39, G-41–G-48, G-49, G-50.

**Not measured, not claimed:** journey scores, readiness scores, production-build performance, module-completeness percentages.
