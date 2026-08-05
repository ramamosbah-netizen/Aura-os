# AURA OS — Enterprise Readiness Audit

**Date:** 2026-08-03 · **Last verified:** 2026-08-05 · **Auditor role:** Product Owner + ERP Consultant + Security Architect + QA Lead
**Method:** Live running app (API `:4000` prefix `/api/v1`, web `:3000`) + source inspection. Every finding below is verified from code or a live request — no assumptions. Browser pane was hidden, so visual/interaction items were verified from component source, not pixels.

> **Verification refresh — 2026-08-05** (live API boot against the same Supabase DB; details in [2026-08-05-platform-state-verification.md](2026-08-05-platform-state-verification.md)):
> - **Schema:** now **219 migrations on disk** (was 216); `/health` reports `upToDate: true`. ⚠️ **New finding:** the long-lived dev DB has **224 applied rows vs 219 files** — 5 applied migrations no longer exist on disk (`0055`, `0064`, `0178`/`0180` backfill duplicates, `0204`), a rename/renumber artifact of stacked-PR rebases. The gate only checks *pending*, so this drift is invisible to it.
> - **P0-1 re-confirmed OPEN:** `GET /api/v1/crm/opportunities` with no token → **200, 34 records**; `/crm/accounts` → **200, 35 records**; `/auth/status` → `{"enabled":false}`.
> - **P0-2 boot gate confirmed live:** the API logs `⚠️ DB connection role "postgres" bypasses row-level security … RLS policies are INERT` at startup. Dev warns, production refuses — the mechanism works; the operator flip is still pending.
> - **P1-3 confirmed live** (was only test-proven): searching `Dome` and `DS-2CD` each return both serialised units. *(It failed the first live check — the running `apps/api/dist` was a stale build predating the fix. Rebuild + restart resolved it; see the note under P1-3.)*
> - **P2-3 partially CORRECTED — the "0 remain" claims were overstated.** Residuals survive on `main` after the sweep commits: **3 × `var(--fg)`** in `apps/web/app/globals.css` (`:895`, `:944`, `:947`) and **4 × `#d97706`** in 3 files. Corrected inline below.
> - **P1-4 re-confirmed:** `apps/web/public/` is empty — no PWA manifest or service worker.
> - **P1-1 confirmed:** `infrastructure/orphan-references.json` carries **19** references as claimed.

---

## 1. Executive Summary

AURA OS is a **broad, well-architected ELV ERP with excellent domain modelling** — an append-only event spine wires a genuine deal chain (Lead → Opportunity → Quotation → Contract → Project → IPC → Invoice), value inherits down the chain, notifications and global search exist, dashboards run on real data, and CI is strong (lint/typecheck/coverage/e2e + a migration gate and a pg_dump restore drill).

However, it is **not yet enterprise-production-ready**. The gaps are concentrated in the *enterprise controls* layer, not features:

- **Security is inert in the running configuration.** Authentication and RBAC are architected but OFF by default; a fully unauthenticated request returns live data. Database RLS is bypassed because the app connects as the DB owner role.
- **Referential integrity is "soft."** Entity relationships are ID strings with almost no database foreign keys — orphans and dangling references are possible.
- **Audit trail is partial.** The event log records actor + payload + time, but there is no `updated_by` and no explicit old→new value diff; with auth off the actor is null.
- **Field/mobile experience is weak** — no offline/PWA, minimal photo/signature capture, and operational forms require hand-typed UUIDs.
- **Segregation of duties is absent** in the commercial cycle — a junior can approve their own quotation.

**Bottom line:** Strong bones, pilot-grade controls. The functional platform is ~80% there; the enterprise-hardening (security enforcement, DB integrity, audit completeness, SoD, field UX) is the work remaining.

---

## 2. Overall Readiness Score

### **54 / 100** — enterprise-production readiness (not feature completeness)

Weighted synthesis of the 12 audited areas (each scored from verified findings):

| Area | Score | Note |
|------|:----:|------|
| 1. Security & RBAC | 25 | Mechanism exists but OFF; unauth access confirmed (SoD maker-checker now fixed; auth-off + RLS-bypass still dominate) |
| 2. Data Integrity | 45 | Value inheritance works; ~no FKs → orphans possible |
| 3. Audit Trail | 50 | Event log good; no updated_by / old-new diff; actor null |
| 4. ELV Lifecycle | 75 | End-to-end chain real; survey-start & handover→AMC manual |
| 5. Document Mgmt | 55 | Revisions on drawings; no unified version/approval/expiry layer |
| 6. Notifications | 70 | Real engine + event subscriber + tenant routing |
| 7. Global Search | 70 | now spans commercial + **inventory + serialised equipment** (ELV model/serial lookup works); full-text index still pending |
| 8. Dashboards | 75 | Real live data, honest offline fallbacks |
| 9. Field/Mobile | 30 | No PWA/offline; minimal photo/signature; UUID forms |
| 10. Performance/Scale | 50 | 72 indexes; in-memory search & list loads = O(n) risk |
| 11. AI Copilot | 70 | Context-aware + autonomy engine; inherits (off) permissions |
| 12. Production Readiness | 55 | CI strong; but auth off, RLS bypassed, superuser conn |

*Score reflects readiness to run a real multi-tenant enterprise in production. Feature breadth alone would score far higher (~80).*

> **Score status 2026-08-05 — NOT re-measured.** The 2026-08-05 pass re-verified individual findings (see the refresh box at the top), it did not re-run the 12-area assessment. **54/100 remains the last measured figure and is what should be quoted.** Fixes merged since 2026-08-03 (maker-checker + approval matrix, RLS boot gate, orphan-scan extension, audit diffs, search coverage, dev auto-migrate, index coverage, token/hex sweeps, AMC naming, nav) would plausibly move areas 3, 7 and 12 upward, but *plausibly* is not *measured* — the next number should come from a full re-run, not from adding up closed rows.

---

## 3. Critical Blockers (P0)

### P0-1 — Authentication & RBAC are OFF; unauthenticated data access confirmed
- **Issue:** The global `PermissionsGuard` returns `true` whenever `auth.enabled` is false, which is the default when no `AUTH_JWKS_URL`/`AUTH_JWT_SECRET` is set. Auth is off in the running instance.
- **Evidence:** `core/src/identity/permissions.guard.ts:100` and `:125` — `if (!this.auth.enabled) return true;` (twice). `auth.service.ts:88` logs *"Auth OFF … access seam passes through."* Live proof: `GET http://localhost:4000/api/v1/crm/opportunities` with **no token** → `HTTP 200`, **34 records returned**. **Re-verified 2026-08-05** — unchanged: opportunities 200/34, accounts 200/35, `/auth/status` → `{"enabled":false}`.
- **Status 2026-08-05: still OPEN — this is now the only remaining P0, and the single largest item between AURA and a hosted deployment.** Note the asymmetry with P0-2: the RLS bypass got a boot-time fail-closed gate; auth-off did not. The same `evaluateRlsPosture` pattern in `main.ts` is the obvious home for it.
- **Business impact:** In this configuration anyone reaching the API reads/writes all tenants' commercial data. Ship-blocking for any hosted deployment.
- **Severity:** P0.
- **Fix:** Require a verifier in non-dev environments; fail-closed if `NODE_ENV=production` and auth is off. Add a boot assertion + CI check.

### P0-2 — DB RLS is bypassed at runtime (isolation is app-code-only) — ✅ FAIL-CLOSED AT BOOT (operator flip remains)
- **Issue:** Postgres RLS is inert because the running app connects to Supabase as the **`postgres` owner role**, which bypasses all RLS policies. Tenant isolation therefore rests entirely on app-level `WHERE tenant_id = $`.
- **Evidence:** `apps/api/.env.local` `DATABASE_URL=postgresql://postgres.<proj>:…@…supabase.com` (owner role). *(The audit's original "only 13 migrations define RLS policies" was an undercount — 96 migrations maintain RLS; the `rls-fitness` gate now reports **182/182 tenant tables enabled + FORCED + policied**.)*
- **CORRECTION (verified 2026-08-03):** the earlier draft claimed "2 of 102 stores don't filter tenant_id." That was a **false positive** — the 2 files are barrel *re-export* files (`postgres-hr-store.ts`, `postgres-quality-store.ts`) with no queries. **Every real query-store (incl. all 15 hr/quality per-entity stores) scopes `tenant_id`.** App-level isolation is complete; the only isolation gap is the RLS bypass below.
- **Business impact:** App-level filtering is solid, but there is **no DB safety net** — a future missing `WHERE tenant_id` would leak cross-tenant data undetected.
- **Severity:** P0 (defence-in-depth; deployment/config fix, not a code fix).
- **✅ FIX (2026-08-04) — boot-time fail-closed:** the mechanism already existed (R1 migration `0163`: least-privilege `aura_app` role `NOSUPERUSER/NOBYPASSRLS`, `FORCE RLS` on every tenant table maintained by the CI `rls-fitness` gate, per-connection tenant-GUC binding, + an `rls-isolation-test` proving cross-tenant denial under `aura_app`). What was missing was preventing the app from silently *running* under the bypass role. The API now checks the connection role's posture at startup (`main.ts` → `evaluateRlsPosture`, `core/src/identity/rls-posture.ts`) and **refuses to boot in production** when the role is superuser/`BYPASSRLS` (RLS inert), unless `ALLOW_RLS_BYPASS=true`; dev logs a loud warning. **Verified:** live boot against the current Supabase `postgres` role (confirmed `rolbypassrls=true`) with `NODE_ENV=production` → process exits 1 with the FATAL log; unit test `rls-posture.test.ts` (4 cases); new CI step asserts the production-under-owner boot exits non-zero. **Remaining (operator/config, unchanged):** flip the runtime `DATABASE_URL` to the `aura_app` DSN per `docs/runbooks/rls-tenant-isolation.md` — now *enforced* by the boot gate, not merely recommended.
- **✅ Coverage drift closed (2026-08-04):** running `rls-fitness` against the live DB surfaced **9 AI-platform/collaboration/marketplace tables that were `ENABLE`d + policied but not `FORCE`d** — the `FORCE` clauses had been added to migrations `0193`/`0195` *after* they were already applied to this long-lived DB (an applied migration never re-runs), so the DB drifted while CI (fresh schema) stayed green. Migration `0218_force_rls_ai_platform_tables.sql` closes it idempotently; `rls-fitness` is now **green (182/182 FORCED)** locally. *(The `rls-isolation-test` can't complete against the Supabase pooler locally — `ENOIDENTIFIER`, a connection-routing limit, not an RLS defect — but passes in CI against plain Postgres under `aura_app`.)*

### P0-3 — No segregation of duties in the commercial money cycle — ✅ FIXED (maker-checker + value-threshold)
- **Issue (original):** Quotation approve, contract sign, IPC certify, and invoice post were plain status transitions with no not-own-record check. A junior could authorise their **own** records end to end.
- **✅ FIX (2026-08-03):** "Cannot authorise your own record" maker-checker now enforced on all four money-cycle transitions — the preparer (`createdBy`) may not approve/sign/certify/post; a different authorised user must. Returns 403 (`access denied` → taxonomy). Engages only when an actor is known (auth on); **system/auto transitions carry no actor and are unaffected** (the `contract.signed → auto-project` and `ipc.certified → auto-invoice` reactor chains still work).
  - `modules/crm/src/quotation.service.ts` (approve), `modules/contracts/src/contract.service.ts` (sign→active, actorId threaded), `modules/contracts/src/payment-certificate.service.ts` (certify), `modules/finance/src/invoice.service.ts` (approve) + the two controllers thread `ctx.actorId`.
  - **Verified:** `apps/api/test/sod.e2e-spec.ts` (self→403, checker→200) green; contracts 21 + finance 110 unit tests green; chains/cost-ledger/quantity-ledger e2e green (no-actor auto-flows unaffected).
- **✅ FIX 2 (2026-08-04) — value-threshold matrix:** the same four transitions now also check the approver's **approval authority against the record's value**, reusing the access layer's existing `approvalLimit` ABAC (no new state machine). A new `AccessService.assertApprovalAuthority(userId, {permission, orgPath, amount}, label)` passes only when a grant both permits the action *and* carries `approvalLimit ≥ amount`; when the user could act but their limit is too low it throws `"…above your approval limit — a more senior approver is required"` (→403). Skipped when there is no actor (auto-flows). Tiered demo approvers seeded (`auth.seeder`: u-manager ≤50k · u-director ≤500k · u-admin/u-approver unlimited). Proven by `sod.e2e-spec.ts` (500k contract: ≤50k approver→403 "above your approval limit", unlimited→200; 30k→ the ≤50k approver signs). api e2e 160/32 green. **P0-3 fully closed.**

---

## 4. High Priority Issues (P1)

### P1-1 — Soft referential integrity across modules — ⚠️ BY DESIGN (ADR-0001); mitigation extended
- **CORRECTION (2026-08-04):** the original "only 9 FKs" was a migration-file grep undercount — the live schema has **64 FK constraints**, all **intra-module** (line-items→parent, AMC/PPM→contract, journal-lines→journal, etc.). The **absence of cross-module FKs is a deliberate architectural decision: ADR-0001 "Foreign-Key Policy: snapshot-by-reference, not referential joins."** Cross-module links are stored as `referenceId + denormalised snapshot` (e.g. contract carries `tenderId` + `tenderTitle`) so modules stay independently deployable, reads survive source deletes, and tenancy is enforced by RLS — never a cross-module `JOIN`/FK. So "add FKs to the deal chain" would **violate the ADR** and couple module schemas. (A second, practical blocker: id columns are inconsistently typed `uuid` vs `text` across tables, which would fail FK creation regardless.)
- **Consequence (acknowledged in the ADR):** cross-module orphan references are *possible*; the chosen mitigation is a **catalogued orphan scan** (`apps/api/scripts/orphan-scan.mjs` ← `infrastructure/orphan-references.json`), run `--enforce` in CI against the seeded deal chain and monthly against prod.
- **✅ FIX (2026-08-04):** the scan's catalog was **incomplete** (11 references — it missed the quotation provenance links, tender→opportunity, contract→commercial-baseline, and IPC→contract/account). **Extended to 19 references** covering the full commercial spine. Verified CI-safe (the fresh seed sets valid `sourceOpportunityId` and creates no IPCs). **Data-hygiene finding:** the long-lived local DB carries **7 dangling refs** (tenders/opportunities/contracts/IPC → missing `account_id`, and one tender→opportunity) — dev/test artifacts, not present in the clean seed; worth a one-off cleanup, not a code fix.
- **Remaining (optional, ADR-compliant):** add real FK constraints only for *intra-module* deal-chain links that are orphan-free and type-consistent (e.g. `payment_certificates.contract_id → contracts.id`) — a separate, reviewed step, since even intra-module FKs need the `uuid`/`text` id typing reconciled first.

### P1-2 — Audit trail: old→new value diffs — ⏳ FIX STARTED (quotation authoring path)
- **CORRECTION (2026-08-04):** the audit trail is more built than the draft implied. Three surfaces already exist: (1) the append-only **event store** (actor + payload + time, keyed by aggregate + version); (2) a dedicated **`aura_audit_log`** ledger with a `changes jsonb` column + the **`/api/v1/audit`** query endpoint (filter by entity, CSV export); (3) a per-record **CRM timeline** (`/crm/timeline?id=`) that reconstructs history from events. So "who/when" is answered today; **`updated_by`/`updated_at` columns are largely redundant** given the event log records actor+time per mutation, and a "History tab" already exists for CRM records.
- **The genuine gap:** value mutations recorded only the **new** state, not the **before→after** — so "changed the total from 80k to *what*" wasn't answerable from the log.
- **✅ FIX (2026-08-04):** added a reusable, pure `diffFields(before, after, fields)` helper (`shared/src/domain/change-diff.ts`, returns `{field:{from,to}}` for changed fields only) and wired it into the money-cycle's most audit-sensitive edits — quotation **commercial-terms** update and **re-price** (`saveEstimation`) — which now emit the field-level diff in the event payload (`changes`) **and stamp the real actor from the request context (ALS/`TenantContext`)** instead of falling back to `createdBy`. This flows straight into the existing CRM timeline. **Verified:** `change-diff.test.ts` (3) + a new quotation service test asserting `changes.paymentConditions = {from,to}` + correct actor — green; shared + crm typecheck clean.
- **✅ FIX 2 (2026-08-05) — extended to contract + invoice:** commit `fc665f7` *"audit: before→after diffs on contract + invoice update (P1-2 extension)"* applies the same `diffFields` pattern to contract value changes and invoice edits. **On `main`; not yet in every worktree base** (this branch's base is `8aa27aa`).
- **Remaining:** PO line changes are the last uncovered value mutation. Optional `updated_by`/`updated_at` only where a column-level stamp is specifically wanted over the event log.

### P1-3 — Global search misses inventory / serials / equipment — ✅ INVENTORY + SERIALS ADDED (full-text index still pending)
- **Evidence:** `apps/api/src/search/search.service.ts` indexes Account, Tender, Contract, Project, PO, Invoice, Lead, Opportunity, Quotation, Supplier — matching title/name/reference **in memory**. No serial numbers, equipment models, or stock items.
- **Impact:** The core ELV test — search "Hikvision DS-2CD1143" → inventory/installation/warranty — **fails**. Also O(n) in-memory scan won't scale.
- **✅ FIX (2026-08-04):** the search fan-out now also indexes **inventory stock items** (`StockService.listItems` — code/name/barcode → a "Stock Item" hit, deep-links `/inventory/stock`) and **serialised equipment** (`SerialService.list` — serialNumber/itemCode/itemName → a "Serial" hit titled `model — serial`, subtitled by its project, deep-links `/inventory/serials`). The core ELV lookup now resolves: `"Hikvision DS-2CD1143"` → the SKU **and** each installed unit (with its site/warranty link), and an exact serial number finds its unit. Proven in `search.service.test.ts` (SKU + matching serial returned, unrelated serial excluded; exact-serial hit). Both `StockService`/`SerialService` are exported by `InventoryModule` (already imported) — no new wiring.
- **✅ LIVE-VERIFIED (2026-08-05):** previously test-proven only. `GET /search?q=Dome` and `?q=DS-2CD` each return **both serialised units** (`4MP Dome Camera — DS-2CD-E2E2` on project *Tower A*, and `…-E2E1` in stock). The ELV serial→site lookup works against real data.
  - ⚠️ **Operational gotcha worth recording:** the first live check returned `[]`. The cause was **a stale `apps/api/dist`** — the running build predated the fix, so the deployed behaviour disagreed with source and tests. `pnpm --filter @aura/api build` + restart resolved it. *Any live verification of this platform must confirm the running build matches HEAD first; otherwise it measures a ghost.*
  - ⚠️ **The flagship query still under-delivers on demo data:** `?q=Hikvision` returns only a **Purchase Order**, because the seeded catalogue uses generic names (`4MP Dome Camera` / `CAM-4MP-DOME`) with no manufacturer or model. The *capability* is closed; the *demo* isn't. Fixing this belongs with **P2-2 (clean seed)** — seed real ELV brand/model SKUs so the headline lookup demonstrates.
- **Remaining:** the in-memory O(n) fan-out → a DB / full-text search projection (shared with the P2-7 scale item); functional coverage of the ELV lookup is now closed.

### P1-4 — Field/mobile experience is not production-grade
- **Evidence:** No PWA manifest/service-worker/offline (`apps/web/public` has none). Only ~3 components with file upload, ~2 with signature. Operational forms (Site/Quality/HSE) require hand-typed project **UUIDs** (14 forms, placeholder `"uuid"`).
- **Impact:** Site/QA/HSE engineers — the heaviest field users — cannot realistically create daily reports, inspections, NCRs or capture photos/signatures on a tablet with no connectivity.
- **Fix:** ProjectPicker + camera/signature capture + offline queue (PWA). **⏳ STARTED (2026-08-03):** `ProjectPicker` + `EmployeePicker` + `AssetPicker` shipped and wired into **all 14 UUID forms** (Site/Quality/HSE/Engineering/HR/Assets); typecheck clean, DOM-verified. **Zero raw UUID inputs remain app-wide.** Camera/signature/offline PWA still outstanding.

### P1-5 — RLS bypass + superuser DB connection (production posture) — ✅ boot-time fail-closed (see P0-2)
- **Evidence:** Running connection uses the Supabase `postgres` owner role (see P0-2). `.env.local` is correctly gitignored (no credential leak), but the runtime role choice defeats DB-level isolation.
- **Impact:** Removes the last line of defence behind app-level tenant filtering.
- **✅ FIX (2026-08-04):** the API now refuses to boot in production under a superuser/`BYPASSRLS` role (`evaluateRlsPosture` boot gate). `FORCE RLS` is already in place + maintained by the CI `rls-fitness` gate. The operator still flips `DATABASE_URL` to the least-privilege `aura_app` role (runbook) — now enforced by the gate. See P0-2.

---

## 5. Medium Priority Improvements (P2)

- **P2-1 First-run 503 wall:** 11 pending migrations made every business route 503 until `db:migrate` + API restart; no in-app remedy. **✅ FIX (2026-08-05):** the boot deploy-gate now **auto-applies pending migrations in development** (migrate-then-serve) so a fresh clone comes up healthy instead of a dead 503 app — `MigrationGateService.onModuleInit` applies each pending file in its own transaction (mirroring `migrate.mjs`, reusing the app pool). **Production is never auto-migrated** (the strict 503 gate stands; migrations run as a separate ordered deploy step); a dev user can opt back into the strict gate with `AUTO_MIGRATE=off`. Verified live against Supabase (behind→auto-applied→healthy 200) and gated in CI (new step proves dev auto-heal; the existing R2 step pins `AUTO_MIGRATE=off` to keep testing the strict prod behaviour).
- **P2-2 Test/junk data:** `Ledger Test`, `Cost Engine Test`, `tst`, `QT-AUTHOR-1` appear as primary rows in Projects/Commissioning/Handover/Quotations. *Fix: clean seed.* **Still open 2026-08-05 — and it now blocks two other things,** which upgrades its practical priority above "cosmetic": (a) the flagship ELV search demo returns nothing for a brand name because the seeded catalogue has no manufacturer/model SKUs (P1-3); (b) the CRM close-out re-run holds its final sign-off on the duplicated MAF accounts being merged and the seeder made idempotent (see [2026-07-20-journey-direct-sale-closeout.md](2026-07-20-journey-direct-sale-closeout.md) gap A). The same live DB also carries the 7 dangling refs noted under P1-1.
- **P2-8 (new, 2026-08-05) Migration history drift on long-lived databases:** the dev DB has **224 rows in `aura_migrations` but only 219 files on disk** — `0055_finance_vat_returns.sql`, `0064_contracts_payment_certificates.sql`, `0178`/`0180_backfill_account_name_snapshot.sql` (the same backfill applied under two numbers) and `0204_project_cost_accrual.sql` were applied, then renamed or renumbered by stacked-PR rebases. Nothing is broken today — the gate only asks "is anything *pending*", so `upToDate: true` is honest but incomplete. The risk is the P0-2 pattern repeating: a file edited after it was applied never re-runs, and CI (fresh schema) stays green while the long-lived DB drifts. *Fix: have the migration gate also report applied-but-absent filenames as a warning, and treat renumbering an already-applied migration as forbidden.*
- **P2-3 UI token drift:** 66 screens use undefined tokens (`--fg`, `--surface`) + off-brand blue `#2563eb`; no shared Button/Card/Table; 111 files hardcode hex → invisible-input-text risk on operational screens. **⏳ FIX STARTED (2026-08-03):** shared UI kit shipped (`components/ui/kit.tsx`: Button/Field/Input/Select/Card/KpiTile/Badge/Table on real tokens) + `ProjectPicker`; `daily-report` & `inspection-request` fully migrated onto the kit (amber accent, semantic colours, 0 UUID inputs); **all 14 UUID forms** now use ProjectPicker/EmployeePicker/AssetPicker → zero UUID inputs app-wide. **✅ TOKEN MIGRATION COMPLETE (2026-08-04):** the undefined-token half — the actual invisible-input-text bug — is fixed **app-wide**: a mechanical mapping across **52 files** replaced every `var(--fg)`→`var(--text)`, `var(--surface)`→`var(--panel)`, `var(--surface-2,…)`→`var(--panel-2)` (0 undefined tokens remain; web typecheck clean; CI web-build + Playwright smoke green). **✅ OFF-BRAND HEX PASS (2026-08-04):** `#2563eb`→`--accent`, `#16a34a`→`--good`, `#dc2626`→`--bad` mapped app-wide (`#2563eb` verified **0 remaining** 2026-08-05; dead `var(--accent,#2563eb)` fallbacks cleaned); the 24 solid semantic buttons tokenised with white text moved to `var(--accent-ink)` for correct light+dark contrast (kit `danger` converged).

  ⚠️ **CORRECTION (2026-08-05) — two "0 remaining" claims above were overstated. Residuals survive on `main` after the sweep commits (`403c37e`, `59931d6`, `53821ce`):**

  | Claim | Verified 2026-08-05 | Detail |
  |---|---|---|
  | "0 undefined tokens remain" | ❌ **3 remain** | `apps/web/app/globals.css:895` (`.fe-collapsible:hover`), `:944` (`.fe-tab:hover`), `:947` (`.fe-tab.active`) still set `color: var(--fg)`. `--fg` is **not defined** in either palette (the token is `--text`), so the form-engine's active/hovered tab silently inherits instead of taking the intended colour. Same class of bug the migration set out to kill — the sweep covered `.tsx` files and missed these three lines in the global stylesheet. |
  | "`#d97706` → `--warn` (0 remain)" | ❌ **4 remain in 3 files** | `apps/web/app/hr/document-expiry/page.tsx:40,55` hardcode `#d97706` outright; `apps/web/app/tendering/pricing/page.tsx:103` and `apps/web/app/tendering/tenders/[id]/pricing/page.tsx:54` keep it as a `var(--warn, #d97706)` fallback (harmless but the fallback is dead code, since `--warn` is always defined). |

  *Method: `grep -rl` over `apps/web` for `var(--fg)`, `var(--surface`, `#2563eb`, `#d97706` — excluding `.next/` build output. `var(--surface`, `#2563eb`, and `placeholder="uuid"` are genuinely at **0**, confirming the rest of the migration landed.*

  Remaining (larger, follow-up): swap inline buttons/tables for the kit `<Button>`/`<Table>` components.
- **P2-4 AMC module inconsistency:** self-labelled "Asset Management & Contracts" vs "Annual Maintenance" elsewhere; different visual language. **✅ NAMING FIXED (2026-08-05, `dbf498e`):** the module titles as **"AMC & Services"** consistently. *Remaining: the visual-language half (the module still doesn't use the shared kit) rolls into P2-3.*
- **P2-5 IA discoverability:** "Opportunities" not a nav word (under Pipeline→/crm/leads); orphan pages `/crm/commercial`, `/tendering/pricing`; ~5–7s first paint. **✅ NAV FIXED (2026-08-05, `8a9b454`):** "Opportunities" is now a nav word and the orphan Commercial workspace is linked. *Remaining: `/tendering/pricing` reachability, and the **~5–7s first paint** — ⚠️ but see the measurement caveat below.*
  > **First-paint claim needs re-measuring (2026-08-05).** `GET /` measured **6.0s** — consistent with the original claim — but that was against the **Next.js dev server**, where the number is dominated by on-demand route compilation. The API call behind the homepage (`/admin/companies`) returns in **0.54s**, and warm pages (`/crm/overview` 1.6s, `/operations/overview` 1.0s, `/inventory/serials` 1.2s) are far faster. **No production build was measured, so "~5–7s first paint" should not be quoted as a production figure.** Re-measure against `next build && next start` before treating it as a real performance gap.
- **P2-6 Document layer:** revisions exist on drawings (`revision` default '0') but there's no unified version-history / approval-workflow / expiry-tracking surface across submittals, method statements, certificates, warranties.
- **P2-7 Scale:** in-memory search and some full-list loads are O(n); validate dashboard/list/report latency at 1k–10k projects; confirm index coverage on hot filter columns. **⏳ INDEX COVERAGE DONE (2026-08-05):** an index audit found 23 tenant-scoped tables with **no** index referencing `tenant_id` (every list there was a seq scan); migration `0219` adds a composite `(tenant_id, <hot col>)` index per table on the column each is actually filtered/joined by (parent FK, else status/date) — verified live (23/23 created; `EXPLAIN` on `aura_amc_tickets` now shows `Index Scan using idx_amc_tickets_status`). **Remaining (larger, deferred):** replace the in-memory cross-module search fan-out (capped at 50/module) with a denormalised search projection; latency validation at 1k–10k rows.

---

## 6. Security Findings (consolidated)

| # | Finding | Evidence | Sev |
|---|---------|----------|:---:|
| S1 | Auth/RBAC off → unauth access | guard `:100/:125`; live 200 w/ 34 recs, no token | P0 |
| S2 | RLS bypassed (owner-role conn) — **✅ fail-closed at boot** (refuses prod boot under BYPASSRLS role; operator flip to `aura_app` remains) | `main.ts`→`evaluateRlsPosture`; live boot exits 1; CI-proven | ◑ |
| S3 | ~~No SoD / self-approval~~ **✅ FIXED** — maker-checker (self→403) **+ value-threshold matrix** (approver `approvalLimit ≥ amount`, else→403) on quotation/contract/IPC/invoice | sod.e2e-spec.ts green | ✅ |
| S4 | ~~2 stores without tenant filter~~ **RETRACTED** — false positive (barrel files); all real stores scope `tenant_id` | verified 2026-08-03 | ✅ |
| S5 | Guard mechanism is sound when ON | route-derived perms cover ~600 handlers, server-side, deny-on-assert | ✅ strength |

**RBAC roles:** roles are **dynamic** (name + `permissions[]`, managed via `access-admin.controller`), not a fixed enum — so the requested Admin/Manager/Sales/PM/Engineer/Site/QA/HSE/Procurement/Store/Finance/Client set is *configurable but not pre-seeded*. There is no built-in **Client/customer** external role. *Recommend seeding a standard ELV RBAC matrix (below).*

**Recommended RBAC matrix (seed these roles × permissions):**
`module.entity.action` is already the taxonomy. Seed, e.g.:
- **Sales:** crm.lead.*, crm.opportunity.*, crm.quotation.create/read/update (NOT .approve)
- **Sales Manager:** + crm.quotation.approve, contracts.contract.read
- **PM:** projects.*, contracts.ipc.create (NOT .certify), site.read
- **Site Engineer:** site.*, quality.inspection-request.create
- **QA/QC:** quality.* (approve IR/NCR), commissioning.read
- **HSE:** hse.*, engineering.risk-assessment.read
- **Procurement:** procurement.* (create; PO.approve gated by matrix threshold)
- **Store:** inventory.* (GRN create, stock), NOT procurement.po.approve
- **Finance:** finance.* (invoice.create/read; post/approve gated), contracts.ipc.certify
- **Admin:** *
- **Client (new):** read-only scoped to own account's projects/handover/invoices.

---

## 7. Workflow Findings

- **Deal-chain automation is real** (reactor `apps/api/src/events/cross-module-subscriber.ts`): tender.awarded → auto Contract; contract.signed → auto Project (+WBS/CBS seed); ipc.certified → auto AR invoice; design_change.approved → auto Variation; amc.workorder.completed → auto AR invoice.
- **But each human gate is a manual click, not chained after approval** — approval *unlocks*, it does not *advance*. See P0-3.
- **Missing lifecycle steps for a real CCTV project:**
  - *Customer request / Site Survey → Opportunity*: **missing** (site module is execution diaries only).
  - *Handover accepted → AMC contract*: **manual** (warranty clock starts; AMC not auto-created).
  - *Notifications/documents per transition*: notifications engine exists and is event-wired, but document generation per transition is uneven (handover package yes; quotation/contract PDF `/print` routes yes; not all steps emit a document).

| Transition | Auto/Manual | Approval? | Notification? | Document? |
|-----------|:-----------:|:---------:|:-------------:|:---------:|
| Survey → Opportunity | ❌ missing | — | — | — |
| Opportunity → Quotation | Manual | none | partial | ✅ print |
| Quotation → Contract | Manual (1-click) | ✅ maker-checker (self→403) | ✅ | ✅ |
| Contract → Project | **Auto** on sign | ✅ maker-checker on sign | ✅ | — |
| Project → PO → GRN → Inventory | Manual + auto PO-received on GRN | Procurement matrix ✅ | ✅ | ✅ PO |
| Install → Commission → Handover | Manual | 🔴 none | partial | ✅ handover pkg |
| Handover → AMC | ❌ manual | — | — | — |
| IPC → Invoice → Payment | Auto-draft invoice on IPC certify | ✅ maker-checker on certify + invoice approve | ✅ | ✅ |

---

## 8. Data Integrity Findings

- **Value inheritance is correct:** tender.value → contract (reactor `:123`), contract value → project (`:215/:267`), project.value → CBS plannedValue (`:289`). A 100k quote flows to contract/project value.
- **No enforcement that invoice ≤ approved contract/IPC value** was found at the guard/service layer — *verify and add a cap check* (IPC net drives the auto-invoice, but manual invoices aren't bounded).
- **Orphans possible** (P1-1): no FKs; deletes are soft for record masters only (`0125` — assets/HR/fleet/budgets), not the whole chain.
- **Duplicate prevention:** relies on app logic + a few unique indexes; test-data dupes ("Cost Engine Test" ×3) show masters aren't deduped.
- **Status transitions:** validated in services (e.g., quotation edit refused once approved/sent; won-gate requires reason + value) — this part is solid.

---

## 9. UX Findings

- **Two design vocabularies:** polished CRM shell (correct tokens, next-best-action guidance) vs operational screens using undefined `--fg`/`--surface` tokens + hardcoded colors → inconsistent buttons/layout and low-contrast inputs. (P2-3)
- **Guidance stops at the contract:** next-best-action helper exists on 4 CRM 360s only; Contract → IPC → Invoice and all operational forms have no on-screen "what to do next."
- **14 forms demand a raw UUID** — unusable for junior/field users. (P1-4)
- **Strengths:** teaching-quality ELV copy on every screen; clear primary CTAs; no dead nav links; real Pipeline cockpit.

*(Full UX detail in the companion report `2026-08-03-junior-user-walkthrough.md`.)*

---

## 10. Recommended Implementation Roadmap

*(Progress marked 2026-08-05. ✅ = merged and verified · ◑ = partly done · ⬜ = untouched.)*

**Phase 0 — Security hardening (ship-blocking, ~1–2 wks)**
1. ⬜ **Fail-closed auth in production; boot assertion + CI check (P0-1).** ← **the one remaining P0, and the top of the list.**
2. ◑ Least-privilege `aura_app` DB role + force RLS; tenant-binding fitness test (P0-2, P1-5). ✅ mechanism, CI gate, `FORCE` coverage and a **boot-time fail-closed** are all in; ⬜ the operator still has to point `DATABASE_URL` at `aura_app`. *(S4 "2 unscoped stores" was retracted — false positive.)*
3. ✅ ~~Approval matrix + maker-checker across quotation/contract/IPC/invoice; "cannot approve own"~~ — **done**, both halves (P0-3).

**Phase 1 — Integrity & audit (~2–3 wks)**
4. ◑ Deal-chain integrity (P1-1). ✅ orphan-scan catalog extended to 19 refs; ⬜ optional intra-module FKs (blocked on `uuid`/`text` id reconciliation); ⬜ the 7 dangling refs in the dev DB.
5. ◑ Before/after on value mutations + History tab (P1-2). ✅ quotation, contract, invoice; ⬜ PO line changes.
6. ⬜ Invoice ≤ approved contract/IPC cap check (§8). *Untouched — still the clearest open money-cycle control.*

**Phase 2 — Field & usability (~2–3 wks)**
7. ◑ Shared UI kit on real tokens; migrate 66 screens; kill 14 UUID forms (P1-4, P2-3). ✅ kit shipped, undefined-token + off-brand-hex sweeps landed, **0 UUID inputs remain**; ⬜ 7 residual token/hex hits (table under P2-3) and the inline-button/table → kit swap.
8. ⬜ Camera/signature capture + offline PWA for Site/Quality/HSE. *Untouched — `apps/web/public/` is empty. The largest untouched item in the audit.*
9. ◑ Search: inventory/serials/equipment ✅ (live-verified); ⬜ DB full-text projection (P1-3).

**Phase 3 — Lifecycle completion & polish (~2 wks)**
10. ⬜ Pre-sales Site Survey → Opportunity intake; Handover-accepted → auto AMC.
11. ⬜ Next-best-action + AI step-guide on Contract → Invoice.
12. ◑ ✅ first-run 503 fixed (dev auto-migrate) · ✅ AMC renamed; ⬜ **clean demo seed** (now blocking the ELV search demo *and* CRM close-out — see P2-2) · ⬜ standard RBAC roles.

**Phase 4 — Scale hardening**
13. ◑ ✅ index coverage on hot filter columns (mig `0219`, 23 tables); ⬜ load-test at 1k/10k projects; ⬜ replace in-memory list/search scans; ⬜ the ~5–7s first paint (P2-5).

---

## What is genuinely strong (keep)
Event-sourced deal chain with real auto-reactors · value inheritance · notifications engine (event-wired, tenant routing) · real-data dashboards · strong CI (migration gate + restore drill + e2e + coverage) · route-derived permission taxonomy covering ~600 handlers · disciplined design-token foundation · teaching-quality ELV domain copy.
