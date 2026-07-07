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
against the 2026-07-01 due-diligence audit and re-verified 2026-07-03.

### Platform layers

| Area | Completion | Architecture | Enterprise Ready | Score |
|---|--:|---|---|--:|
| Kernel (events, workflow, DMS, identity, numbering, audit…) | 88% | Excellent | Yes | **9.2/10** |
| Form Engine (metadata forms, rules, formulas, plugins, AI fill/review) | 85% | Excellent | Yes | **9.0/10** |
| Command Center (attention scoring, business-health, AI briefing homepage) | 80% | Excellent | Yes | **8.6/10** |
| AI Platform (provider seam, RAG, insights, autonomy, MCP) | 55% | Good | Early | **6.5/10** |
| Integration Platform (webhooks, connectors, SDK generator) | 45% | Good | Not yet | **5.5/10** |
| Reporting / BI | 40% | Fair | Not yet | **5.0/10** |
| Security (designed ✔, enforcement gated) | 45% | Good design | **No — P0s open** | **4.5/10** |
| Deployment / Operations | 25% | Early | No | **3.5/10** |
| Administration Center (workspace access shipped; rest in design) | 25% | In design | Partially | **3.2/10** |
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
