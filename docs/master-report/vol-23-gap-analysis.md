# Volume 23 — Gaps Analysis

[← Master index](README.md)

The single consolidated register: **what exists, what doesn't, priority, estimate, risk.**
De-duplicated across all volumes (each gap cites its home volume). Effort: S <1wk · M 1–4wk ·
L 1–3mo. Risk = what happens if shipped/sold without it.

---

## 1. What exists (the asset base — one paragraph of record)

17 modules on a uniform kernelized template · 551 API handlers · 93 pages · 146 tables /
126 migrations · 71-event catalog with transactional outbox + 12 automatic cross-module
reactors · workflow/saga/approval engines · DMS + templates + 9 print documents · immutable
audit · numbering · notifications (in-app) · RBAC/ABAC engine · multi-currency + GL with
DB-enforced double entry · GCC statutory HR (WPS/EOSB) · metadata form platform with rules/
formulas/plugins/AI-fill/AI-review · AI seam (Claude+local) + guardrailed autonomy + vector
store + MCP · webhooks/SDK-gen/CSV · CI with unit+e2e+smoke · 132 test files · demo seeder ·
28 verification reports.

## 2. The gap register

### P0 — cannot sell/deploy without (all V1)

| # | Gap | Home | Effort | Risk if ignored |
|--:|---|---|---|---|
| 1 | RLS enforcement bundle (least-priv role, tenant GUC, FORCE RLS, isolation test) | Vol 7 §3 | M | cross-tenant data exposure — existential |
| 2 | Auth ON by default + refresh/revocation + lockout | Vol 7 §1 | S–M | open API in any misconfig |
| 3 | Secrets vault + rotation + revoke exposed keys | Vol 7 §10 | S | credential compromise (keys have touched dev trees) |
| 4 | Docker + deploy target + migration gate in CI | Vol 19 §2–3 | M | cannot ship, cannot upgrade customers |
| 5 | Backups/DR documented + restore drill | Vol 19 §8–9 | S | unrecoverable data loss |

### P1 — enterprise-credibility (V1 → early V2)

| # | Gap | Home | Effort | Risk |
|--:|---|---|---|---|
| 6 | Observability — **foundation landed 2026-07-07** (dependency-free metrics registry with Prometheus exposition; `jobs_processed_total` + `webhook_deliveries_total` counters instrumented; `GET /metrics` refreshes `outbox_pending`/`outbox_dead_letter` gauges at scrape time, gated by `METRICS_ENABLED`; 5 tests). Remaining: OTLP exporter option + alert rules + more gauges | Vol 19 §6 | S (was M) | blind operations; SLA impossible |
| 7 | Permission taxonomy on 551 handlers + DB roles + roles UI | Vol 7 §2 | M | coarse authz blocks enterprise security review |
| 8 | Global validation layer — **error half done 2026-07-06/07** (enforced error taxonomy: pure `classifyDomainMessage` + fitness test failing CI on any 500-escape, PR #31; audit: 57/389 domain throws escaped → 0; **98 per-controller try/catch→400 wrappers retired 2026-07-07** across 21 controllers so the taxonomy's 404/409 now surface). **form half mechanism landed 2026-07-07** (`assertFormValid` in shared runs the same `evaluateForm` server-side → 400 VALIDATION via the taxonomy; schemas relocate to shared keyed by their own id/endpoint; first enforced on `POST /hr/employees`). Remaining: apply `assertFormValid` to the other create/update endpoints (mechanical, per-schema) | Vol 9 §7 | S | metadata rules bypassable on not-yet-wired endpoints |
| 9 | Universal pagination — **tail closed 2026-07-07** (fleet, HR all-8, doc-control paginated + dormant assets/site wirings exposed; additive `/paged` `Page<T>` routes, non-breaking; ~5 new tests). Remaining: low-growth site child lists + frontend opt-in | Vol 9 §1 | XS (was S–M) | large-tenant performance cliffs |
| 10 | Charts/BI floor (dashboard charts + Power BI export) | Vol 16 | S–M | lost exec demos (competitive vulnerability #2) |
| 11 | Notification delivery channels — **verified already delivered** (config-gated relay per channel: `SMTP_RELAY_URL`/`SMS_RELAY_URL`/`SLACK`/`TEAMS`, `NOTIFY_CHANNELS`+`NOTIFY_FALLBACK_RECIPIENT`, logged dev fallback; event→notification wiring for 6 event types; full test suite in `notification.service.test.ts`). Remaining: per-user recipient resolution (currently a tenant fallback address) + optional built-in SMTP transport (vs external relay) | Vol 4 §9 | XS (was S) | "system that doesn't tell you anything" |
| 12 | Admin center phase 1 (settings service, users/roles, numbering/approval/webhook UIs) | Vol 15 §3 | M | every config change = engineering ticket |
| 13 | MFA + SSO — **Entra OIDC already accepted** (AuthService verifies IdP JWKS via `AUTH_JWKS_URL`) + **TOTP MFA landed 2026-07-07** (RFC 6238 in shared, enroll/verify endpoints; 7 tests incl. RFC vectors). Remaining: persist per-user MFA secret + gate login; map Entra groups→AURA roles | Vol 7 §7–8 | S (was M) | enterprise IT checklist failure |
| 14 | Field-level PII encryption | Vol 7 §4 | M | PDPL exposure (salaries, IDs) |
| 15 | Performance baseline + budgets | Vol 21 §3 | S | unknown ceilings before first big tenant |

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
severity of its open rows (e.g. Security 4.5 = five P0/P1 rows; Admin Center 3.0 = spec-only).
When a row closes, the board updates — the two documents are maintained together.

## 5. The single most important sentence

**Nothing on the P0 list is architecturally hard — every one is scoped, most are S/M — but all
five together are the difference between "impressive codebase" and "product a customer can
trust with their books."**

---

*Next: [Volume 24 — Future Vision](vol-24-future-vision.md)*
