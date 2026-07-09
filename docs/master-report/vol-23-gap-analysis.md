# Volume 23 — Gaps Analysis

[← Master index](README.md)

The single consolidated register: **what exists, what doesn't, priority, estimate, risk.**
De-duplicated across all volumes (each gap cites its home volume). Effort: S <1wk · M 1–4wk ·
L 1–3mo. Risk = what happens if shipped/sold without it.

---

## 1. What exists (the asset base — one paragraph of record)

17 modules on a uniform kernelized template · 551+ API handlers · 93 pages · 149 tables /
134 migrations · 71-event catalog with transactional outbox + 12 automatic cross-module
reactors · workflow/saga/approval engines · DMS + templates + 9 print documents · immutable
audit · numbering · notifications (in-app) · RBAC/ABAC engine · multi-currency + GL with
DB-enforced double entry · GCC statutory HR (WPS/EOSB) · metadata form platform with rules/
formulas/plugins/AI-fill/AI-review · AI seam (Claude+local) + guardrailed autonomy + vector
store + MCP · webhooks/SDK-gen/CSV · CI with unit+e2e+smoke · 132 test files · demo seeder ·
28 verification reports.

## 2. The gap register

> **Re-verified against the live tree 2026-07-08 (morning)** — every row checked by code
> inspection; #12 updated (admin hub + PG settings). **Same day (evening): the entire P1
> tier was closed** — see the P1 section banner and `docs/reports/2026-07-08-p1-closure.md`
> for the row-by-row evidence. **2026-07-09: P0 #3/#4/#5 closed in one wave** (Docker + CI
> migration gate + secrets seam + backup/DR restore drill — PR #51,
> `docs/reports/2026-07-09-p0-deploy-wave.md`). **P0 #1 (RLS) is the only open register row
> below P2 — scheduled last by design.**

### P0 — cannot sell/deploy without (all V1)

| # | Gap | Home | Effort | Risk if ignored |
|--:|---|---|---|---|
| 1 | RLS enforcement bundle (least-priv role, tenant GUC, FORCE RLS, isolation test) | Vol 7 §3 | M | cross-tenant data exposure — existential |
| 2 | Auth ON + refresh/revocation + lockout — **DONE 2026-07-07**: `AUTH_REQUIRED=true` fail-closed 401 (main.ts, public allowlist) · brute-force `LoginThrottle` (429 after N, `AUTH_LOCKOUT_*`) · JWT `jti` + `TokenRevocationStore` denylist checked on verify · `POST /auth/refresh` (sliding session) + `POST /auth/logout` (revoke). ~19 new tests. *Turning auth on also makes the #7 permission guard enforce.* | Vol 7 §1 | ✅ | open API in any misconfig |
| 3 | Secrets vault + rotation — **DONE 2026-07-09**: `readSecret()` vault seam (`<NAME>_FILE` convention for Docker/K8s/vault-CSI mounts, env fallback, unreadable explicit mount fails at boot) wired at every secret read (`DATABASE_URL`, `AUTH_JWT_SECRET`, `ANTHROPIC_API_KEY`, `PII_ENCRYPTION_KEY`) · staged PII key rotation (`PII_ENCRYPTION_KEY_PREVIOUS` decrypt fallback, +1 test) · gitleaks CI job · `docs/runbooks/secrets-rotation.md` (inventory, windows, revocation drill; history greps clean) | Vol 7 §10 | ✅ | ~~credential compromise~~ (residual: rotate dev keys per runbook) |
| 4 | Docker + deploy target + migration gate in CI — **DONE 2026-07-09**: multi-stage `apps/api/Dockerfile` (same image = migration job) + `apps/web/Dockerfile` (Next standalone) + `docker-compose.yml` (pgvector PG → migration gate → api → web) · CI `deploy-readiness` (full 136-chain from zero + idempotence rerun + built API boots) · CI `docker-images` (build per PR, GHCR publish on main). Production `next build` verified. First cloud target (Azure, Vol 19 §4) is the remaining deploy step — tracked in Vol 19 §11, not a register row | Vol 19 §2–3 | ✅ | ~~cannot ship~~ |
| 5 | Backups/DR + restore drill — **DONE 2026-07-09**: `docs/runbooks/backup-dr.md` (RPO ≤5 min PITR / RTO ≤4 h, portable `pg_dump -Fc` secondary, DMS bucket versioning, failure scenarios, quarterly-drill policy + log) · **drill automated in CI**: seed via live API → freeze → dump → restore into fresh DB → `verify-restore.mjs` fails on any per-table count drift or empty source | Vol 19 §8–9 | ✅ | ~~unrecoverable data loss~~ |

### P1 — enterprise-credibility (V1 → early V2) — **ALL CLOSED 2026-07-08**

> The whole tier was closed in one pass on 2026-07-08 and verified live (build 22/22 ·
> typecheck 42/42 · test tasks 41/41 · endpoint-by-endpoint API/web checks). Evidence:
> `docs/reports/2026-07-08-p1-closure.md`.

| # | Gap | Home | Effort | Risk |
|--:|---|---|---|---|
| 6 | Observability — **CLOSED 2026-07-08**. Foundation (2026-07-07): metrics registry + Prometheus `GET /metrics` (`METRICS_ENABLED`). Close-out: dependency-free **OTLP/HTTP push** (`OTLP_METRICS_URL`/`_INTERVAL_MS`/`_HEADERS`, counters→cumulative sums; refreshes outbox gauges pre-push; 5 tests) · **HTTP metrics** (`http_requests_total` + duration sum/count by method/status class, main.ts middleware) · **alert rule pack** `infrastructure/observability/prometheus-alerts.yml` (dead-letters, backlog, webhook failures, 5xx ratio, latency, job failures) + README | Vol 19 §6 | ✅ | ~~blind operations~~ |
| 7 | Permission taxonomy — **CLOSED 2026-07-08**. Guard enforced 2026-07-07; close-out: **route-derived default permissions** — with no `@Permissions` decorator the guard derives `module.entity.action` from the declared route (`POST crm/accounts`→`crm.account.create`, `POST …/:id/approve`→`finance.invoice.approve`), so **all ~600 handlers are covered by construction** (no 588-file annotation pass); explicit decorators override; health/auth/metrics exempt; 9 guard tests · roles-admin UI = `/admin/access` · **DB-backed grants** via #12 | Vol 7 §2 | ✅ | ~~coarse authz~~ |
| 8 | Global validation layer — **CLOSED 2026-07-08**. Error half (taxonomy + fitness test + wrapper retirement) done 07-06/07; form half: `assertFormValid` mechanism + `hr.employee` (07-07), close-out relocated the remaining metadata schemas to shared and wired enforcement: **`crm.quotation` → POST /crm/quotations · `subcontracts.subcontract` → POST /subcontracts** (engineering-documents schema has no endpoint by design — submits via its own tab handler). Every metadata-form-backed endpoint now enforces server-side | Vol 9 §7 | ✅ | ~~rules bypassable~~ |
| 9 | Universal pagination — **CLOSED 2026-07-08**. Fleet/HR/doc-control 07-07; close-out: the 4 site child lists (`delay-logs`, `material-consumption`, `instructions`, `labour`) got `/paged` routes (windowed over findAll — low-growth) + **frontend opt-in exemplar**: `/crm/accounts` now fetches `/paged` (50/window) with a server-rendered pager | Vol 9 §1 | ✅ | ~~performance cliffs~~ |
| 10 | Charts/BI floor — **CLOSED 2026-07-08**. Audit CSV 07-07; close-out: **AR aging CSV** (`customer-invoices/aging.csv`, pure `arAgingCsvRows` + test) · **supplier-invoice register CSV** (`invoices/export.csv`) · **web download buttons** on AR aging, AP aging, invoices + filter-aware audit export, each via a BFF csv proxy route | Vol 16 | ✅ | ~~lost exec demos~~ |
| 11 | Notification delivery — **CLOSED 2026-07-08**. Channel relays + event wiring verified 07-07; close-out: **per-user recipient resolution** — `NOTIFY_RECIPIENTS` map (`u-finance=fin@co.com,…`) → address-shaped userId passthrough → tenant fallback (`resolveRecipient`, 2 tests). Built-in SMTP transport stays external-relay by design (config seam) | Vol 4 §9 | ✅ | ~~"system that doesn't tell you anything"~~ |
| 12 | Admin center phase 1 — **CLOSED 2026-07-08** (fully). 7 screens + `/admin` hub + professional chrome + PG settings (migration `0132`); close-out: **PG-backed roles/grants** (migration `0133_access_roles_grants`; AccessService write-through + hydrate-on-boot — decisions stay sync in-memory; verified surviving a restart: "Hydrated 3 role(s) + 3 grant(s)"). **Professional matrix pass + phase 2 start, same day (evening):** Roles & Access rebuilt as a **permission matrix** (roles × modules + ALL column + custom-key chips) and a **user-grants matrix** (directory × roles, click-to-grant) with per-user **MFA reset** (`DELETE /auth/mfa`); approval matrix → **value-band grid editor**; flags → toggles; numbering → inline grid w/ live preview; webhooks → pause/resume + status pills (shared kit `admin-ui.tsx` + `.adm-*`). **Phase 2 shipped:** `/admin/organization` (guided tenant profile, Vol 15 §2.1) + `/admin/health` (ops dashboard: dead letters, delivery health, spine activity, Vol 15 §2.10); **wave 2 same day:** companies master (migration `0135` + `CompaniesService` + grid on Organization; **app-shell switcher reads the registry**) + business calendar (kernel `CalendarService` CRUD over 0030 + `/admin/calendar`: weekend matrix, holidays, Ramadan adjustments). All 11 admin pages verified 200 + CRUD roundtrips live. **Wave 3 (2026-07-09):** notification routing §2.8 (dispatcher reads tenant `notify.*` settings, env fallback; `/admin/notifications` w/ channel toggles + recipient grid + transport/event status) + data admin §2.9 (`/admin/data`: idempotent demo seed, CSV export hub, COA import). Vol 15 §2.1/§2.8/§2.9/§2.10 all shipped | Vol 15 §1–3 | ✅ (phase 2 §2.1/§2.8/§2.9/§2.10 done) | ~~config = engineering ticket~~ |
| 13 | MFA + SSO — **CLOSED 2026-07-08**. Entra OIDC accepted + TOTP landed 07-07; close-out: **persisted per-user MFA** (migration `0134_user_mfa`; two-step enroll→activate so an unscanned QR can't lock anyone out) · **login gate** (active enrolment ⇒ `POST /auth/login` requires a valid code; bad codes hit the same lockout) · **Entra groups→AURA roles** (`AUTH_GROUP_ROLE_MAP` csv, applied idempotently on IdP token verify; 6 tests) | Vol 7 §7–8 | ✅ | ~~IT checklist failure~~ |
| 14 | Field-level PII encryption — **CLOSED 2026-07-08**. AES-256-GCM field crypto in shared (`enc:v1:` versioned format, random IV, auth-tag fail-closed, legacy-plaintext passthrough, staged by `PII_ENCRYPTION_KEY`; 8 tests). Wired at the storage boundary for the WPS identifiers (`iban`, `molEmployeeId` in the HR employee store) — domain/UI stay plaintext, DB holds ciphertext. Pattern set; extend per-field as catalogued | Vol 7 §4 | ✅ | ~~PDPL exposure~~ |
| 15 | Performance baseline + budgets — **CLOSED 2026-07-08**. Harness `apps/api/scripts/perf-baseline.mjs` (`pnpm --filter @aura/api perf`; p50/p95/max vs per-endpoint budgets; `--enforce` for CI). Baseline measured & documented: app work is <120ms everywhere once the ~170ms remote-DB RTT is subtracted; **one real hotspot found** (`GET /events` unwindowed feed) + paged-endpoint 2-RTT note. Budgets + findings: `docs/reports/2026-07-08-performance-baseline.md` | Vol 21 §3 | ✅ | ~~unknown ceilings~~ |

### P2 — competitive depth (V2)

| # | Gap | Home | Effort |
|--:|---|---|---|
| 16 | Form designer (no-code phase 1, DB schemas) | Vol 5 §10 | L |
| 17 | Mobile field app (PWA + offline drafts) | Vol 20 V2 | L |
| 18 | Customer + supplier portals | Vol 20 V2 | L |
| 19 | Gantt/baselines + Primavera import | Vol 3 §4, Vol 17 | L |
| 20 | AI wave 2 (risk scoring, recommendations, RAG-over-DMS, OCR) | Vol 6 | L |
| 21 | OpenAPI + published SDK + API docs | Vol 9 §5 | S–M |
| 22 | M365 Graph email (CRM) + bank feeds + FTA e-filing | Vol 17 §4 | M each |
| 23 | Metadata expansion (list views, dashboards, menus) | Vol 14 | L |
| 24 | Module-depth completions (Vol 3 per-module roadmap rows: warranty workflow, batch/serial, org chart, calibration automation, CRM/quality/HSE/fleet/assets/AMC dashboards…) | Vol 3 | M–L cumulative |
| 25 | Down-migration policy + orphan-scan + archiving | Vol 8 | S–M |
| 26 | Golden-flow E2E + axe pass + coverage gate | Vol 21 | M |
| 27 | Weak-module test depth (Engineering ×1 file, HSE/Site/Assets/DocControl ×2) | Vol 21 §1 | S–M |

### P3 — platform era (V3)

| # | Gap | Home |
|--:|---|---|
| 28 | Marketplace + plugin SDK packaging + CLI | Vol 18, Vol 20 V3 |
| 29 | Custom fields → custom entities (low-code) | Vol 14 §1 |
| 30 | Workflow designer UI | Vol 11 §11 |
| 31 | Live collaboration (presence/locks) + offline sync | Vol 5 Phase-3 remainder |
| 32 | GraphQL (demand-triggered) | Vol 9 §2 |
| 33 | Partitioning/read-replicas/cells | Vol 8 §7, Vol 19 §10 |
| 34 | SOC 2 Type II + pen-test cycle + bounty | Vol 7 §6, Vol 21 §4 |

## 3. Known debt (not features — hygiene)

| Item | Note |
|---|---|
| `any`/`as any` concentration in pg-row mappers (~372 flagged 2026-07-01) | mechanical typed-row pass, S–M |
| Two multi-currency approaches on main (PR#13 FX registry vs invoice fields) | consolidation pass pending (recorded in memory + due diligence) |
| `.gitattributes` CRLF normalization | S — the warning noise in every commit |
| Legacy inline-style tables on some server list pages | being retired module-by-module |
| `pnpm audit` non-blocking in CI | flip to fail on high/critical |
| Site/AMC events not yet in the typed catalog | S |

## 4. Health-score reconciliation

The README health board derives from this register: an area's score falls with the count and
severity of its open rows. With P1 closed (2026-07-08) and P0 #3/#4/#5 closed (2026-07-09),
Security carries only the RLS row (#1 → 6.0) and Deployment/Operations rises to 6.3 (packaging,
gate, observability, backup/DR built; first cloud target is what remains). When a row closes,
the board updates — the two documents are maintained together.

## 5. The single most important sentence

**Four of the five P0s are closed; the RLS enforcement bundle (#1) — deliberately sequenced
last, to land with the first real deploy — is now the single remaining gap between "impressive
codebase" and "product a customer can trust with their books."**

---

*Next: [Volume 24 — Future Vision](vol-24-future-vision.md)*
