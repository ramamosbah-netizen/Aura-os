# AURA OS — Enterprise Software Due-Diligence & Completion Audit

> **Auditor:** Chief Enterprise Software Architect / Technical Due-Diligence Lead (CTO · Enterprise Architect · ERP Solution Architect · Principal Engineer · DevOps · Security · DBA · QA Director · UX · PM lenses)
> **Date:** 2026-06-29 · **Method:** read-only source inspection, single-pass, evidence-based · **No code modified.**
> **Scope verified:** 17 business modules, kernel (`core`), `intelligence` layer, `apps/api` (NestJS), `apps/web` (Next.js), `infrastructure/migrations` (0001–0070), `shared`.
> **Hard counts (verified):** 579 source `.ts` files · 90 test files · 71 migration files · 57 web pages · 162 web BFF routes · 18 Nest business modules wired.

Legend: ✅ COMPLETE · ⚠ PARTIAL · ❌ MISSING. Scores are 0–100 (engineering judgment vs a *world-class commercial ERP* bar — SAP/Oracle/Dynamics/Odoo).

---

## PHASE 1 — SYSTEM OVERVIEW

### Executive summary
AURA OS is an **architecturally strong, breadth-rich, operationally immature** ERP for the UAE construction/ELV vertical. The engineering core is genuinely good: a clean 5-layer monorepo, DDD bounded contexts, an event-sourced spine with transactional outbox, a command pipeline with RBAC/ABAC, and 17 business modules spanning the full deal-chain (CRM→Tender→Contract→Project) and operate-loop (Procurement→Inventory→Finance) plus HR, HSE, Quality, Site, Fleet, Assets, AMC, Doc-Control. This session alone added ~22 genuinely-missing module-depth verticals.

The gap to *commercial* is **not features or architecture — it is production engineering and assurance**: there is no CI/CD, no container/deploy artifact, no observability, no integration/E2E test layer, the multi-tenant isolation is app-level only (RLS is bypassed by the service-role connection), and there is no auth in front of the app by default. These are classded as **production blockers**, not nice-to-haves.

| Dimension | Verdict |
|---|---|
| Architecture style | Modular monolith, Clean/Hexagonal + DDD + light CQRS + event-driven (outbox) |
| Tech stack | TypeScript, NestJS 11 (API), Next.js (web/App Router), PostgreSQL (Supabase), pnpm + Turbo monorepo, Vitest |
| Persistence | Postgres via `pg`; every store has port + in-memory + Postgres adapters; Supabase hosts the live DB |
| AI layer | `core/ai` (Claude provider + embedder) + `intelligence` (insights, pricing, autonomy, vector store, process-mining) |
| **Overall completion** | **~62%** (breadth high, depth medium, ops low) |
| **Technical debt** | **~25%** (mostly missing tests/ops scaffolding + a few known smells, not rot) |
| **Production readiness** | **~35%** |
| **Commercial readiness** | **~30%** |

### Folder structure (verified)
```
apps/{api,web}      core/   intelligence/   modules/<17>   shared/   infrastructure/migrations   docs/
```
Workspace layering (`pnpm-workspace.yaml`) cleanly mirrors the blueprint: `shared` (framework-free) → `core` (kernel) → `modules/*` (bounded contexts) → `intelligence` → `apps/*`. ✅

### Module graph
Spine wired in `apps/api/app.module.ts`: Crm, Tendering, Contracts, Projects, Intelligence, Procurement, Inventory, Finance, Subcontracts, Engineering, DocControl, Site, Hse, Quality, Hr, Fleet, Assets, Templates, Amc (18 Nest modules). Finance imports Procurement + Inventory (for 3-way match / aging). Dependency direction is inward (modules → core → shared); **no circular module deps observed**.

### Database / API / infra overview
- **DB:** 71 sequential migrations `0001`→`0070` (one duplicate index `0059`). Tables prefixed `aura_*`. RLS present (migration `0032` dynamic policies + `0049` hierarchical + `0052` bank-tx).
- **API:** NestJS, all routes under `/api/v1`, ~32 controllers; idempotency-key honored on spine creates.
- **Infra:** **`infrastructure/` contains only `migrations/` + README** — no Docker, no IaC, no deploy config.

---

## PHASE 2 — ARCHITECTURE AUDIT

| Concern | Score | Evidence / Notes |
|---|---|---|
| Clean Architecture | 88 | Strict layer boundaries; `shared` is framework-free; domain has no Nest imports. |
| DDD (bounded contexts) | 85 | One module = one context; domain folders with `make*`/entities/value objects. |
| Aggregates / Entities / VOs | 80 | Domain factories validate invariants (e.g. `applyMovement`, `computeTotals`, EOSB calc). Some anaemic models (status string-machines) but consistent. |
| CQRS | 60 | `CommandBus` real and used on **8 spine services**; ~10 modules use equivalent inline `access + TX_RUNNER` (not the bus). Read side via projections exists but not universally enforced. |
| Event-driven (outbox/inbox) | 82 | `core/events` outbox relay, dead-letter, poison subscriber, cross-module subscriber; events appended in the same tx as writes. |
| Hexagonal / Repository pattern | 90 | Every store = port interface + `InMemory*` + `Postgres*` adapter, DI-swapped on `PG_POOL`. Exemplary. |
| Service layer | 85 | Thin controllers → services → stores; controllers hold no business logic. |
| Dependency injection | 90 | Nest DI throughout; tokens via `Symbol`. |
| Module isolation | 80 | Snapshot-not-join discipline (e.g. invoices carry PO/supplier snapshots). |
| Cross-module coupling | 75 | Finance↔Procurement↔Inventory coupling is intentional and inward; no cycles. |
| Shared kernel | 85 | `shared` holds Id/event contracts/CDM types/embeddings. |
| Scalability (design) | 65 | Stateless API + outbox is scalable in principle; but in-memory fallbacks, no queue, single DB. |
| Maintainability | 82 | Uniform module template makes the codebase highly learnable; 22 verticals added this session followed it 1:1. |
| **Architecture overall** | **80** | **A genuine strength.** Biggest debt: CQRS/command-bus not uniform; AMC module is in-memory-only (no persistence). |

---

## PHASE 3 — KERNEL AUDIT (`core/`)

| Capability | Status | Evidence |
|---|---|---|
| Authentication | ⚠ PARTIAL | `identity/auth.service.ts` verifies bearer/JWT; **off by default** (`AUTH_REQUIRED` gate) — dev runs as `dev-tenant`, actor null. No login UI/session/refresh, no SSO/OIDC/SAML. |
| Authorization RBAC/ABAC | ✅ (engine) / ⚠ (coverage) | `access.service.ts` + `permissions.guard.ts` + `permissions.decorator.ts`; org-path ABAC. Asserts are **conditional on a real actor**, so unenforced in the keyless dev path. |
| Tenancy / Org / Company / BU | ✅ | `tenancy` ALS context + `org.service.ts` (tenant→company→BU→dept org-path). |
| Workflow engine | ✅ | `core/workflow` + seeder (`po.approval` demo). |
| Event store / Outbox / Inbox / Bus | ✅ | `core/events` — append, relay (`SKIP LOCKED`), dead-letter, retry. |
| Notifications | ⚠ | `core/notifications` present; delivery channels (email/SMS/push) not wired. |
| Audit trail | ✅ | `core/audit` + migration `0029`; immutable log + browser page. |
| Numbering | ✅ | `core/numbering` (document reference generation in command handlers). |
| Feature flags / Settings / Config | ⚠ | `core/config/feature-flag.service.ts` exists; admin UI/config management thin. |
| AI providers | ⚠ | `core/ai/claude-provider.ts` + `embedder.ts`; **LOCAL fallback** unless `ANTHROPIC_API_KEY` / `EMBEDDINGS_API_KEY` set — never exercised against a live model here. |
| Document platform (DMS) | ✅ | `core/dms` — versioned documents (deny-all RLS kernel table). |
| Search | ⚠ | host-side aggregator + `/api/v1/search` (⌘K); lexical, not indexed/full-text. |
| OCR | ❌ | none. |
| Storage | ⚠ | DMS stores bytes in DB/buffer; no S3/object-store/CDN seam. |
| Integration platform | ✅ (design) | `core/integration` — webhook subscriptions, dispatcher, retry worker, SDK generator. |
| Reliability | ⚠ | `core/reliability` has `circuit-breaker.ts` + `rate-limiter.ts` (library primitives) — **not applied as global API throttling/gateway**. |
| Background jobs / Scheduling | ⚠ | `core/jobs/background-job.service.ts` (in-proc); no durable scheduler/cron/queue. |
| Monitoring / Logging / Metrics / Health | ⚠ | Nest `Logger` only; `/health` exists. **No structured logs, no metrics, no tracing.** |
| Secrets / Encryption / KMS | ❌ | `.env.local` only; service-role key + DB password in plaintext env; no vault/KMS, no field encryption. |
| API gateway / Rate limiting (global) | ❌ | no gateway, no global throttler middleware. |
| Cache / Queue / Redis | ❌ | none (Postgres `SKIP LOCKED` substitutes for a queue). |
| Backup / Recovery | ❌ | relies on Supabase defaults; no documented strategy/runbook. |
| **Kernel overall** | **62** | Strong domain/eventing kernel; **ops & security kernel (secrets, observability, gateway, queue, real auth) is the weak half.** |

---

## PHASE 4 — BUSINESS MODULE AUDIT

Per-module scorecard (verified by file inspection + this session's builds). Columns: Completion / Arch / DB / API / UI / Tests (0–100).

| Module | Cmp | Arch | DB | API | UI | Tests | Notes & key gaps |
|---|--:|--:|--:|--:|--:|--:|---|
| **CRM** | 70 | 88 | 80 | 80 | 70 | 70 | Accounts, leads, opportunities, **quotations** (this session). Missing: contacts entity, activities/tasks, email integration. |
| **Tendering** | 65 | 85 | 78 | 78 | 60 | 65 | Tenders + BOQ. Missing: bid scoring, competitor analysis. |
| **Contracts** | 68 | 85 | 80 | 80 | 62 | 65 | Contracts + **payment certificates (IPC)** (0070). Missing: clause library, obligations tracking. |
| **Projects** | 70 | 86 | 82 | 82 | 65 | 80 | WBS, CBS, EVM (CPI/SPI), delay/EOT, **variations**. Strong. Missing: Gantt/schedule, resource levelling. |
| **Procurement** | 78 | 88 | 84 | 84 | 72 | 75 | PR→RFQ→PO, **supplier master**. Missing: PO↔supplier-master FK link, framework agreements. |
| **Inventory** | 75 | 88 | 84 | 82 | 70 | 75 | GRN, stock + movements, **transfers**. Missing: valuation (FIFO/WAC), reorder points, barcode. |
| **Finance** | 80 | 86 | 85 | 86 | 72 | 90 | AP+AR invoices, payments (idempotent), journals/double-entry, tax/VAT returns, **petty cash, bank guarantees, AR/AP aging, customer invoices, bank-rec**. Deepest module. Missing: budgeting, fixed-asset GL link, multi-currency revaluation, financial statements (B/S, P&L UI). |
| **HR** | 72 | 85 | 82 | 82 | 68 | 90 | Employees, leave, payroll, EOSB, timesheets, **expense claims, staff advances, document-expiry**. Missing: attendance, org chart, appraisal, WPS payroll file. |
| **HSE** | 60 | 84 | 80 | 78 | 60 | 55 | Incidents, PTW, CAPA, **toolbox talks**. Missing: risk assessments, audits, training matrix. |
| **Quality** | 60 | 84 | 80 | 78 | 58 | 55 | NCR, inspection requests, snags, **ITP**. Missing: calibration, audit schedules. |
| **Site** | 60 | 84 | 80 | 78 | 58 | 55 | Daily reports, delay logs, material consumption, **site instructions**. Missing: labour allocation by trade, progress %. |
| **Subcontracts** | 65 | 84 | 80 | 80 | 60 | 55 | Subcontracts, claims, **variations**. Missing: back-charges, retention release UI link. |
| **Doc-Control** | 58 | 84 | 78 | 78 | 55 | 55 | Transmittals, correspondence, **submittals (Code A/B/C/D)**. Missing: drawing register, distribution matrix. |
| **Engineering** | 55 | 82 | 76 | 76 | 52 | 45 | Drawings, RFIs, submittals. Thinnest — only 1 test file; no MAR/TQ. |
| **Fleet** | 60 | 84 | 80 | 80 | 60 | 60 | Vehicles, fuel, maintenance, **traffic fines (UAE)**. Missing: Salik/tolls, GPS telematics. |
| **Assets** | 60 | 84 | 80 | 80 | 58 | 55 | Register, maintenance, inspections, **depreciation calc**. Missing: disposal/GL posting, QR tagging. |
| **AMC** | 55 | 78 | 30 | 78 | 55 | 60 | Contracts, tickets, work orders, dispatch board, **PPM schedules** (this session). **⚠ In-memory only — NO Postgres store / NO persistence / NO migration.** Biggest single-module risk. |

**Cross-cutting module gaps (apply to most):** ❌ list-level pagination (limit-only, no cursor/offset metadata), ❌ bulk operations, ❌ import/export (CSV/Excel) on most modules, ❌ soft-delete/versioning standardization, ⚠ attachments/comments only where DMS wired, ❌ module-level dashboards, ❌ mobile/offline.

---

## PHASE 5 — DATABASE AUDIT

| Aspect | Status | Notes |
|---|---|---|
| Schema design | ✅ | Consistent `aura_*` naming, tenant_id on every business table, sane numeric/date types. |
| Normalization | ✅ | 3NF generally; JSONB used pragmatically for line-items (customer invoices, quotations, ITP points). |
| Indexes | ✅ | Every new table indexes `(tenant_id)`, `(tenant_id,status)`, FKs. |
| Foreign keys / Constraints | ⚠ | CHECK constraints on enums/amounts good; **FKs inconsistent** (some references, many soft references-by-snapshot — intentional, but cross-tenant integrity rests on app code). |
| Transactions | ✅ | `TX_RUNNER` wraps row + outbox event atomically. |
| Migration quality | ⚠ | Idempotent (`IF NOT EXISTS`); **but `0059` index is duplicated** (projects-variations vs finance-petty-cash) — sequence not strictly monotonic. No down-migrations. |
| Views / Functions / Triggers | ⚠ | Double-entry enforced by a DB trigger (`0050`); otherwise few views/functions. |
| Partitioning / Concurrency / Locking | ⚠ | Outbox uses `SKIP LOCKED`; no partitioning (fine at current scale). |
| Date-drift hazard | ⚠ | Several older mappers use `toISOString().split('T')` on `date` cols (TZ drift, already bit Fleet); newer stores use `::text` cast. **Audit & standardize.** |
| **DB overall** | **74** | Solid and consistent; fix the 0059 dup, add down-migrations, standardize date mapping, decide FK policy. |

---

## PHASE 6 — API AUDIT

| Aspect | Status | Notes |
|---|---|---|
| Consistency / Naming | ✅ | RESTful `/api/v1/<module>/<resource>`, literal-before-`:id` ordering, `ParseUuidOr404Pipe`. |
| Versioning | ✅ | Global `/api/v1` prefix (resolved this era). |
| Validation | ⚠ | Hand-rolled `if` guards + `BadRequestException`; **no `class-validator`/DTO schema/global `ValidationPipe`**. |
| Error handling | ⚠ | `try/catch → 400` common, but inconsistent; a few un-awaited-promise 500s were found & fixed this session. No global exception filter taxonomy. |
| Pagination / Filtering / Sorting | ⚠ | `limit` only; no total-count, cursor, or standardized query DSL. |
| Bulk operations | ❌ | none. |
| AuthN/AuthZ on endpoints | ⚠ | guard exists; not enforced in default config. |
| OpenAPI / Swagger | ❌ | no generated API spec. |
| **API overall** | **66** | Consistent and clean shape; needs schema validation, pagination contract, OpenAPI, global error filter. |

---

## PHASE 7 — UI AUDIT (`apps/web`, 57 pages / 162 BFF routes)

| Aspect | Status | Notes |
|---|---|---|
| Navigation | ✅ | Single source `nav.ts` feeds sidebar + ⌘K palette (no drift). |
| Workspace / Dashboard | ⚠ | "My Work" universal inbox + intelligence insights; **no per-module dashboards / KPI tiles / charts**. |
| Forms / Tables / Dialogs | ⚠ | Consistent inline forms + tables + status cards across 22 new pages; **no form library, no validation UX, no wizard**. |
| Charts / Data-viz | ❌ | effectively none (aging shown as tables, EVM has no chart). |
| Command palette / Search | ✅ | ⌘K global search. |
| Accessibility | ❌ | no ARIA roles/labels audit, keyboard nav not guaranteed, inline-style components. |
| Responsive / Mobile | ⚠ | fixed max-widths; not verified responsive; no mobile/PWA. |
| Dark mode | ✅ | `[data-theme]` CSS-var palette + toggle. |
| Loading / Empty / Error states | ⚠ | "API offline" + empty messages present; no skeletons/toasts/global error boundary. |
| Theming / Components | ⚠ | inline-style objects per component — **no design system / component library** (Tailwind/shadcn/MUI). |
| **UI overall** | **58** | Functional, consistent, fast to extend — but utilitarian; far from a commercial-grade design system with dashboards, charts, and a11y. |

---

## PHASE 8 — AI PLATFORM AUDIT (`core/ai` + `intelligence`)

| Capability | Status | Notes |
|---|---|---|
| Providers | ⚠ | Claude provider + OpenAI-compatible embedder, **config-gated, LOCAL fallback** — unexercised live. |
| Agents / Autonomy | ⚠ | `autonomy.service.ts`, `ai-guardrails.service.ts`, `mcp-server.service.ts` present; not wired to real model calls. |
| Memory / Knowledge graph | ❌ | no persistent agent memory / KG. |
| RAG / Vector store | ⚠ | `vector-store.service.ts` + lexical (feature-hashing) embeddings; not a real ANN index (no pgvector/Pinecone). |
| Prompt system | ⚠ | present in services; not centralized/versioned. |
| Decision engine / Forecasting / Risk / Pricing | ⚠ | `pricing.service.ts`, `process-mining.service.ts`, `insight.service.ts`, `briefing.ts` — heuristic, not ML. |
| **AI overall** | **45** | Well-seamed and guardrailed scaffolding; **not yet a working AI product** (needs a live provider key + pgvector + real prompts/eval). |

---

## PHASE 9 — INFRASTRUCTURE AUDIT

| Aspect | Status |
|---|---|
| Docker / Compose | ❌ MISSING — no Dockerfile, no compose. |
| CI/CD | ❌ MISSING — **no `.github/workflows`, no pipeline of any kind.** |
| Deployment config / IaC | ❌ MISSING. |
| Secrets management | ❌ — plaintext `.env.local`. |
| Observability (tracing) | ❌ — no OpenTelemetry. |
| Logging (structured) | ⚠ — Nest `Logger` text only; correlation-id propagated. |
| Metrics | ❌ — no Prometheus/StatsD. |
| Caching | ❌ — no Redis/in-mem cache layer. |
| Queues | ⚠ — Postgres outbox `SKIP LOCKED` (no Redis/SQS/RabbitMQ). |
| CDN / Object storage | ❌. |
| Backups / DR | ❌ — undocumented; Supabase defaults only. |
| Scaling | ⚠ — stateless API scales; single DB, no read replicas/sharding plan. |
| **Infra overall** | **18** | **The weakest phase and the primary commercial blocker set.** |

---

## PHASE 10 — TESTING AUDIT

| Layer | Status | Evidence |
|---|---|---|
| Unit (domain/store/service) | ✅ | 90 test files; domain state-machines & calcs well covered; Finance 63, HR 43. |
| Integration | ⚠ | One controller-level tenant-scoping guard (`apps/api/tenant-scoping.test.ts`) + a couple Postgres-trigger tests; **no broad integration layer.** |
| E2E (HTTP/browser) | ❌ | none — blocked by vitest+esbuild decorator-metadata (needs SWC) and an `AuditController` circular-import under vitest; documented. |
| Performance / Load | ❌ | none. |
| Security tests | ❌ | none (no SAST/DAST/dependency scan). |
| Coverage measurement | ❌ | no coverage tooling/threshold/gate. |
| **Testing overall** | **45** | Good unit discipline; **no e2e, no coverage gate, no perf/security tests.** |

---

## PHASE 11 — SECURITY AUDIT

| Control | Status | Notes |
|---|---|---|
| AuthN | ⚠ | JWT verify exists; **disabled by default**; no session/refresh/SSO/MFA. |
| AuthZ (RBAC/ABAC) | ⚠ | strong engine, **not enforced in default keyless path**. |
| Tenant isolation | ⚠ | **App-level only.** RLS exists but the app uses the **service-role connection that bypasses RLS** — no `FORCE ROW LEVEL SECURITY`, no least-privilege app role (grep: 0). The §7.1 list-endpoint leak was found & fixed this session; the underlying model gap remains. |
| Secrets / Encryption / KMS | ❌ | plaintext env; no field/at-rest app-level encryption; **keys need rotation**. |
| Input validation / Injection | ⚠ | parameterized SQL throughout (good, no SQLi); but no schema validation / output encoding audit. |
| OWASP Top-10 posture | ⚠ | A01 (broken access) and A02/A05 (crypto/misconfig — secrets, auth-off) are the live risks. |
| Audit logs | ✅ | immutable audit trail. |
| **Security overall** | **40** | **Not releasable as-is.** True DB-enforced tenancy + real auth + secrets management are mandatory before any customer data. |

---

## PHASE 12 — DOCUMENTATION AUDIT

| Doc | Status |
|---|---|
| Architecture / Blueprints | ✅ | rich `docs/` (master blueprint, module map, gap analyses). |
| Session/gap reports | ✅ | this report + 2 session reports. |
| API reference | ❌ | no OpenAPI/Swagger. |
| Database schema doc | ⚠ | migrations are the source of truth; no ERD/data-dictionary. |
| Deployment / Runbooks / DR | ❌. |
| Developer guide / onboarding | ⚠ | README + CLAUDE memory; no formal dev guide. |
| Admin guide / User manual | ❌. |
| **Docs overall** | **48** | Strong architecture docs; **zero operational/user docs.** |

---

## PHASE 13 — PRODUCTION READINESS SCORECARD

| Dimension | Score |
|---|--:|
| Architecture | 80 |
| Business functionality | 62 |
| Security | 40 |
| Performance | 45 |
| Maintainability | 82 |
| Scalability | 60 |
| Reliability | 50 |
| Observability | 18 |
| DevOps / CI-CD | 12 |
| Documentation | 48 |
| Testing | 45 |
| Supportability | 35 |
| **Production readiness** | **~35%** |

---

## PHASE 14 — COMMERCIAL READINESS vs SAP / Oracle / Dynamics / Odoo / IFS / Acumatica

**Strengths:** modern TS/event-sourced architecture; UAE-construction/ELV domain depth (EOSB, VAT returns, bank guarantees, traffic fines, IPC, ITP, submittals) that horizontal ERPs lack out-of-box; fast, consistent extensibility.

**Weaknesses vs incumbents:** no multi-currency/consolidation, no financial statements/reporting engine, no BI/dashboards, no workflow designer UI, no mobile, no marketplace/extensibility SDK surface for customers, no tenant onboarding/billing, no role/permission admin UI, no localization/i18n, no SLAs/observability.

**Verdict:** Competes today only as a **vertical niche product for UAE construction SMEs**, not as a horizontal ERP. Commercial readiness **~30%**.

---

## FINAL MASTER GAP REPORT

### 1. Critical missing features (commercial)
Multi-currency & FX revaluation · financial statements (B/S, P&L, cash-flow) UI · BI dashboards & charts · tenant onboarding/subscription/billing · permission/role admin UI · mobile/PWA · i18n/localization · OpenAPI + customer SDK.

### 2–17 Gap ledger (ranked by severity)

| # | Area | Severity | Status | Headline gap |
|---|---|---|---|---|
| 1 | Security — DB-enforced tenancy | 🔴 Critical | ⚠ | Service-role bypasses RLS; no FORCE RLS / app role. |
| 2 | Security — auth & secrets | 🔴 Critical | ⚠/❌ | Auth off by default; plaintext secrets; rotate keys. |
| 3 | DevOps — CI/CD | 🔴 Critical | ❌ | No pipeline, no automated build/test/deploy gate. |
| 4 | Infra — containerization/deploy | 🔴 Critical | ❌ | No Docker/IaC/deploy artifact. |
| 5 | Observability | 🔴 High | ❌ | No metrics/tracing/structured logs/alerting. |
| 6 | AMC persistence | 🔴 High | ⚠ | Module is in-memory only — data lost on restart. |
| 7 | Testing — e2e/coverage | 🟠 Med | ❌ | No HTTP/browser e2e, no coverage gate (SWC needed). |
| 8 | API — validation/pagination/OpenAPI | 🟠 Med | ⚠ | No DTO validation, no pagination contract, no spec. |
| 9 | DB — 0059 dup, down-migrations, date mapping | 🟠 Med | ⚠ | Sequence not monotonic; no rollbacks; TZ-drift mappers. |
| 10 | UI — design system, dashboards, charts, a11y | 🟠 Med | ⚠/❌ | Utilitarian inline styles; no charts; no a11y. |
| 11 | CQRS/command-bus uniformity | 🟡 Low | 🟡 | Bus on 8/18 services; rest inline-equivalent. |
| 12 | AI — live provider, pgvector, eval | 🟡 Low | ⚠ | Scaffolding only; no live model/ANN index. |
| 13 | Backups / DR runbooks | 🟠 Med | ❌ | Undocumented. |
| 14 | Notifications/storage/OCR/queue/cache | 🟡 Low | ⚠/❌ | Seams exist; not wired (email, S3, Redis, OCR). |
| 15 | Docs — API/user/admin/runbooks | 🟡 Low | ❌ | Architecture docs only. |
| 16 | Module cross-cutting (bulk/import/export/soft-delete) | 🟡 Low | ❌ | Not standardized across modules. |
| 17 | Dead/duplicate code | 🟢 Info | — | Low; main risk is the duplicate `0059` migration + stale `dist/` rebuild trap. |

### 18. Production blockers (must fix before any customer data)
#1 DB-enforced tenancy · #2 auth + secrets · #3 CI/CD · #4 deploy artifact · #5 observability · #6 AMC persistence · #13 backups/DR.

### 19. Estimated remaining work to commercial GA
- **Production-hardening (blockers 1–6, 13):** ~8–12 engineer-weeks.
- **Assurance (testing/e2e/coverage/security scans):** ~4–6 weeks.
- **API/UI maturity (validation, OpenAPI, design system, dashboards, charts, a11y):** ~10–16 weeks.
- **Commercial features (multi-currency, statements, billing, admin UI, mobile, i18n):** ~6–9 months.
- **Total to credible commercial GA:** **~9–12 months** with a small team; **~3 months** to a *pilotable internal* release if blockers 1–6 are closed.

### 20. Final completion percentage
**Engineering completion ≈ 62%** · **Production readiness ≈ 35%** · **Commercial readiness ≈ 30%.**

---

## PRIORITIZED ROADMAP (highest → lowest impact)

| Rank | Initiative | Phase ref | Effort | Blocker? |
|---|---|---|---|---|
| 1 | **DB-enforced multi-tenancy** — least-privilege app role + `FORCE RLS` + per-request tenant GUC; verify cross-tenant denial live | §11, §7.2 | M–L | ✅ |
| 2 | **Auth on by default + secrets management** — enforce JWT, session/refresh, move secrets to a vault, rotate keys | §11 | M | ✅ |
| 3 | **CI/CD pipeline** — lint + typecheck + test + build + migration-check on every PR; block merge on red | §9 | S–M | ✅ |
| 4 | **Containerize + deploy** — Dockerfile(s), compose, environment config, one-command deploy | §9 | M | ✅ |
| 5 | **Observability** — structured JSON logs, OpenTelemetry traces, Prometheus metrics, health/readiness, alerting | §9 | M | ✅ |
| 6 | **Persist AMC** — add Postgres stores + migration (mirror the other 16 modules) | §4 | S | ✅ |
| 7 | **e2e + coverage gate** — add SWC transform, supertest spine flows, Playwright smoke, coverage threshold in CI | §10 | M | — |
| 8 | **API hardening** — global `ValidationPipe` + DTOs, pagination/sort/filter contract, global exception filter, OpenAPI | §6 | M | — |
| 9 | **DB hygiene** — renumber `0059`, add down-migrations, standardize `date::text` mapping, FK policy decision | §5 | S | — |
| 10 | **Backups & DR runbooks** — automated backups, restore drill, documented RTO/RPO | §9/§12 | S | ✅ |
| 11 | **UI maturity** — adopt a design system, build module dashboards + charts, a11y pass, responsive/mobile | §7 | L | — |
| 12 | **Command-bus uniformity** — roll the pipeline to the ~10 non-spine modules (or formally ratify the inline path) | §2 | M | — |
| 13 | **AI productionization** — live provider key, pgvector ANN index, centralized/versioned prompts + eval harness | §8 | L | — |
| 14 | **Commercial features** — multi-currency, financial statements, billing/onboarding, role-admin UI, i18n, mobile | §14 | XL | — |
| 15 | **Docs** — OpenAPI reference, data dictionary/ERD, admin + user manuals, runbooks | §12 | M | — |

*End of audit. No source files were modified; this report is the sole artifact produced.*
