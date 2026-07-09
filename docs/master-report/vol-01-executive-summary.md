# Volume 1 — Executive Summary

[← Master index](README.md)

---

## 1. Vision — why AURA was built

AURA OS exists because mid-market contracting, facility-management, and asset-heavy companies
in the GCC run their businesses across a patchwork that no incumbent actually closes:

- **The ERP giants** (SAP, Oracle) price and implement for enterprises with dedicated IT
  departments; a 200-person Dubai contractor cannot absorb an 18-month implementation.
- **The CRM platforms** (Salesforce, Dynamics) stop at the won deal; the deal *is the easy part*
  — execution (tender → contract → project → procurement → site → certification → cash) is where
  these companies live and bleed margin.
- **The construction point tools** (Procore, Primavera, Unifier) manage schedules and documents
  but do not run payroll, VAT returns, WPS files, or a general ledger.
- **The open-source ERPs** (Odoo, ERPNext) are broad but shallow exactly where this market is
  deep: retention, IPCs, back-charges, EOSB, Salik, Mulkiya renewals, subcontractor claims.

AURA's founding thesis: **one platform that runs the entire deal chain of a contracting business
— Lead → Opportunity → Quotation → Tender → Contract → Project → Procurement → Site → Certification
→ Cash — natively, event-driven, with AI as a first-class layer rather than a bolt-on.**

The vision in one sentence:

> *The operating system for project-driven businesses: every record connected by events,
> every screen generated from metadata, every decision assisted by AI.*

## 2. Mission

Deliver an enterprise-grade, multi-tenant business platform that:

1. **Runs the full lifecycle** of project-driven work with no integration seams between sales,
   delivery, and finance.
2. **Automates the connective tissue** — the platform reacts to events (a won opportunity creates
   a tender; an accepted GRN moves stock, re-averages WAC, and posts COGS to the GL) instead of
   asking users to re-key data between modules.
3. **Localizes deeply for the GCC** — UAE VAT, WPS SIF payroll files, EOSB gratuity bands, Salik,
   Mulkiya, labor-camp compliance — while staying architecturally region-neutral.
4. **Keeps the cost of change near zero** — metadata-driven forms, a plugin architecture, and a
   uniform module template mean new capability is configuration plus thin code, not forks.
5. **Earns enterprise trust** — immutable audit, tenant isolation, double-entry enforced at the
   database, deterministic numbering, document management with retention.

## 3. Core Principles

These are architectural commitments, each traceable to code:

| Principle | What it means in AURA | Where it lives today | Status |
|---|---|---|---|
| **AI First** | One provider seam (`AiProvider.complete/embed`) every layer calls; no vendor SDK outside the kernel. Claude provider + deterministic local fallback, guardrails, vector store, MCP server, autonomy proposals. | `shared/src/ai/ai-provider.ts`, `core/src/ai/*`, `intelligence/*` | ✅ seam + platform; feature depth growing |
| **Event Driven** | Every business mutation emits a catalogued domain event, committed in the same transaction (outbox), relayed to subscribers; 12+ cross-module reactors automate the deal chain. | `shared/src/events/catalog.ts` (71 events), `core/src/events/*`, `apps/api/src/events/cross-module-subscriber.ts` | ✅ |
| **Metadata Driven** | Forms are JSON schemas (fields, layout, rules, formulas, permissions) rendered by an engine; entity/form/workflow registries in the kernel builder. | `shared/src/forms/*`, `apps/web/components/form-engine/*`, `core/src/builder/*` | ✅ forms; entity/views partial |
| **Workflow Driven** | Definition-based workflow engine + saga orchestrator with persisted state; approval matrix service for threshold routing. | `core/src/workflow/*`, `core/src/builder/approval-matrix.service.ts`, `shared/src/workflow/*` | ✅ engine; catalog growing |
| **Document Centric** | Kernel DMS: document store + storage ports (local/Supabase), templates, print views for every commercial document (quotes, POs, IPCs, invoices, payslips). | `core/src/dms/*`, `apps/api/src/templates`, 9 `/print` pages | ✅ |
| **API First** | 551+ REST handlers under `/api/v1`, idempotency keys on spine creates, UUID guards, webhooks out, SDK generator, OpenAPI spec + Swagger UI at `/api/docs`. | `apps/api/src/*` | ✅ |
| **Offline Ready** | Aspiration: field crews with intermittent connectivity. Today: web-only; no PWA/service-worker/drafts sync. | — | **[Gap]** — designed in Volume 24 |
| **Multi Tenant** | `tenant_id` on every business table; tenant context propagation; RLS policies written for 87 tables (migrations 0032/0049); enforcement deliberately deferred until app-complete. | `core/src/tenancy/tenant-context.ts`, `infrastructure/migrations/0032,0049` | ◐ app-level now; DB-enforced is the final task |
| **Enterprise Security** | JWT auth + RBAC/ABAC engine + immutable audit exist; enforcement is env-gated (`AUTH_REQUIRED`) and off in dev. | `core/src/identity/*`, `core/src/audit/*` | ◐ built, not yet enforced by default |

## 4. Product Positioning

### 4.1 Positioning statement

**For** GCC project- and asset-driven companies (50–2,000 staff) **who** need sales, delivery,
site, and finance in one system, **AURA OS** is an AI-first business operating system **that**
automates the entire deal-to-cash chain with construction-grade depth, **unlike** horizontal
ERPs that require heavy customization or point tools that cover one slice, **AURA** ships the
chain connected out of the box and lets teams extend it with metadata, not code.

### 4.2 Comparison with incumbents

| Dimension | SAP S/4HANA | Oracle Fusion | MS Dynamics 365 | Salesforce | Odoo | ERPNext | **AURA OS today** |
|---|---|---|---|---|---|---|---|
| Deal chain (CRM→tender→contract→project) connected natively | ◐ via PS + custom | ◐ | ◐ needs Project Ops + custom | ❌ stops at deal | ◐ modules exist, thin links | ◐ | ✅ **automatic via events** |
| Construction depth (BOQ, IPC, retention, back-charges, subcontracts) | ◐ add-ons | ◐ Unifier separate | ❌ partner ISVs | ❌ | ❌ | ◐ basic | ✅ native |
| GCC localization (VAT, WPS, EOSB, Salik, Mulkiya) | ◐ localization packs | ◐ | ◐ | ❌ | ◐ community | ◐ | ✅ native |
| Finance depth (GL, period close, rev-rec, budgets, multi-currency) | ✅✅ | ✅✅ | ✅ | ❌ | ✅ | ✅ | ✅ (IFRS-15, PDC, BG, VAT returns) |
| Metadata forms / low-code | ✅ Fiori Elements | ✅ | ✅ Power Platform | ✅ | ✅ Studio | ✅ | ✅ **form engine live**; designer [Planned] |
| AI as platform layer | ◐ Joule (new) | ◐ | ◐ Copilot | ✅ Einstein | ❌ | ❌ | ✅ seam + guardrails + autonomy + MCP |
| Event-driven core with outbox | internal | internal | ◐ | ◐ | ❌ | ❌ | ✅ first-class, inspectable (`/events` page) |
| Implementation weight | 12–24 mo | 12–24 mo | 6–18 mo | 3–12 mo | 2–6 mo | 2–6 mo | **days** (opinionated defaults) |
| TCO for 200 users | $$$$ | $$$$ | $$$ | $$$ | $$ | $ | $$ target |
| Maturity / ecosystem / references | ✅✅✅ | ✅✅✅ | ✅✅✅ | ✅✅✅ | ✅✅ | ✅ | 🔴 pre-GA — the honest gap |

The honest read: AURA wins on **connectedness, construction depth, GCC fit, AI architecture,
and cost of change**; it loses today on **maturity, ecosystem, references, mobile, and
operational hardening** (Volumes 19, 21, 23). The roadmap (Volume 20) is sequenced to close
exactly those.

### 4.3 What "comparable to Dynamics/Salesforce/ServiceNow" concretely requires

Tracked as the Enterprise Bar in Volume 23:

1. Metadata platform covering entities/views/menus, not just forms — ◐ in progress
2. No-code designer for admins — [Planned], Volume 5 §10
3. AppSource-style extension packaging — [Planned], Volume 20 V3
4. SLA-grade operations — ◐ (SSO/MFA ✅ + observability ✅ closed 2026-07-08; DR/backups still [Gap — P0]), Volumes 7/19
5. Public API + SDK + webhooks — ◐ (REST + webhooks + SDK generator + OpenAPI at `/api/docs`; contract tests missing)

## 5. Target Industries

| Industry | Fit today | What carries it | What is missing |
|---|---|---|---|
| **Construction & Contracting** | ✅ primary | Full deal chain, BOQ/estimates, IPCs, retention, subcontracts, site diaries, HSE, doc control, EVM | Gantt/baseline, mobile site app |
| **Facility Management** | ✅ strong | AMC contracts, PPM schedules, work orders → AR billing, SLA escalation, assets, fleet | Customer portal, IoT/BMS ingestion |
| **Manufacturing** | ◐ adjacent | Inventory (WAC, transfers, reorder→PR), procurement, finance, HR | BOM/routing, MRP, shop-floor — Volume 20 V3 |
| **Real Estate Development** | ◐ adjacent | Projects, contracts, finance (PDC handling is a strong fit), doc control | Unit inventory, leasing, escrow accounting |
| **Healthcare (facilities arm)** | ◐ niche | Assets + calibration (quality module has calibration records), AMC, HSE | Clinical anything — explicitly out of scope; facilities-only positioning |
| **Government / Semi-gov** | ◐ | Tendering, approvals matrix, audit immutability, doc control | SSO (SAML/OIDC), Arabic UI, on-prem hardening |

Sequencing: win Construction + FM (deepest fit, weakest incumbents locally), expand to real
estate and manufacturing on the same kernel.

## 6. Where the platform stands (one paragraph)

Seventeen business modules on a uniform hexagonal template around a kernel that already does the
hard enterprise things — transactional outbox events, workflow + saga orchestration, DMS,
numbering, audit, RBAC/ABAC, multi-currency, projections — with 551 API handlers, 93 pages, 126
migrations, and 132 test files, all green in CI. The differentiated recent leap is the
**metadata form platform** (Volume 5): forms are now JSON schemas with live business rules,
calculated fields, plugins, and AI auto-fill/review. The gap between AURA and "enterprise-ready"
is no longer breadth of features — it is **security enforcement, operations, reporting/BI, and
the admin center**, which are precisely scoped in Volume 23 and sequenced in Volume 20.

---

*Next: [Volume 2 — Product Architecture](vol-02-architecture.md)*
