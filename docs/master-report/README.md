# AURA OS — Enterprise Platform Master Report

**Edition:** 1.0 · **Date:** 2026-07-03 · **Source of truth:** the codebase at commit `fd51267`
(branch `feat/enterprise-form-engine`), verified by direct source inspection, green builds, and
green test runs. Nothing in this report is aspirational unless explicitly marked **[Planned]**
or **[Gap]**.

> **Update 2026-07-03 (branch `feat/command-center`, commit `08f2a60`):** the `/` homepage was
> rebuilt into an attention-first **Enterprise Command Center** — health-score ring, AI Daily
> Briefing, a single ranked "needs your attention" feed with inline actions, and Operations/
> Financial/Risk snapshots. Scoring/health core is framework-free + unit-tested in
> `shared/src/command-center/`. See [Volume 10 §16](vol-10-ui-ux.md) and
> `docs/reports/2026-07-03-enterprise-command-center.md`.
>
> **Update 2026-07-04 (branch `feat/command-center`, commit `2bbe72b`):** **role-based workspaces
> + Administrator Center** (`/admin/workspace`). Admins assign users to roles and configure, per
> role, which workspace functions each user sees; the Command Center enforces it and admins can
> "view as" any role. Framework-free model + config in `shared/src/workspace/`; API in
> `apps/api/src/workspace`. See [Volume 15 §1a](vol-15-administration.md) and
> `docs/reports/2026-07-04-role-based-workspace-admin.md`.
>
> **Update 2026-07-06 (PRs #26/#27/#29/#30 merged; #31 open):** the **aggregate-contract arc**
> landed and is now *enforced*: `BusinessAggregate` contract + shared `discipline` dimension
> (ADR-0011/0012), metadata-driven document Definitions (ADR-0017), Design-Change→Variation and
> RA→HSE event composition, **ADR-0004 debt paid to zero** (all 17 modules import only
> core+shared; cross-context gate/query deps go through module-owned ports bound at the app
> layer), and **architecture + error-taxonomy fitness tests** that fail CI on drift (module
> imports, docType literals, dimension redefinition, any domain error escaping as a 500 — audit
> found 57/389 escaping, now 0). Migrations now 131; test files 137. See
> [Volume 23 #8](vol-23-gap-analysis.md) and
> `docs/reports/2026-07-06-architecture-enforcement-and-error-taxonomy.md`.
>
> **Update 2026-07-07 (PR #31 cont.):** the enforced taxonomy's first payoff — **98
> per-controller `try/catch→400` wrappers retired** across 21 controllers (−392 net lines);
> domain errors now reach the global filter directly, so state guards correctly surface as
> **409** (procurement PO approval gates, insufficient stock) instead of a forced 400. 29 unit
> + 6 e2e + taxonomy-fitness green. See
> `docs/reports/2026-07-07-controller-wrapper-retirement.md`.
>
> **Update 2026-07-07 (universal pagination, gap #9):** closed the pagination tail —
> **fleet, all 8 HR lists, and doc-control** now expose additive `GET .../paged` `Page<T>`
> routes (plus the dormant assets/site wirings). Non-breaking (bare routes stay); ~5 new
> tests; API 29 unit + 6 e2e + turbo 22/22 green. See
> `docs/reports/2026-07-07-universal-pagination-adoption.md`.
>
> **Update 2026-07-07 (server-side form enforcement, gap #8 form half):** `assertFormValid`
> in shared runs the renderer's `evaluateForm` on the server so metadata rules
> (required/validation/custom-validators/blocking-rules) can't be bypassed via the API —
> 400 VALIDATION via the taxonomy; schemas relocate to shared keyed by their own id/endpoint;
> first enforced on `POST /hr/employees`. See
> `docs/reports/2026-07-07-server-side-form-enforcement.md`.
>
> **Update 2026-07-08 (admin center close-out, gap #12):** `/admin` hub landing shipped
> (live-count KPI strip + tiles grouped Governance/Configuration/Integration/Observability)
> and all 7 config screens rebuilt on shared professional chrome (`admin-chrome.tsx`) with
> per-page KPIs and offline guards; settings store now PG-backed (migration
> `0132_tenant_settings` fixed the missing table behind the settings 500). App-wide ELV
> navy/amber retheme via `globals.css` tokens. Remaining on #12: PG-backed roles/grants.
> Vol 23 register re-verified row-by-row against the live tree same day.
>
> **Update 2026-07-08 (P1 tier closed — gaps #6–#15, all ten):** OTLP metrics push + HTTP
> metrics + Prometheus alert pack (#6) · route-derived permission taxonomy covering all
> ~600 handlers by construction (#7) · `assertFormValid` on every metadata-form endpoint
> — quotation + subcontract schemas relocated to shared (#8) · site `/paged` tails +
> first frontend opt-in on `/crm/accounts` (#9) · AR-aging/invoice CSVs + web download
> buttons (#10) · per-user notification recipients via `NOTIFY_RECIPIENTS` (#11) ·
> PG-backed roles/grants with hydrate-on-boot, migration `0133` (#12) · persisted TOTP
> MFA gating login + Entra group→role mapping, migration `0134` (#13) · AES-256-GCM
> field-level PII crypto on WPS identifiers (#14) · perf baseline harness + budgets,
> one real hotspot found (#15). Verified: build 22/22 · typecheck 42/42 · tests 41/41
> tasks · live endpoint checks incl. restart-survival of PG grants. See
> `docs/reports/2026-07-08-p1-closure.md` and Vol 23 §2.
>
> **Update 2026-07-08 (admin center professional pass + phase 2 start):** config screens
> rebuilt matrix-first — Roles & Access as a **permission matrix** (roles × modules, ALL
> wildcard, custom-key chips) + **user-grants matrix** (directory × roles, click-to-grant)
> with per-user MFA reset; approval matrix as a **value-band grid editor**; flags as
> toggles; numbering inline-edit with live next-number preview; webhooks pause/resume +
> status pills (shared kit `admin-ui.tsx`). **Phase 2 opened:** `/admin/organization`
> (guided tenant profile, Vol 15 §2.1) and `/admin/health` (ops dashboard — dead letters,
> webhook delivery health, spine activity, Vol 15 §2.10). All 9 admin pages verified 200;
> matrix toggle + band-save roundtrips exercised live. Board: Admin Center 7.2 → 7.7.
>
> **Update 2026-07-08 (phase 2 wave 2 — companies + business calendar, Vol 15 §2.1):**
> **Companies master** shipped end-to-end: `aura_companies` (migration `0135`) +
> `CompaniesService` + `admin/companies` CRUD + inline-edit grid on `/admin/organization`;
> the **app-shell company switcher now reads the registry** (hardcoded list is only the
> dev fallback). **Business calendar** shipped: kernel `CalendarService` grew full CRUD
> over the 0030 tables (calendars, holidays, hour adjustments) + `admin/calendar` API +
> `/admin/calendar` page — weekend-day toggle matrix, holidays, Ramadan-hour periods.
> Verified live: company + calendar + UAE National Day holiday + Ramadan adjustment
> created and read back; build 22/22, core 125 tests. Board: Admin Center 7.7 → 7.9.
>
> **Update 2026-07-09 (phase 2 wave 3 — notification routing §2.8 + data admin §2.9):**
> **Notification routing is now tenant-editable**: NotificationService consults
> `notify.channels` / `notify.recipients` / `notify.fallbackRecipient` settings on every
> dispatch (env stays the fallback; +1 test, core 126); `/admin/notifications` gives
> channel toggles, a per-user recipient grid, transport status (env booleans only — no
> secrets), and the six event→notification wirings. **Data admin**: `/admin/data` with an
> idempotent demo-company seed (`admin/platform/seed-demo` over `DemoSeeder.runIfEmpty`),
> the four CSV export feeds, and chart-of-accounts CSV import. Verified live: settings
> write → effective routing readback flips source env→settings; seed correctly refuses on
> a non-empty tenant; all pages 200. Vol 15 §2.1/§2.8/§2.9/§2.10 now shipped — remaining
> spec: form designer §2.4, AI admin depth §2.7, document retention §2.6.
> Board: Admin Center 7.9 → 8.1.
>
> **Update 2026-07-09 (§2.7 AI administration):** `/admin/ai` shipped — provider seam
> status (claude vs local fallback, key presence booleans only), **guardrail toggles**
> over a default rule pack that now registers at boot (content-safety keywords, PII
> mask, 4k token cap; `AiGuardrailsService.setEnabled` + `admin/platform/ai` endpoints),
> and the autonomy-queue KPI with a deep link to the Intelligence Console. Verified
> live: toggle off → readback `enabled:false` → restored; intelligence 27 tests green.
> §2.7 remaining depth: durable PG rule registry, prompt-pack overrides, cost meters.
>
> **Update 2026-07-09 (Form Designer P1 — the §2.4 flagship, first slice):** admins tune
> registered forms without code at `/admin/forms` — labels, placeholders, hints, required
> flags, visibility, per tenant (`aura_form_overrides`, migration 0136). The override
> patch is merged by shared `applyFormOverrides` in **both** the web renderer (FormDrawer
> fetches `/forms/:id/overrides` before the engine inits, cached per page) **and** the
> API's `assertFormValid` on all three enforced endpoints — designed = rendered =
> enforced; hiding a field defuses its required check. Verified live end-to-end:
> require+relabel laborCamp → employee create 400 "Camp / Accommodation is required" →
> reset → 201. +4 shared tests (159). Remaining §2.4: add/reorder fields, layout & rule
> editing, versioned publish. Board: Admin Center 8.1 → 8.4.
>
> **Update 2026-07-09 (P0 deploy wave — gaps #3/#4/#5 closed, PR #51):** the platform is
> now **packaged, gated, and rehearsed**. Docker: multi-stage `apps/api/Dockerfile` (same
> image runs migrations), `apps/web/Dockerfile` (Next standalone; production build
> verified), `docker-compose.yml` (pgvector PG → migration gate → api → web). CI grew
> three jobs: **deploy-readiness** (full migration chain from zero + idempotence rerun +
> built API boots + **automated restore drill**: seed via live API → `pg_dump` →
> `pg_restore` into a fresh DB → per-table count verification), **secret-scan**
> (gitleaks), **docker-images** (GHCR publish on main). Secrets: `readSecret()` vault
> seam (`<NAME>_FILE` for Docker/K8s/vault-CSI mounts) at every secret read + staged PII
> key rotation (`PII_ENCRYPTION_KEY_PREVIOUS`) + `docs/runbooks/secrets-rotation.md`.
> DR: `docs/runbooks/backup-dr.md` (RPO ≤5 min / RTO ≤4 h). **P0 #1 RLS is the only
> remaining register row below P2** — scheduled last by design, to land with first
> deploy. See `docs/reports/2026-07-09-p0-deploy-wave.md` and Vol 19/Vol 7 §10/Vol 23.
>
> **Update 2026-07-09 (P2 wave 1 — gaps #21/#25/#27, the S–M tier):** with P0 done, the
> register's P2 tier opened. **#21 SDK**: `@aura/sdk` (`packages/sdk`) — typed client
> generated from the live OpenAPI doc (646 operations) over a hand-written core carrying
> the error taxonomy (`AuraApiError`), idempotency keys, and `Page<T>`; **CI regenerates
> against the built API and fails on drift**; verified live (login → create → paged →
> 404→NOT_FOUND). **#25 data lifecycle**: forward-only migration policy with `@DOWN`
> required from 0137 (CI gate incl. numbering-gap check) · **orphan scan** over the 11
> spine cross-context references (enforced in CI post-seed) · **archiver** for
> events/audit → `*_archive` twins (processed-only guard, dry-run default) ·
> `docs/runbooks/data-lifecycle.md`. **#27 test depth**: the five weakest modules now ≥4
> meaningful test files each (design-change→Variation seam, PTW/CAPA, EOT delay logs,
> disposal guards, transmittal project guard). Remaining P2: the L rows (#16 remainder,
> #17–#20, #22–#24, #26). See `docs/reports/2026-07-09-p2-wave1.md`.
>
> **Update 2026-07-09 (governance hardening):** guardrail toggles are now **durable** —
> write-through to `aura_ai_guardrails` (the 0040 table, finally wired) + hydrate on boot,
> verified surviving an API restart. **Config-change audit** landed: admin mutations on
> settings, form designs, roles/grants, and guardrails write immutable audit entries
> (module=admin) — verified rows for `setting:company.website updated` and
> `guardrail:content-safety disabled/enabled` via /audit, browsable at /admin/audit.

**Verified platform counts (2026-07-04):**

| Metric | Count |
|---|--:|
| Business modules | 17 (+ Intelligence platform) |
| API route handlers | 555 across 33 controller areas |
| Web pages | 94 |
| Web BFF routes | 207 |
| Web components | 86 |
| SQL migrations | 126 (sequential, duplicate-guarded) |
| Domain events in catalog | 71 |
| Test files | 134 (vitest) + Playwright smoke e2e |
| Kernel services | 21 core service areas |

---

## Volumes

| # | Volume | File |
|--:|---|---|
| 1 | Executive Summary | [vol-01-executive-summary.md](vol-01-executive-summary.md) |
| 2 | Product Architecture | [vol-02-architecture.md](vol-02-architecture.md) |
| 3 | Complete Module Catalog | [vol-03-module-catalog.md](vol-03-module-catalog.md) |
| 3A | Screen Walkthroughs (93 pages) | [vol-03a-screen-walkthroughs.md](vol-03a-screen-walkthroughs.md) |
| 4 | Kernel Documentation | [vol-04-kernel.md](vol-04-kernel.md) |
| 5 | Enterprise Form Platform | [vol-05-form-platform.md](vol-05-form-platform.md) |
| 6 | AI Platform | [vol-06-ai-platform.md](vol-06-ai-platform.md) |
| 7 | Security | [vol-07-security.md](vol-07-security.md) |
| 8 | Database | [vol-08-database.md](vol-08-database.md) |
| 8A | Data Dictionary (146 tables, generated) | [vol-08a-data-dictionary.md](vol-08a-data-dictionary.md) |
| 9 | API Documentation | [vol-09-api.md](vol-09-api.md) |
| 9A | Endpoint Reference (551 handlers, generated) | [vol-09a-endpoint-reference.md](vol-09a-endpoint-reference.md) |
| 10 | UI / UX System | [vol-10-ui-ux.md](vol-10-ui-ux.md) |
| 11 | Workflow Catalog | [vol-11-workflow-catalog.md](vol-11-workflow-catalog.md) |
| 12 | Business Rules Library | [vol-12-business-rules-library.md](vol-12-business-rules-library.md) |
| 13 | Formula Library | [vol-13-formula-library.md](vol-13-formula-library.md) |
| 14 | Metadata Platform | [vol-14-metadata-platform.md](vol-14-metadata-platform.md) |
| 15 | Administration Center | [vol-15-administration.md](vol-15-administration.md) |
| 16 | Reporting Platform | [vol-16-reporting.md](vol-16-reporting.md) |
| 17 | Integration Platform | [vol-17-integration.md](vol-17-integration.md) |
| 18 | Dev Platform | [vol-18-dev-platform.md](vol-18-dev-platform.md) |
| 19 | Deployment | [vol-19-deployment.md](vol-19-deployment.md) |
| 20 | Product Roadmap | [vol-20-roadmap.md](vol-20-roadmap.md) |
| 21 | Quality Assurance | [vol-21-quality-assurance.md](vol-21-quality-assurance.md) |
| 22 | Competitive Analysis | [vol-22-competitive-analysis.md](vol-22-competitive-analysis.md) |
| 23 | Gaps Analysis | [vol-23-gap-analysis.md](vol-23-gap-analysis.md) |
| 24 | Future Vision | [vol-24-future-vision.md](vol-24-future-vision.md) |
| 25 | Appendices | [vol-25-appendices.md](vol-25-appendices.md) |

---

## Platform Health Score Board

Scoring method: **Completion** = share of the module's target scope that exists and works today
(verified). **Architecture** = adherence to the kernel template (ports/adapters, events, domain
purity, tests). **Enterprise Ready** = usable by a real customer for daily work in that area
today. **Score** = weighted blend (50% completion, 30% architecture, 20% readiness), calibrated
against the 2026-07-01 due-diligence audit and re-verified 2026-07-03 (Administration Center
row updated 2026-07-08 per the Vol 23 register re-verification).

### Platform layers

| Area | Completion | Architecture | Enterprise Ready | Score |
|---|--:|---|---|--:|
| Kernel (events, workflow, DMS, identity, numbering, audit…) | 88% | Excellent | Yes | **9.2/10** |
| Form Engine (metadata forms, rules, formulas, plugins, AI fill/review) | 85% | Excellent | Yes | **9.0/10** |
| Command Center (attention scoring, business-health, AI briefing homepage) | 80% | Excellent | Yes | **8.6/10** |
| AI Platform (provider seam, RAG, insights, autonomy, MCP) | 55% | Good | Early | **6.5/10** |
| Integration Platform (webhooks, connectors, **published @aura/sdk** w/ CI drift gate) | 50% | Good | Early | **5.9/10** |
| Reporting / BI (charts + CSV/BI exports w/ web downloads) | 50% | Fair | Early | **5.5/10** |
| Security (P1 closed; vault seam + rotation + secret scanning done; **RLS is the one open P0**) | 65% | Good design | **No — RLS open** | **6.0/10** |
| Deployment / Operations (Docker + compose + CI migration gate + GHCR images + observability + backup/DR drill; first cloud target open) | 60% | Good | Nearly (single-host eval yes) | **6.3/10** |
| Administration Center (searchable hub + 18 screens; §2.1/§2.4-P1/§2.7/§2.8/§2.9/§2.10 shipped; matrix UIs; PG-backed) | 85% | Good | Yes (config self-serve) | **8.4/10** |
| Mobile / Offline | 5% | Not started | No | **1.5/10** |

### Business modules

| Module | Completion | Architecture | Enterprise Ready | Score |
|---|--:|---|---|--:|
| Finance | 85% | Very good | Yes | **8.8/10** |
| Procurement | 82% | Very good | Yes | **8.6/10** |
| Projects | 80% | Very good | Yes | **8.4/10** |
| Inventory | 80% | Good | Yes | **8.4/10** |
| HR | 80% | Good | Yes | **8.4/10** |
| CRM | 75% | Good | Partially | **7.9/10** |
| Contracts | 75% | Good | Partially | **7.9/10** |
| Subcontracts | 75% | Good | Partially | **7.8/10** |
| AMC & Services | 74% | Good | Partially | **7.7/10** |
| Tendering | 72% | Good | Partially | **7.7/10** |
| Fleet & Logistics | 68% | Good | Partially | **7.2/10** |
| Quality | 70% | Good | Partially | **7.4/10** |
| HSE | 65% | Good | Partially | **7.0/10** |
| Site Control | 65% | Good | Partially | **7.0/10** |
| Assets & Equipment | 66% | Good | Partially | **7.0/10** |
| Document Control | 62% | Good | Partially | **6.8/10** |
| Engineering | 55% | Fair | Not yet | **6.0/10** |

The scores are revisited in Volume 23 (Gaps) with the exact evidence behind each number.

---

## How to read this report

- Every claim of the form "X exists" was verified against the tree on 2026-07-03.
- **[Gap]** marks something that does not exist yet; **[Planned]** marks a designed-but-unbuilt item.
- File paths are given so any statement can be re-verified (`modules/finance/src/journal.service.ts` style).
- Volumes 11–13 are living catalogs — they enumerate what is in the code today and are the
  designated home for future workflow/rule/formula additions.
