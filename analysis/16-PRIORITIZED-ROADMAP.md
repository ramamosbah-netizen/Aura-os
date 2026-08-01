# Prioritized Roadmap

Impact = business/quality value (1–5). Effort = XS(<½d) · S(1–2d) · M(1–2wk) · L(3–6wk) · XL(quarter+). **Priority** = Impact ÷ Effort (quick, high-value first).

---

## TOP 100 IMPROVEMENTS (ranked by Impact × Effort)

| # | Improvement | Area | Impact | Effort |
|---|---|---|---|---|
| 1 | Provision non-bypass DB role on Supabase → activate RLS in prod | Security/DB | 5 | M |
| 2 | Set `AUTH_REQUIRED=true` + verifier in staging/prod; deploy-gate on it | Security | 5 | S |
| 3 | Tighten CORS to per-env allowlist; add helmet/security headers | Security | 4 | S |
| 4 | Add rate limiting (`@nestjs/throttler`) + per-tenant AI quotas | Security/Perf | 4 | S |
| 5 | Commit/PR the 59 uncommitted files in reviewable slices | Quality | 4 | S |
| 6 | Remove duplicated `auth.enabled` branch in permissions.guard | Quality | 2 | XS |
| 7 | Review + gitignore root scratch `.txt` files | Security | 3 | XS |
| 8 | Make dependency audit blocking (high/critical) + Dependabot | Security | 3 | S |
| 9 | Add `loading.tsx` + `error.tsx` per workspace segment | UX/Frontend | 4 | M |
| 10 | Audit permission derivation vs real routes once auth on | Security | 5 | M |
| 11 | Stand up staging environment + CD from GHCR images | DevOps | 5 | M |
| 12 | Unit-test the intelligence layer (guardrails, router, billing) | Testing | 4 | M |
| 13 | Resolve intelligence read-only law (re-charter or restore) | Architecture | 4 | M |
| 14 | Build Engineering workspace UI (backend exists) | ERP/UX | 5 | L |
| 15 | Build PM cockpit (Gantt/EVM/budget-vs-actual) | ERP/UX | 5 | L |
| 16 | Build Commissioning (T&C) module — ELV deliverable | ELV/ERP | 5 | L |
| 17 | Build Handover/O&M/warranty package workflow | ELV/ERP | 5 | L |
| 18 | Build Field-Service loop + technician PWA | ELV/ERP | 5 | XL |
| 19 | Materialize hot roll-ups via projections (pipeline/portfolio/ops) | Perf | 4 | M |
| 20 | Operationalize observability (Prometheus/Grafana/alert routing) | DevOps | 4 | M |
| 21 | Doc Control register UI (submittals/transmittals/revisions) | ERP/UX | 4 | M |
| 22 | Automate top business journeys as e2e regression gates | Testing | 4 | M |
| 23 | Introduce client data layer (React Query) for optimistic mutations | Frontend | 4 | M |
| 24 | Decompose mega-components (>800 LOC) | Quality/Perf | 3 | L |
| 25 | Add caching tier (Redis/LRU) for reference data + read models | Perf | 4 | M |
| 26 | Unified Analytics/BI OS (executive dashboard + report builder) | ERP/UX | 4 | L |
| 27 | Customer portal (quotes/approvals/tickets/invoices) | ERP | 4 | L |
| 28 | Intra-module FKs for financial parent/child tables | DB | 3 | M |
| 29 | Fix tender-won path bypassing commercial baseline | Workflow | 4 | S |
| 30 | Unify the two quotation pricing engines | ERP | 4 | M |
| 31 | Site daily reports + labor/plant returns + site diary UI | ERP/UX | 4 | M |
| 32 | Quality: IR/NCR/snag-list workflow UI | ELV/ERP | 4 | M |
| 33 | HSE: permit-to-work + observation cards + incident investigation | ELV/ERP | 4 | M |
| 34 | AMC field execution: PPM→WO→dispatch→signoff→invoice | ELV | 5 | L |
| 35 | Frontend consumes `@aura/sdk` for type-safe API | Frontend | 3 | M |
| 36 | Replace blanket `force-dynamic` with per-route caching | Perf | 3 | M |
| 37 | SIRA/DCD compliance register + approval workflow | ELV | 4 | M |
| 38 | Installed-base/device lifecycle (install→warranty→AMC→replace) | ELV | 4 | L |
| 39 | Migrate error taxonomy to typed domain errors | Backend | 3 | M |
| 40 | Partition event/audit tables; retention policy | DB/Perf | 3 | M |
| 41 | Burn down `any` in mappers; promote lint rule to error | Quality | 2 | M |
| 42 | Assert coverage threshold in CI (not just collect) | Testing | 3 | S |
| 43 | Postgres-adapter tests (Testcontainers) for finance stores | Testing | 3 | M |
| 44 | Accessibility + Lighthouse pass; adopt headless primitives | Frontend | 3 | M |
| 45 | Won→auto-provision contract+project+budget guided workflow | Workflow | 4 | M |
| 46 | Payment-cert approved→auto-invoice→GL post automation | Workflow | 4 | S |
| 47 | Unified cross-module "my approvals" action inbox | UX | 4 | M |
| 48 | Warehouse/bin management + serial/batch tracking (ELV serials) | ERP | 4 | M |
| 49 | 3-way match UI + supplier comparison in procurement | ERP | 3 | M |
| 50 | Supplier/subcontractor portal | ERP | 3 | L |
| 51 | Payroll run UI + leave management + org chart (HR) | ERP | 3 | L |
| 52 | Financial statements pack (BS/CF) + audit reporting | Finance | 4 | M |
| 53 | Inter-company/consolidation in finance | Finance | 3 | L |
| 54 | Snagging/defects workflow | ELV | 4 | M |
| 55 | BOQ line→material take-off→PR bridge | Workflow | 4 | M |
| 56 | Estimator's tender workspace UI | ERP/UX | 4 | M |
| 57 | Document outbox-relay singleton + add leader election | Architecture | 3 | M |
| 58 | Enforce schema isolation beyond naming (fitness check) | Architecture | 3 | M |
| 59 | Global empty-state primitive + consistent adoption | UX | 3 | S |
| 60 | Master data management (items/materials/rate library) | ERP | 4 | L |
| 61 | SSO/SCIM operationalization (Entra) | Security | 3 | M |
| 62 | Web load tests + perf budget (Lighthouse CI) | Perf | 3 | S |
| 63 | IaC for API/web hosting tier | DevOps | 3 | M |
| 64 | Production migration + rollback runbook (rehearsed live) | DevOps | 4 | S |
| 65 | OTLP collector + tracing backend wired | DevOps | 3 | M |
| 66 | `docs/INDEX.md` + archive superseded reports + normalize names | Docs | 2 | S |
| 67 | ADRs for auth/RLS staging + intelligence re-charter | Docs | 3 | S |
| 68 | Cross-module Radar signals (AR overdue/stock/stalled) | Automation | 3 | M |
| 69 | Asset QR/barcode + condition monitoring UI | ELV | 3 | M |
| 70 | Fleet maintenance scheduling + fuel/telematics UI | ERP | 2 | M |
| 71 | Cable schedule / port mapping for structured cabling | ELV | 3 | M |
| 72 | Device schedules/templates per ELV system type | ELV | 4 | M |
| 73 | KNX/BMS integration + commissioning data capture points | ELV | 3 | L |
| 74 | Progress-photo capture + geotag for site | ELV/UX | 3 | M |
| 75 | Offline-first support for field PWA | ELV | 4 | L |
| 76 | Contract authoring/templating UI + variation→value automation | ERP | 3 | M |
| 77 | Progress-claim workflow for subcontracts | ERP | 3 | M |
| 78 | Cycle counting + stock adjustment workflow | ERP | 2 | M |
| 79 | Spend analytics dashboard (procurement) | ERP | 3 | M |
| 80 | Earned-value + cashflow-actual vs forecast dashboards | ERP | 4 | M |
| 81 | Notification/action-center depth + digest emails | UX | 3 | M |
| 82 | In-app email/comms (MS Graph) full wiring | CRM | 3 | M |
| 83 | Marketing/campaign layer for CRM | CRM | 2 | L |
| 84 | Table virtualization for large datasets | Perf | 3 | M |
| 85 | Feature-flag-gated rollout tooling for new modules | DevOps | 2 | S |
| 86 | Data export/import (CSV/Excel) standardization | ERP | 3 | S |
| 87 | Audit-log viewer UI + retention controls | Security/UX | 3 | M |
| 88 | Blue/green deploy strategy | DevOps | 3 | M |
| 89 | Per-tenant usage metering dashboard (SaaS billing) | Intelligence | 3 | M |
| 90 | Governance for AI agent marketplace (approval/sandbox) | Intelligence | 4 | L |
| 91 | Vector store / RAG quality evaluation harness | Intelligence | 3 | M |
| 92 | Digital-twin scope clarification (build or cut) | Intelligence | 2 | M |
| 93 | Localization/i18n framework (Arabic RTL) | UX | 4 | L |
| 94 | Mobile-responsive pass on cockpit layouts | UX | 3 | M |
| 95 | Keyboard-shortcut/command coverage expansion | UX | 2 | S |
| 96 | Bulk-action patterns on tables (multi-select ops) | UX | 3 | M |
| 97 | Saved-view sharing + role defaults | UX | 2 | S |
| 98 | Webhook/connector framework live integrations | Integration | 3 | L |
| 99 | Consolidate duplicate in-memory/pg store boilerplate via generics | Quality | 2 | M |
| 100 | Automated changelog + release notes from commits/ADRs | DevOps | 1 | S |

---

## TOP 20 QUICK WINS (high impact, XS–S effort)

| # | Quick win | Effort |
|---|---|---|
| 1 | `AUTH_REQUIRED=true` + verifier in staging | S |
| 2 | CORS allowlist + helmet headers | S |
| 3 | Rate limiting via `@nestjs/throttler` | S |
| 4 | Remove duplicated `auth.enabled` guard branch | XS |
| 5 | Review + gitignore root `.txt` scratch files | XS |
| 6 | Make dependency audit blocking + Dependabot | S |
| 7 | Commit/PR the 59 uncommitted files | S |
| 8 | Fix tender-won baseline bypass | S |
| 9 | Payment-cert→auto-invoice→GL automation | S |
| 10 | Assert CI coverage threshold | S |
| 11 | Global empty-state primitive | S |
| 12 | `docs/INDEX.md` + archive/rename reports | S |
| 13 | ADRs for auth/RLS staging + AI re-charter | S |
| 14 | Rehearse prod migration+rollback runbook | S |
| 15 | Web perf budget (Lighthouse CI) in web-smoke | S |
| 16 | Feature-flag rollout tooling | S |
| 17 | Standardize CSV/Excel export | S |
| 18 | Saved-view sharing + role defaults | S |
| 19 | Expand command-palette coverage | S |
| 20 | Auto changelog from commits/ADRs | S |

---

## TOP 20 CRITICAL ISSUES (must-fix before enterprise production)

| # | Critical issue | Category | Why it blocks |
|---|---|---|---|
| 1 | RLS inert on prod runtime | Security | Tenants not isolated where data lives |
| 2 | Auth/permissions off by default | Security | No access control unless explicitly enabled |
| 3 | Permission derivation unverified under enforcement | Security | Silent over/under-permissioning |
| 4 | CORS wide open, no helmet, no rate limit | Security | Web-facing attack surface |
| 5 | No production environment / CD | DevOps | Nothing actually deployed/operable |
| 6 | Observability not operationalized | DevOps | Blind in production |
| 7 | Intelligence layer untested (4 tests / 40+ services) | Testing | Critical-path code unproven |
| 8 | Intelligence violates read-only law (owns writes) | Architecture | Erodes the isolation guarantees |
| 9 | 59 unreviewed uncommitted files | Quality | Untested code risk / loss |
| 10 | Frontend depth cliff (delivery verticals stubbed) | ERP | Not a usable ERP for engineers/field |
| 11 | No commissioning module | ELV | Core ELV deliverable missing |
| 12 | No handover/warranty workflow | ELV | Contractual milestone missing |
| 13 | No field service loop / mobile | ELV | AMC/service revenue unserved |
| 14 | Sparse FKs → integrity app-only | DB | DB won't stop bad writes |
| 15 | Roll-up N+1 risk at scale | Perf | Degrades as data grows |
| 16 | No caching tier | Perf | Latency + load under scale |
| 17 | Error taxonomy string-matched | Backend | Brittle contract |
| 18 | Event/audit tables unpartitioned | DB/Perf | Growth ceiling |
| 19 | Two quotation pricing engines | ERP | Commercial correctness risk |
| 20 | No frontend test suite (1 smoke test) | Testing | UI regressions ship unseen |

---

## 6–12 MONTH ROADMAP

### Phase 1 (Months 1–2) — "Turn on the safety systems" · theme: **Trustworthy**
- Activate RLS in prod (non-bypass role) · turn on auth + verifier · CORS/helmet/rate-limit · make audit blocking.
- Stand up staging + CD from GHCR · operationalize Prometheus/Grafana/alerts · rehearse prod migration/rollback.
- Commit the WIP · unit-test + re-charter the intelligence layer · assert coverage threshold.
- **Exit:** a real, monitored, access-controlled, tenant-isolated staging environment. Enterprise readiness → ~72%.

### Phase 2 (Months 3–5) — "Close the delivery cliff" · theme: **A real construction ERP**
- Engineering workspace · PM cockpit (Gantt/EVM) · Doc Control register · Site daily reports · Quality IR/NCR/snag.
- Materialize roll-up projections · caching tier · loading/error states · client data layer.
- Automate top business journeys as e2e · decompose mega-components.
- **Exit:** every core module has a working cockpit; delivery personas are productive. ERP completeness → ~80%.

### Phase 3 (Months 6–9) — "Own the ELV lifecycle" · theme: **Category-defining**
- Commissioning (T&C) module · Handover/O&M/warranty package · Field-service loop + technician PWA · AMC execution.
- Installed-base/device lifecycle · SIRA compliance · snagging.
- Customer portal · unified Analytics/BI OS.
- **Exit:** the deliver→commission→handover→maintain chain is closed. ELV fit → best-in-class.

### Phase 4 (Months 10–12) — "Scale & differentiate" · theme: **Enterprise-grade**
- Warehouse/serial tracking · MDM · financial statements/consolidation · payroll/leave.
- i18n/Arabic RTL · SSO/SCIM live · AI agent governance + marketplace · connector integrations.
- Table partitioning · leader election · load-tested at scale.
- **Exit:** enterprise readiness → ~90%; ERP completeness → ~88%; ready for multi-tenant GA to ELV/construction contractors.
