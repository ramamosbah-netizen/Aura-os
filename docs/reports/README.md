# AURA OS — Report Index

92 reports, newest first within each section. **Index last reviewed: 2026-08-14.**

> **The current authority on platform state is [`docs/aura-audit/`](../aura-audit/README.md)** (24 documents, revision 2.6, 2026-08-13) — not this folder. It supersedes the readiness figure below and carries its own gap register (G-01…G-20). Reports here remain useful as dated records and for the journey scores, which the audit does not measure.

## Read these first

| Report | What it is |
|---|---|
| [2026-08-05 Consolidated Gap Register](2026-08-05-consolidated-gap-register.md) | **Every open gap in one place** — 50 rows (G-01…G-50) across security, integrity, delivery spine, ELV vertical, field/mobile, UX, scale, modules, journeys and competitive position. Stable IDs, per-row provenance. **Start here to see what's left.** |
| [2026-08-05 Platform State Verification](2026-08-05-platform-state-verification.md) | **Latest live verification** — what the running app actually does, plus the accuracy review that produced this index |
| [**AURA OS Master Audit** (`docs/aura-audit/`)](../aura-audit/README.md) | **Start here.** Evidence-driven reverse-engineering + production-readiness audit, revision **2.6** (2026-08-13). Readiness **~68/100**, **2 P0 blockers** (both operational), 6 P1. Its [gap register](../aura-audit/18-MASTER-GAP-REGISTER.md) is the live one |
| [2026-08-03 Enterprise Readiness Audit](2026-08-03-enterprise-readiness-audit.md) | 🗄️ The earlier readiness tracker (54/100, 2026-08-03). **Different rubric** from the audit above — the two numbers are not a trend, and this one has not been re-measured |
| [2026-08-03 Junior-User Walkthrough](2026-08-03-junior-user-walkthrough.md) | Screen-by-screen UX companion to the readiness audit |
| [2026-08-02 Module Depth Gap Audit](2026-08-02-module-depth-gap-audit.md) | Per-module functional depth, all modules |
| [2026-07-27 Experience Architecture (L5)](2026-07-27-aura-os-experience-architecture.md) | The navigation/IA design the app is being built toward |
| [`/analysis`](../../analysis/README.md) | 17-part CTO-level platform audit (2026-08-01), separate from this folder — re-confirmed 2026-08-05 |
| [Docs index](../README.md) | Entry point for the whole documentation set (182 files: master report, ADRs, runbooks, roadmap, blueprints) |

## Status legend

**🟢 CURRENT** — reflects the tree; safe to act on. **🟡 PARTIAL** — findings still valid, statuses may have moved. **🗄️ HISTORICAL** — a snapshot of its date; useful as record. **⛔ SUPERSEDED** — carries a claim that is wrong for the current tree; banner at the top of the file explains.

---

## Numbers you may quote

Per the project's report-integrity rule, a score is quotable only if it was measured in a live run. As of 2026-08-13:

| Measure | Value | Measured | Source |
|---|---|---|---|
| Enterprise-production readiness | **~68 / 100** | 2026-08-13 (rev 2.6) | [master audit](../aura-audit/20-PRODUCTION-READINESS.md) — weighted components total **76.7**, held at ~68 by an open production-gate penalty (2 P0s) |
| ~~Enterprise-production readiness~~ | ~~54 / 100~~ | 2026-08-03 | [earlier readiness audit](2026-08-03-enterprise-readiness-audit.md) — **superseded**, and a *different rubric*: do not read 54 → 68 as an improvement |
| Browser E2E suite | **42 passed / 0 failed**, authenticated | 2026-08-13 | `apps/web/e2e` — executed twice on a fresh auth-enabled API ([audit `14`](../aura-audit/14-TESTING-QA-AUDIT.md)) |
| Journey Score · Direct Sale | **87 / 100**, E2E **PASS** | 2026-07-20 on `f829007` | [close-out re-run](2026-07-20-journey-direct-sale-closeout.md) (history: 82 → 85 → 87) |
| Journey Score · Tender | **65 / 100** | 2026-07-17 | [CRM operating review](2026-07-17-crm-operating-review.md) |

No 100/100 has ever been measured for any journey. Production-build performance has never been measured — dev-server timings are not a substitute.

The audit's **dimension** scores (architecture, security, ERP functionality and so on) are design-review re-estimates from merged source, **not** live benchmarks — with one exception, Testing, which is backed by the executed browser suite. The audit labels them as such; quote them the same way.

---

## Platform-wide audits & status

| Date | Report | Status |
|---|---|:--:|
| 2026-08-05 | [Consolidated Gap Register](2026-08-05-consolidated-gap-register.md) | 🟢 *the umbrella list — every open gap, stable IDs* |
| 2026-08-05 | [Platform State Verification](2026-08-05-platform-state-verification.md) | 🟢 |
| 2026-08-03 | [Enterprise Readiness Audit](2026-08-03-enterprise-readiness-audit.md) | 🟢 |
| 2026-08-02 | [Module Depth Gap Audit](2026-08-02-module-depth-gap-audit.md) | 🟢 |
| 2026-07-19 | [Master Platform Status](2026-07-19-master-platform-status.md) | ⛔ *"PRODUCTION READY" verdict is wrong for the current tree. Keep for the web-page / API-handler / domain-event inventories.* |
| 2026-07-19 | [Technical Architecture Assessment](2026-07-19-technical-architecture-assessment.md) | ⛔ *"Production Candidate" is stale. Its §0 provenance section is the model example of the report-integrity rule.* |
| 2026-07-08 | [Comprehensive Gaps Report](2026-07-08-comprehensive-gaps-report.md) | 🗄️ |
| 2026-07-01 | [Master Due-Diligence](2026-07-01-master-due-diligence.md) · [Addendum](2026-07-01-master-due-diligence-addendum.md) | 🗄️ *dense counts-and-verdicts form* |
| 2026-07-01 | [Master Due-Diligence Report](2026-07-01-master-due-diligence-report.md) | 🗄️ *separate long-form audit, same date — not a duplicate* |
| 2026-06-29 | [Enterprise Due-Diligence Audit](2026-06-29-enterprise-due-diligence-audit.md) · [Addendum](2026-06-29-due-diligence-addendum.md) · [Business Perspective](2026-06-29-business-perspective-audit.md) · [Session Report](2026-06-29-session-report-gaps-actions.md) | 🗄️ |

## Journeys & operating reviews

| Date | Report | Status |
|---|---|:--:|
| 2026-07-20 | [Direct Sale — close-out re-run (87/100)](2026-07-20-journey-direct-sale-closeout.md) | 🟢 *the current Direct Sale measurement* |
| 2026-07-20 | [My Day — Operational Review](2026-07-20-my-day-operational-review.md) | 🟡 |
| 2026-07-17 | [Direct Sale — same-day re-run (85/100)](2026-07-17-journey-direct-sale-rerun.md) | 🗄️ *recovered 2026-08-05 — see note below* |
| 2026-07-17 | [Direct Sale — first run (82/100)](2026-07-17-journey-direct-sale.md) | 🗄️ *superseded by the close-out* |
| 2026-07-17 | [CRM Operating Review](2026-07-17-crm-operating-review.md) | 🟡 *close-out gate now passed; seed-hygiene condition still open* |

> **On the recovered re-run report.** From 2026-07-17 to 2026-08-05 this report was cited by three documents as the source of the 85/100 while **no such file existed in the repo** — it had been written but left uncommitted in a `git stash` on an unrelated branch, and was recovered on 2026-08-05. Everything downstream of it was sound (the 85 is real, and the direct-path progression gap it surfaced became PR-CRM-3), but for three weeks the evidence behind a cited score was unreachable by anyone reading the repo. **This is the case the always-export rule exists to prevent: a report that is written but not committed does not exist.**

## UX & experience

| Date | Report | Status |
|---|---|:--:|
| 2026-08-03 | [Junior-User Walkthrough](2026-08-03-junior-user-walkthrough.md) | 🟢 |
| 2026-07-27 | [Experience Architecture (L5)](2026-07-27-aura-os-experience-architecture.md) | 🟢 *target IA* |
| 2026-07-19 | [End-User Experience Audit (NNG)](2026-07-19-end-user-experience-audit.md) | 🟡 |
| 2026-07-19 | [UX Remediation Audit & Retheme](2026-07-19-ux-remediation-audit.md) | 🟡 |
| 2026-07-17 | [CRM Experience Transformation Plan](2026-07-17-crm-experience-transformation-plan.md) | 🟡 |
| 2026-07-05 | [Product Experience — 12 Axes](2026-07-05-product-experience-12-axes.md) · [Gap Verification](2026-07-02-product-experience-gap-verification.md) | 🗄️ *all 12 shipped* |
| 2026-07-03 | [Command Center](2026-07-03-enterprise-command-center.md) · [Create Forms](2026-07-03-professional-create-forms.md) · [Edit Forms & Drawers](2026-07-03-edit-forms-and-vertical-drawers.md) | 🗄️ |
| 2026-07-02 | [UI/UX Review + Suite Navigation](2026-07-02-ui-ux-review-and-suite-navigation.md) | 🗄️ |

## CRM & commercial

| Date | Report | Status |
|---|---|:--:|
| 2026-07-23 | [Revenue Lifecycle Blueprint](2026-07-23-revenue-lifecycle-blueprint.md) | 🟢 |
| 2026-07-16 | [CRM Feature Freeze](2026-07-16-crm-feature-freeze.md) · [Completion Plan](2026-07-16-crm-completion-plan.md) | 🗄️ |
| 2026-07-15 | [CRM Vision Gap Audit](2026-07-15-crm-vision-gap-audit.md) · [Directive Check](2026-07-15-crm-directive-check.md) | 🗄️ |
| 2026-07-13 | [CRM Final Blueprint & Gap Map](2026-07-13-crm-final-blueprint.md) | 🗄️ *S1–S9 all delivered* |
| 2026-07-12 | [Commercial Model Session Report](2026-07-12-commercial-model-session-report.md) · [CRM Audit](2026-07-12-crm-audit.md) | 🗄️ |
| 2026-07-12 | [Accounts Portfolio](2026-07-12-accounts-portfolio.md) · [Contacts 360](2026-07-12-contacts-stakeholders-360.md) · [Opportunity 360](2026-07-12-opportunity-360.md) · [Pipeline Command Center](2026-07-12-pipeline-command-center.md) · [Activity System](2026-07-12-commercial-activity-system.md) | 🗄️ *shipped* |
| 2026-07-11 | [Account 360](2026-07-11-account-360.md) · [Sales Pipeline](2026-07-11-sales-pipeline.md) · [Quotations Depth](2026-07-11-quotations-depth.md) · [Tender Pricing Sheet](2026-07-11-tender-pricing-sheet.md) | 🗄️ *shipped* |

## Deal chain — tender, contract, project

| Date | Report | Status |
|---|---|:--:|
| 2026-07-16 | [Tender OS Plan](2026-07-16-tender-os-plan.md) | 🟡 *T1–T5 done; T6 bid review outstanding* |
| 2026-07-12 | [Contracts Depth](2026-07-12-contracts-depth.md) · [Projects Depth](2026-07-12-projects-depth.md) | 🗄️ *shipped* |

## AI & agent platform

The five 2026-07-24 walkthroughs are a **progressive series** — each documents one wave, and later ones summarise rather than replace the earlier detail. Read the completion report for the consolidated picture.

| Date | Report | Status |
|---|---|:--:|
| 2026-07-24 | [Enterprise AI Platform — Completion Report](2026-07-24-enterprise-ai-platform-completion-report.md) | 🟡 *consolidated view* |
| 2026-07-24 | [AI, Agents & Intelligence Depth](2026-07-24-ai-agents-intelligence-depth.md) | 🟡 |
| 2026-07-24 | [Walkthrough — Phase 6 (full)](2026-07-24-walkthrough-ai-platform-phase6.md) · [Phase 6.1](2026-07-24-walkthrough-ai-platform-phase6-1.md) · [Phases 1–4](2026-07-24-walkthrough-ai-platform-phases1-4.md) · [Phase 1](2026-07-24-walkthrough-ai-platform-phase1.md) · [Admin AI Suite](2026-07-24-walkthrough-admin-ai-agent-suite.md) | 🗄️ *build history* |
| 2026-07-24 | Plans: [AI Control Center](2026-07-24-implementation-plan-ai-control-center.md) · [Admin AI Suite](2026-07-24-implementation-plan-admin-ai-suite.md) | 🗄️ *executed* |

> ⚠️ The AI platform runs in **LOCAL fallback mode** without `ANTHROPIC_API_KEY` — no model calls. Verified 2026-08-05.

## Platform, architecture & ops

| Date | Report | Status |
|---|---|:--:|
| 2026-08-14 | [G-10 Money Model Map & Float-Drift Evidence](2026-08-14-g10-money-model-map.md) | 🟢 *the money path traced end-to-end; drift proven (1,638 real VAT cases), reaches the tax invoice + GL* |
| 2026-07-11 | [Module Manager + Settings](2026-07-11-module-manager.md) | 🗄️ |
| 2026-07-10 | [Admin Center Depth Wave](2026-07-10-admin-depth-wave.md) | 🗄️ |
| 2026-07-09 | [P0 Deploy Wave](2026-07-09-p0-deploy-wave.md) · [P2 Wave 1](2026-07-09-p2-wave1.md) | 🗄️ |
| 2026-07-08 | [P1 Tier Closure](2026-07-08-p1-closure.md) · [Performance Baseline](2026-07-08-performance-baseline.md) | 🗄️ |
| 2026-07-06/07 | [Architecture Enforcement & Error Taxonomy](2026-07-06-architecture-enforcement-and-error-taxonomy.md) · [Pagination Adoption](2026-07-07-universal-pagination-adoption.md) · [Form Enforcement](2026-07-07-server-side-form-enforcement.md) · [Controller Wrapper Retirement](2026-07-07-controller-wrapper-retirement.md) | 🗄️ |
| 2026-07-04 | [Role-Based Workspace + Admin](2026-07-04-role-based-workspace-admin.md) · [Workspace Hub](2026-07-04-workspace-hub-chat-mail.md) · [Persistence & Identity](2026-07-04-workspace-persistence-identity-nav.md) | 🗄️ |
| 2026-07-03 | [Enterprise Form Engine](2026-07-03-enterprise-form-engine.md) · [Designer P2](2026-07-10-form-designer-p2.md) · [Designer P3](2026-07-11-form-designer-p3.md) | 🗄️ *P1–P3 complete* |

## Module depth series

| Date | Report | Status |
|---|---|:--:|
| 2026-08-02 | [Module Depth Gap Audit](2026-08-02-module-depth-gap-audit.md) | 🟢 *current* |
| 2026-07-02 | [Module Vertical-Depth Gap Analysis](2026-07-02-module-depth-gap-analysis.md) | 🗄️ |
| 2026-07-01 | [Vertical Depth Report](2026-07-01-modules-vertical-depth-report.md) · [Gaps](2026-07-01-modules-vertical-depth-gaps.md) · [Closures Walkthrough](2026-07-01-walkthrough-vertical-depth-closures.md) | 🗄️ |
| 2026-06-30 | [Depth Analysis](2026-06-30-module-depth-analysis.md) · [Current-State Re-Score](2026-06-30-depth-analysis-current-state.md) · [Gap-Closure Progress](2026-06-30-gap-closure-progress.md) | 🗄️ |
| 2026-06-29 | [Module Depth Gap Analysis](2026-06-29-module-depth-gap-analysis.md) | 🗄️ |

### Depth verticals & reactors (2026-06-30, all shipped) 🗄️

[Finance PDC](2026-06-30-finance-post-dated-cheques-vertical.md) · [Fleet Salik](2026-06-30-fleet-salik-tolls-vertical.md) · [HR Attendance](2026-06-30-hr-attendance-vertical.md) · [Inventory Reorder](2026-06-30-inventory-reorder-levels-vertical.md) · [Stock Valuation (WAC)](2026-06-30-inventory-stock-valuation-vertical.md) · [Quality MAR](2026-06-30-quality-material-approvals-vertical.md) · [Subcontract Back-Charges](2026-06-30-subcontract-back-charges-vertical.md) · [COGS→GL Reactor](2026-06-30-inventory-cogs-gl-reactor.md) · [Low-Stock→PR Reactor](2026-06-30-inventory-low-stock-auto-pr-reactor.md) · [AMC Migration Collision Fix](2026-06-30-amc-persistence-migration-collision-fix.md)

---

## Conventions

- **Filename:** `YYYY-MM-DD-kebab-slug.md`, dated by the work, not the commit. Every file in this folder now follows it.
- **Every analysis gets exported here** on the day it is produced — a report that exists only in a chat log is a report that does not exist. (`2026-07-17-journey-direct-sale-rerun.md` is the cautionary case: cited twice, never written.)
- **Never state a score, metric, or trace that was not measured in a live run.** If it is an estimate, say so in the same sentence.
- **Superseding beats deleting.** When a report's verdict goes stale, add a banner at the top pointing at what replaced it; keep the evidence underneath.
- **Update this index in the same change** that adds or supersedes a report.
