# AURA OS — Session Report, Gaps & Required Actions

> **Date:** 2026-06-29
> **Branch:** `main` (feature branch `feat/v8-enterprise-expansion` merged via `eff429b`)
> **Verified state:** `pnpm typecheck` 42/42 · `pnpm test` 41/41 · Supabase DB 56/56 migrations
> **Note:** This is the single consolidated report. Prior per-phase reports were removed from `docs/reports/`; they remain in git history if needed.

---

## 1. What was done — initial V8-conformance phase

> *This section records the first phase (V8 architecture conformance). The later, larger **module-depth track** (16 verticals) and the **§7 gap analysis + §7.1 fix** are covered in §3.4, §7, and the build-session appendix — see those for current state.*

The starting point was a large **uncommitted** V8 expansion (working tree only). This session committed it safely and then did a verified pass against the *V8 Enterprise Architecture Standard*, closing or advancing most findings. 30 commits, all green.

### 1.1 Get the work safely committed
- Branched off `main`, committed the entire V8 expansion in **9 layered commits** (shared → core → modules → intelligence → api → web → infrastructure → docs).
- **Build hygiene:** removed 32 leaked compiled `.js`/`.d.ts` artifacts from `src/`, added a `.gitignore` safety net so build output can't re-enter `src/`.

### 1.2 Constitution Law #2 — atomic writes + command pipeline
- **Atomic single-tx writes** (row + outbox event in one transaction) made **uniform across all 17 modules** — both create *and* status-transition paths (`createWithClient`/`updateWithClient` + `appendWithClient` via `TX_RUNNER`).
- **Kernel `CommandBus` is now actually used** (was reference-only, "invoked by nothing"). The full **deal-chain + operate-loop spine (7 modules: CRM, Tendering, Contracts, Projects, Procurement, Inventory, Finance)** dispatches create through the pipeline: validate → RBAC/ABAC → idempotency → one tx → atomic row + outbox event. Numbering modules generate the reference inside the command handler.
- **`Idempotency-Key` honored at the HTTP boundary** — all 7 spine POST create endpoints read the header and forward it to the bus (non-breaking: absent header behaves as before).
- **Idempotent payment recording** (`PaymentService.record`) — fixed a real **double-payment-on-retry** bug: the multi-step write (payment → mark invoice paid → double-entry journal → emit) now runs through the bus, so a replayed key yields one payment + one journal. Proven by `payment-idempotency.test.ts` against the real pipeline.

### 1.3 Intelligence — real embeddings
- Replaced the **content-blind PRNG seed-fill** `embed()` (cosine ranked meaninglessly) with a deterministic **lexical (feature-hashing) embedding** in `@aura/shared`. Cosine now reflects shared-token overlap — useful for lexical RAG. Honest scope: lexical, not neural.

### 1.4 Canonical Data Model (Part IV) — completed
- Added `Location` (+ `makeLocation` validation, `distanceMeters` haversine, `withinGeofence`), `Account` (+ `AccountType`), `CostCenter`, and `Project` (CDM). `Document` is the existing DMS `Document` (not duplicated). The CDM type coverage is now complete.

### 1.5 Law #7 RLS — audited, fixed, verified live
- Static re-audit corrected the report's "41 explicit policies" artifact (it had missed `0032`'s 44 dynamic `DO $$`/`format()` policies). Real gap: 3 tables with RLS enabled but no policy.
- Added **migration `0052`** — `tenant_isolation_policy` for `aura_finance_bank_transactions` (the one genuine business-table gap, omitted from `0032` when it arrived later).
- **Ran all migrations against Supabase** (idempotent runner): DB was already at 0014–0051; only `0052` was new → applied. **DB now 52/52.**
- **Live verification** (`pg_policies`): 83 RLS-enabled `aura_*` tables, 78 with a policy; the 5 without are all kernel-infra (`events`, `webhook_subscriptions`, `webhook_deliveries`, `documents`, `document_versions`) — correctly **deny-all to client roles**.

### 1.6 Law #6 — consistent API versioning
- Backend was half-versioned (3 controllers `/api/v1/`, ~25 unversioned). Now uniform under **`/api/v1`** (`setGlobalPrefix('api/v1')` + stripped the redundant `v1/` from amc/audit/builder). Re-prefixed all **149** web→Nest calls (the single `${apiBase()}/api/` pattern; collapsed the 7 pre-versioned to avoid `/v1/v1`).
- **Runtime-verified (API)**: booted the API against live Supabase and curled — `/api/v1/health|crm/accounts|amc/contracts` → 200; old `/api/*` and doubled `/api/v1/v1/*` → 404.
- **Verified end-to-end (web)**: against the running web (:3000) → API (:4000) → Supabase, the web BFF route `/api/projects/projects` returned **200 with live DB rows** (proving the BFF now calls `/api/v1` — a stale `/api` call would 404 against the v1-only API), `/api/amc/contracts` → 200, and Server-Component pages (`/crm/accounts`, `/finance/invoices`) rendered 200.

### 1.7 Housekeeping
- Merged the feature branch to `main` (`--no-ff`, `eff429b`).
- Cleaned junk scratch files + consolidated 101 reports into this single document; working tree fully clean.

---

## 2. Current verified state

| Dimension | State |
|---|---|
| Build / typecheck | ✅ 42/42 tasks |
| Tests | ✅ 40/40 packages |
| Database (Supabase) | ✅ 52/52 migrations applied (verified live) |
| Business modules | 17 |
| Architecture (5-layer) | Intact; module template held across all modules |
| Git | All work on local `main`; **not pushed** |

---

## 3. Gaps (honest, current)

### 3.1 Constitution (the 7 laws)
| Law | State | Gap |
|---|---|---|
| 1 Decoupled DB contexts | ✅ | — |
| 2 Command pipeline | 🟡 | Live on the **7-module spine** only; ~10 non-spine modules still use the *equivalent* inline `access + TX_RUNNER` path (not the bus). `Idempotency-Key` is **honored, not required** (strict-require gated off so it won't break the keyless web BFF). |
| 3 Read-model segregation | 🟡 | Projections exist, but not every dashboard/analytics read is proven to hit a projection vs a transactional table — **unaudited**. |
| 4 Interface decoupling | ✅ | — |
| 5 Immutable ledger | ✅ | — |
| 6 API versioning | ✅ | **Resolved 2026-06-29.** All routes consistently under `/api/v1` (`setGlobalPrefix('api/v1')` + stripped the 3 redundant `v1/` controllers); all 149 web→Nest calls re-prefixed uniformly (single `${apiBase()}/api/` pattern). **Runtime-verified** by booting the API + curl: `/api/v1/*` → 200, old `/api/*` and doubled `/api/v1/v1/*` → 404. |
| 7 Tenant isolation (RLS) | 🟡 | Policy gaps closed and verified live. **But the real gap:** the app connects via the Supabase **service role, which bypasses RLS** — so tenant isolation for the app's own queries relies on app-level `TenantContext` + query filters, *not* on RLS. RLS today is defense-in-depth vs direct client access only. |

> **Most important architectural caveat:** "✅ RLS" should be read as *"isolation policies present for client/PostgREST access,"* **not** *"DB-enforced multi-tenancy for the app."* The app's own queries are not subject to RLS (service-role bypass). Closing this = a least-privilege app role + `FORCE ROW LEVEL SECURITY`, verifiable only against a live DB.

### 3.2 Intelligence (L3) / Optimization (L4)
- **Embeddings: neural now config-ready** (commit `bee1450`). `AiService.embed()` uses a real OpenAI-compatible embeddings API when `EMBEDDINGS_API_KEY` is set (OpenAI or Voyage via `EMBEDDINGS_BASE_URL`), with the lexical embedding as offline fallback. Remaining: it's a config flip + key away — *not yet exercised against a live embeddings API* (no key here; the request/parse/fallback path is unit-tested with a mocked `fetch`).
- Missing: 7-criteria bid scoring, client profitability / LTV, document intelligence / OCR, BIM viewer, knowledge graph, multi-agent DAG orchestration, universal `*` event observer, role-specific agent logic (CEO/CFO/PM exist as UI, not agents).

### 3.3 Experience (L5) — *essentially complete*
- ✅ **Global search** (`3ab8d24`): ⌘K palette searches records across the spine via a host-side aggregator + `/api/v1/search`; live-verified. *(Also wired `apps/api`'s missing vitest runner.)*
- ✅ **Dark/light theme switcher** (`484d6e6`): top-bar toggle, `[data-theme]` CSS-var palette, persisted.
- ✅ **Universal inbox** — already present as the **Work Center** (`work-center.tsx`): aggregates actionable items (PRs/invoices/subcontracts/claims to approve/pay/certify) with inline actions.
- ✅ **Company switcher** — UI present in the shell top bar (dropdown + `switch-company`); *follow-up:* companies are hardcoded ("simulated") — load the real authorized-company list from the org API.
- Minor remaining: density toggle, a dedicated notifications center (distinct from the approvals queue).
- **0 of 4 edge apps**: Customer Portal, Supplier Portal, Mobile Workforce PWA, BI dashboards *(track 3)*.

### 3.4 Module depth (largest scope item) — *track started*
- ✅ **Procurement RFQ** (`04c1387`): the missing PR→PO sourcing step — full vertical (domain/store/service + migration `0053` + API + 5 BFF routes + `/procurement/rfqs` page with side-by-side bid comparison + award). Live-verified end-to-end (create → quotes → recommended=cheapest → award).
- ✅ **Inventory Stock** (`f872236`): inventory was GRN-only — added the on-hand side (stock items + receipt/issue movements + live on-hand, can't go negative). Full vertical (domain/store/service + migration `0054` + API + 3 BFF routes + `/inventory/stock` page). Live-verified (100 → issue 30 → 70 → receive 50 → 120; over-issue rejected).
- ✅ **HR EOSB/gratuity** (`2f813fb`): UAE end-of-service calculator — pure unit-tested calc (21/30-day bands, resignation reductions, 24-month cap, <1yr ineligible) + stateless `/hr/eosb` endpoint + `/hr/eosb` calculator page. Live-verified (2yr term 30k → 41,970; resign → 13,990; <1yr → 0).
- ✅ **Finance VAT return** (`8fb8bef`): the tax engine existed but had no *period* return — added period output/input/net filing on the pre-existing `aura_finance_tax_returns` table (0048; `net_tax_payable` generated). preview → generate draft → file. Live-verified (generate→file→list; bad period → 400).
- 🐞 **Pre-existing bug found** (flagged for separate fix): `GET /subcontracts/subcontracts` and `/subcontracts/claims` hit a `:id` route → uuid cast error → 500. Not from this session's work; subcontracts route ordering / non-uuid id guard needed (likely a class of bug across modules' `:id` GETs).
- ✅ Found **3-way match UI already exists** in `invoices-list.tsx` (client-side PO/GRN comparison) — gap report was pessimistic here.
- ✅ **Inventory Stock Transfers** (`68e3338`): warehouse-to-warehouse transfers — domain (makeStockTransfer + same-item/positive-qty validation) + store (port/in-mem/postgres) + TransferService (atomic issue-from-source + receipt-to-dest via StockService) + migration `0055` + API controller + BFF route + `/inventory/transfers` page (source/dest picker + qty + history) + nav. Live-verified (WH-A 500→450, WH-B 100→150; over-transfer rejected 400). Note: live DB `tenant_id` column needs `ALTER … TYPE text` (was uuid; migration file corrected).
- ✅ **HR Timesheets** (`0f9f6ce`): daily hour logging per employee with approval workflow (draft→submitted→approved/rejected). Domain (makeTimesheetEntry, submit/approve/reject state machine, weekly summary) + store (port/in-mem/postgres) + HrService methods + migration `0056` + API controller (CRUD + submit/approve/reject) + 4 BFF routes + `/hr/timesheets` page (log form + entry table with inline actions) + nav. 9 domain tests. Live-verified (create→draft, submit→submitted, bad hours→400).
- ⚠️ **Versioning regression fixed** (`8dfeede`): the `/api/v1` change had missed ~71 `getJson<T>('/api/…')` Server-Component calls — now normalized centrally in `getJson`.
- Remaining depth (~35-40%): Finance bank-rec UI/treasury/IFRS-15; Projects delay-analysis/EOT UI; HR visa/labour-camp; Fleet GPS/Salik/fines; material requests (site→procurement). *(Several may already exist in the rich client components — verify before building.)*

### 3.5 Operational / platform
- **All pushed** to GitHub (`ramamosbah-netizen/Aura-os`, `main`). ~53 commits since baseline.
- **Live secrets unrotated** — `.env.local` Supabase service-role key + DB password (rotation deferred by user choice).
- No observability (OpenTelemetry/Prometheus), event streaming still on Postgres `SKIP LOCKED` (Phase 12 untouched), no data lakehouse / CDC.

---

## 4. Needs action (prioritized)

### P0 — finalize this session's work
1. **Push `main` to remote** (`git push origin main`) — currently local only.
2. **Rotate the live secrets** before anything goes public (service-role key, DB password, `AUTH_JWT_SECRET`).

### P1 — verifiable now (no running stack needed)
3. **Audit Law #3** — trace each dashboard/analytics endpoint; confirm it reads a projection, not a transactional table. Fix any that don't.
4. **Roll the CommandBus to the non-spine modules** (engineering, doccontrol, site, hse, quality, hr, fleet, assets, amc, subcontracts, + finance journals/tax, procurement PR, projects wbs/cbs) — same proven template.

### P2 — needs a running stack / external service to do safely
5. ~~Law #6 API versioning~~ — **DONE 2026-06-29** (all routes at `/api/v1`, runtime-verified).
6. **RLS enforcement model** — decide service-role bypass vs least-privilege app role + `FORCE ROW LEVEL SECURITY`; verify tenant isolation against the live DB. *(The larger of the two — also requires threading tenant context through every read query, not just tx writes.)*
7. ~~Neural embeddings — wire a real provider behind the `embed()` seam~~ — **DONE 2026-06-29** (`bee1450`): config-ready via `EMBEDDINGS_API_KEY`, lexical fallback. Only the live-API call remains unexercised (needs a key).

### P3 — product breadth (largest effort)
8. Module-depth pages (~60% remaining), the 4 edge apps, L4 optimization engines, observability + event-streaming graduation (Phase 12).

---

## 5. One-paragraph summary
The system is **architecturally sound and most correctness laws are now satisfied**: atomic writes are uniform, the command pipeline is real and idempotent across the core spine, payments are retry-safe, the CDM is complete, and the database is fully migrated and verified live. The remaining runtime-dependent item is essentially **(a)** the RLS-vs-service-role enforcement model (the larger one — also needs tenant context on every read) — API versioning is done and runtime-verified, and neural embeddings are now config-ready (a key away), (b) **breadth** — pipeline rollout to non-spine modules plus ~60% of blueprint pages and the 4 edge apps, and (c) **operational hygiene** — push and secret rotation. The single most important caveat to remember: **RLS is not currently DB-enforcing tenant isolation for the app itself** (service-role bypass); isolation is app-level today.

---

## Appendix — 2026-06-29 build session (detailed log)

> GitHub remote `origin` configured (`ramamosbah-netizen/Aura-os`); branch `claude/epic-meitner-83558a` pushed (PR #3 → `main`, mergeable). ~75+ commits since baseline `cd08948`. Throughout: `pnpm typecheck` **42/42**, `pnpm test` **41/41** tasks. Per-module test growth this session: **fleet 14** (10 traffic-fine); **HR 43** (9 expense-claim + 10 staff-advance + 6 document-expiry); **finance 63** (13 petty-cash + 11 customer-invoice + 12 bank-guarantee + 5 AR-aging + 4 AP-aging); **procurement 18** (9 supplier-master); **assets 12** (10 depreciation); **HSE 9** (5 toolbox-talk); **CRM 16** (11 quotation); **site 12** (8 site-instruction); **apps/api 14** (7 tenant-scoping §7.1 guard, + the vitest runner wired this session). Supabase migrations **51 → 66** applied & verified live (0059 duplicated — §7.5).

### A. Conformance pass (Constitution + V8)
| Item | Commit(s) | Outcome |
|---|---|---|
| `/api/v1` versioning (Law #6) | `b7d5df4`, `8dfeede` | All routes under `/api/v1`; 149 BFF + 71 `getJson` calls re-prefixed; **runtime-verified** (curl + web E2E) |
| Neural embeddings seam | `bee1450` | Real OpenAI-compatible embedder behind `EMBEDDINGS_API_KEY`, lexical fallback; unit-tested |
| Part IV CDM | `f1279fe` | Location/Account/CostCenter/Project added |
| Law #7 RLS re-audit + bank-tx policy | `e764386` | Verified live (78/83 tables); the 5 uncovered are correct deny-all kernel tables |
| DB migrated to current | (runner) | 52 → 55 applied; live `pg_policies` verified |

### B. L5 experience (essentially complete)
- **Global search** (`3ab8d24`) — ⌘K record search across the spine via host-side aggregator + `/api/v1/search`. *Also wired the missing `apps/api` vitest runner.*
- **Dark/light theme switcher** (`484d6e6`) — `[data-theme]` CSS-var palette, persisted.
- Confirmed already-present: **Work Center** = universal inbox; **company switcher** in shell.

### C. Module-depth verticals (each: domain → store → service → API → BFF → page → nav → tests; live-verified)
| Vertical | Commit | Migration | Key endpoints | E2E check |
|---|---|---|---|---|
| **Procurement RFQ** | `04c1387` | `0053` | `POST/GET /procurement/rfqs`, `/quotes`, `/award` | create→2 quotes→recommend cheapest→award (winner awarded, rest rejected) |
| **Inventory Stock** | `f872236` | `0054` | `/inventory/stock` (+`/movements`) | 100 → issue 30 → 70 → receive 50 → 120; over-issue rejected |
| **HR EOSB/gratuity** | `2f813fb` | — (stateless) | `POST /hr/eosb` | 2yr term 30k → 41,970; resign → 13,990; <1yr → 0; bad → 400 |
| **Finance VAT return** | `8fb8bef` | — (table from `0048`) | `/finance/vat-returns` (preview/generate/status) | generate draft → file → list; bad period → 400 |
| **Inventory Transfers** | `68e3338` | `0055` | `/inventory/transfers` (POST/GET) | WH-A 500→450, WH-B 100→150; over-transfer → 400 |
| **HR Timesheets** | `0f9f6ce` | `0056` | `/hr/timesheets` (CRUD + submit/approve/reject) | create→draft, submit→submitted, bad hours→400 |
| **Fleet Traffic Fines (UAE)** | `a26c784` + `f9a9964` | `0057` | `POST/GET /fleet/fines`, `PUT /fines/:id/{assign,dispute,pay}` | record (DXB-12345 / 600 AED / 4 pts) → assign (UUID driver) → pay; bad amount → 400; dispute-after-paid → 400; **date stable across all updates** (post-fix) |
| **HR Expense Claims** | `543878d` | `0058` | `POST/GET /hr/expense-claims`, `POST /expense-claims/:id/{submit,approve,reject,reimburse}` | draft → submitted → approved → reimbursed; `expenseDate=2026-06-20` preserved (no drift); reject-after-reimburse → 400; reimburse-before-approve → 400; bad category → 400 |
| **Project Variation Orders** | `73bd992` | `0059`† | `POST/GET /projects/variations`, `/variations/:id/status`, `/variations/summary/:projectId` | (merged from `main`) project 1,000,000 → +80k addition → approve → revised 1,080,000; bad type → 400 |
| **Finance Petty Cash** | `b21d600` | `0059`† | `POST/GET /finance/petty-cash`, `GET /petty-cash/:id`, `POST /petty-cash/:id/transactions` | float 5000 → expense 1200 = 3800 → topup 2000 = 5800; over-expense → 400; bad category → 400; both txn dates preserved (no drift, `::text` cast applied upfront) |
| **Finance Customer Invoices (AR)** | `3714f9f` | `0060` | `POST/GET /finance/customer-invoices`, `GET /:id`, `POST /:id/{issue,receipts,cancel}` | net 12000 / VAT 600 / total 12600; draft → issued → partially_paid (6000) → paid (12600); overpay → 400; empty-lines → 400; JSONB line items + issue date survive round-trip |
| **Finance Bank Guarantees** | `fe8607f` | `0061` | `POST/GET /finance/bank-guarantees`, `GET /expiring`, `GET /:id`, `PATCH /:id/status` | create active (AED, expiry preserved) → release; double-transition → 400; expiry-before-issue → 400; bad type → 400; 15-day instrument appears on `expiring?withinDays=30` watch-list |
| **Finance AR Aging** | `7f7e84f` | — (read-only) | `GET /finance/customer-invoices/aging?asOf=` | builds on customer invoices; Acme due 2026-06-01 → 31–60 bucket (1000), Beta not-due → current (500), draft excluded; grandTotal 1500; current/1-30/31-60/61-90/90+ buckets by due-date (issue-date fallback) |
| **Finance AP Aging** | `b01a70a` | — (read-only) | `GET /finance/invoices/aging?asOf=` | payables mirror; approved supplier invoices bucketed by invoice-date age, grouped by supplier (sorted by total desc); draft/paid/cancelled excluded; reuses the AR `bucketFor` boundaries; live-verified (current vs 1-30 split, draft excluded) |
| **Procurement Supplier Master** | `12124f4` | `0062` | `POST/GET /procurement/suppliers`, `GET /:id`, `PATCH /:id/status` | approved-vendor registry (code/category/trade-licence/TRN); pending → approved → suspended → reinstated; duplicate code → 400; bad TRN (≠15 digits) → 400; `?status=approved` filter; unique (tenant, code) |
| **HR Staff Advances** | `3e0d6bd` | `0063` | `POST/GET /hr/staff-advances`, `POST /:id/{approve,reject,disburse,repay}` | salary loan repaid in installments; requested → approved → disbursed → repay 3000 → repay 3000 → settled (6000); over-repay → 400; both dates preserved; uuid nil-actor fallback on approve |
| **Assets Depreciation** | `c05b764` | — (stateless calc) | `GET /assets/:id/depreciation?usefulLifeMonths=&salvageValue=&method=&asOf=` | pure calc (like EOSB); SL: base 100000, 10000/mo, 4mo elapsed → NBV 80000; DDB: P1 = cost×2/life, floored at salvage; salvage≥cost → 400; missing life → 400. *(Superset of `main`'s straight-line `dfc7bdb`, which this merge supersedes.)* |
| **HR Document Expiry** | `164a7db` | — (stateless calc) | `GET /hr/document-expiry?withinDays=&asOf=` | visa/work-permit compliance watch-list over existing employee fields; active-only; expired + expiring-within-window, soonest/most-overdue first; far-off & terminated excluded. Live-verified (expired visa −179d leads, permit +16d expiring, far-off omitted; counts 1/1) |
| **HSE Toolbox Talks** | `409f69b` | `0064` | `POST/GET /hse/toolbox-talks` | daily safety-briefing log (topic/conductor/project/date/attendees/notes); date preserved (`::text`); attendees<1 → 400; missing topic → 400. *(Caught + fixed an un-awaited-promise 500→400 in the controller before commit.)* |
| **CRM Quotations** | `5a521b8` | `0065` | `POST/GET /crm/quotations`, `GET /:id`, `PATCH /:id/status` | pre-sales quote (deal-chain step before contract/invoice); net 11500 / VAT 575 / total 12075; draft → sent → accepted; expire-after-accept → 400; empty-lines → 400; JSONB lines + dates round-trip |
| **Site Instructions** | (this round) | `0066` | `POST/GET /site/instructions`, `PUT /:id/{acknowledge,close}` | formal SI register with cost/time-implication flags; open → acknowledged → closed; close-twice → 400; missing reference → 400; date preserved (`::text`) |

> **† Migration `0059` collision:** `main`'s Project Variation Orders and this branch's Finance Petty Cash independently both authored a `0059_*.sql` (different filenames: `0059_projects_variations*` vs `0059_finance_petty_cash.sql`). Both were already applied to the live DB; the filename-ordered runner tolerates the duplicate index. Flagged for a follow-up renumber of the later file to keep the sequence strictly monotonic.

### D. Bugs found
- 🐞→✅ **Subcontracts `:id`-route 500 — confirmed already fixed.** Re-analysed this round: commit `0ad55a9` (`fix(api): route-order + UUID guard for :id endpoints`) reordered the literal `claims` routes before `:id` and added `ParseUuidOr404Pipe`; the same pipe guard is now applied across 11 controllers, so a non-UUID path segment yields 404 (not a 500). No further action needed.
- Self-caught during build: a generated-column INSERT (VAT returns) and an un-`await`ed controller try/catch (400 vs 500) — both fixed before commit.
- 🐞→✅ **Traffic-fine date drift (caught + fixed mid-session, commit `f9a9964`):** PG `date` columns come back as a JS `Date` in the server's local TZ (Asia/Dubai = UTC+4); the original mapper used `toISOString().split('T')[0]` which converted to UTC and shifted the day on every update. Replaced with a `dateOnly()` helper using local `getFullYear/Month/Date` components; smoke-test now confirms `fineDate=2026-06-22` survives create → assign → pay. **Lesson:** `dist/` from a workspace dep is stale after editing source — `pnpm --filter <consumer> build` does *not* rebuild deps; needed `pnpm --filter @aura/fleet build` to make the fix actually run.

- ✅ **Date-drift lesson applied proactively (expense claims):** rather than map PG `date` columns via the drift-prone `toISOString().split('T')[0]`, the expense-claim Postgres store selects `expense_date::text` / `reimbursed_date::text` so PG returns the calendar string directly.
- 🐞→✅ **Assets date-drift (fixed, commit `dfc7bdb`):** the assets Postgres store had the same `toISOString().split` pattern → `purchaseDate` drifted -1 day, making the depreciation schedule years wrong (2025–2029 instead of 2026–2030). Replaced with a local-parts `dateOnly()` helper for purchaseDate/warranty/calibration/inspection; re-smoke confirmed 2026–2030.
- 🐞→✅ **HR timesheet date-drift (fixed this round):** the previously-flagged latent drift in the timesheet mapper's `date` column — applied the same `dateOnly()` local-parts fix.
- ⚠️ **uuid-column fallback (expense approve):** `approved_by` is `uuid`; the timesheet pattern's `ctx.actorId ?? 'system'` fallback would throw `invalid input syntax for type uuid` when unauthenticated. Fixed in the expense endpoint to fall back to the nil-uuid `00000000-…-0` system actor; caught via :4100 smoke-test before commit.

### E. Method note
The original gap list **over-counted** missing features — universal inbox, company switcher, and 3-way-match UI all already existed. Adopted **verify-before-build** (grep for zero references) — RFQ, Stock, EOSB, VAT-return, Expense Claims, Petty Cash, and **Customer Invoices / AR** (`grep` for `receivable|customer.?invoice|sales.?invoice` → 0 files; the existing `invoice.ts` is explicitly AP-only) were each confirmed genuinely absent first. Also *avoided* rebuilding things that already exist: project-level **EVM** (`GET /projects/:id/evm` rolls up PV/EV/AC→CPI/SPI) and the subcontracts `:id`-route fix were both verified present before deciding not to touch them.

### F. Operational
- Dev stack (`pnpm dev`, web :3000 + api :4000) was disrupted twice (editing module source mid-watch; an over-broad `taskkill`) — **restored both times** (currently both 200). Switched to single-PID `taskkill` via `netstat`.
- **Still pending:** rotate live Supabase secrets; RLS enforcement model (deferred to end per user); pipeline rollout to non-spine modules; remaining module-depth pages + the 4 edge apps.
