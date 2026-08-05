# AURA OS — Documentation Index

**181 markdown documents.** This page is the entry point. **Reviewed 2026-08-05.**

## Start here

| If you want to know… | Read |
|---|---|
| **What is broken or missing right now** | [2026-08-05 Consolidated Gap Register](reports/2026-08-05-consolidated-gap-register.md) — **every open gap in one place**, 50 rows with stable IDs and per-row provenance |
| **Enterprise-readiness detail and fix history** | [2026-08-03 Enterprise Readiness Audit](reports/2026-08-03-enterprise-readiness-audit.md) — P0/P1/P2 tracker, last measured **54/100** |
| **What the running app actually does** | [2026-08-05 Platform State Verification](reports/2026-08-05-platform-state-verification.md) |
| **What the system is and how it is built** | [Master Report](master-report/README.md) — 32 volumes (⚠️ describes the July tree; see its currency note) |
| **Why a structural decision was made** | [ADRs](adr/README.md) — 17 records, CI-gated |
| **What happened on a given date** | [Reports index](reports/README.md) — 91 dated reports, each with a status |
| **An outside read on the platform** | [`/analysis`](../analysis/README.md) — 17-part CTO-level audit (2026-08-01), re-confirmed 2026-08-05 |
| **How to operate it** | [Runbooks](#runbooks) |

## The numbers you may quote

Per the project's report-integrity rule, only measured figures are quotable. As of 2026-08-05:

| Measure | Value | Measured | Source |
|---|---|---|---|
| Enterprise-production readiness | **54 / 100** | 2026-08-03 | [readiness audit](reports/2026-08-03-enterprise-readiness-audit.md) |
| Journey Score · Direct Sale | **87 / 100**, E2E PASS | 2026-07-20 | [close-out re-run](reports/2026-07-20-journey-direct-sale-closeout.md) |
| Journey Score · Tender | **65 / 100** | 2026-07-17 | [CRM operating review](reports/2026-07-17-crm-operating-review.md) |

Everything else — module completeness percentages, maturity scores, the `/analysis` 7.2/10 — is an **informed estimate**, labelled as such where it appears. No journey has ever measured 100/100. Production-build performance has never been measured.

## The one thing to know before deploying

**Authentication is off by default and an unauthenticated request returns live data** — verified against the running app on 2026-08-05 (`GET /api/v1/crm/opportunities`, no token → 200 with 34 records). Enforcement is opt-in via `AUTH_REQUIRED=true`, or automatic only when production *already has a verifier configured* (`apps/api/src/main.ts:101`), so a production deploy without `AUTH_JWKS_URL`/`AUTH_JWT_SECRET` runs open. Row-level security has the opposite shape: fully built and CI-proven, but **inert at runtime** because the app connects as the DB owner — though that one now refuses to boot in production. This is readiness-audit **P0-1**, the last remaining P0.

---

## Directory

### `reports/` — dated operating reports (91)
Every analysis, audit, journey run and slice write-up, newest first, each carrying a status. **[→ Reports index](reports/README.md)**

### `master-report/` — the 32-volume platform reference
Architecture, kernel, modules, security, database, API, workflows, business rules, formulas, deployment, gaps. **[→ Master index](master-report/README.md)**
⚠️ Describes the tree as of July 2026; volume *content* is sound, **status and gap columns are not current**. Two P0 rows corrected in place 2026-08-05 ([Vol 7](master-report/vol-07-security.md), [Vol 23](master-report/vol-23-gap-analysis.md)).

### `adr/` — architecture decision records (17, CI-gated)
The binding decisions. `pnpm adr:check` fails CI on drift; `pnpm adr:new` creates one. **[→ ADR index](adr/README.md)** · [dependency graph](adr/GRAPH.md)
Most load-bearing when reading the code: [0001 FK policy](adr/0001-fk-policy.md) (snapshot-by-reference, *not* referential joins — explains the deliberate absence of cross-module FKs), [0002 transactional outbox](adr/0002-transactional-outbox.md), [0004 no module imports](adr/0004-no-module-imports.md), [0010 RLS authored early, enforced last](adr/0010-rls-authored-early-enforced-last.md).

### `runbooks/` — operational procedures (6)
[backup & DR](runbooks/backup-dr.md) · [RLS tenant isolation](runbooks/rls-tenant-isolation.md) *(the `aura_app` role flip — the open P0-2 step)* · [migration deploy gate](runbooks/migration-deploy-gate.md) · [secrets rotation](runbooks/secrets-rotation.md) · [data lifecycle](runbooks/data-lifecycle.md) · [bid-time sourcing](runbooks/bid-time-sourcing.md)

### `architecture/` — cross-cutting maps (2026-07-14)
[End-to-end handoff map](architecture/AURA-END-TO-END-HANDOFF-MAP.md) · [business capability map](architecture/AURA-FINAL-BUSINESS-CAPABILITY-MAP.md) · [source-of-truth matrix](architecture/AURA-SOURCE-OF-TRUTH-MATRIX.md)
🟡 Verified against `main` @ `6e099e1`; structurally still accurate, statuses ~3 weeks old.

### `audits/` · `roadmap/` — the 2026-07-14 planning set
[Final end-to-end master audit](audits/AURA-FINAL-END-TO-END-MASTER-AUDIT.md) · [final gap register](roadmap/AURA-FINAL-GAP-REGISTER.md) · [final execution roadmap](roadmap/AURA-FINAL-EXECUTION-ROADMAP.md)
🗄️ **Superseded as a work queue** — slices R1–R5 shipped, R6 never started, and work is now sequenced by the readiness audit's P0/P1/P2 register. Both roadmap docs carry status banners explaining what closed. The slice *specifications* remain the authority on what each slice means.

### `guides/`
[Agent SDK & marketplace publishing](guides/AGENT-SDK-AND-MARKETPLACE-PUBLISHING.md)

### Founding blueprints (June 2026) 🗄️
[V2 blueprint](AURA-OS-V2-BLUEPRINT.md) · [V2 module map](AURA-OS-V2-MODULE-MAP.md) · [0.2 master consolidation blueprint](AURA-0.2-MASTER-BLUEPRINT.md) · [completion blueprint / V8 standard](AURA-OS-COMPLETION-BLUEPRINT.md) · [gap analysis V7](AURA-OS-GAP-ANALYSIS.md) · [BOP transition](AURA-OS-BOP-TRANSITION.md)

These predate the build and several still read *"no code is written until each phase is approved"* — **that gate was passed long ago; read them as design intent, not as current instructions.** `AURA-0.2-MASTER-BLUEPRINT.md` opens by extending `AURA-0.2-CONSOLIDATION-AUDIT.md`, which **is not in this repo** — the only broken internal link in the entire documentation set.

---

## Conventions

- **Reports** live in `reports/` as `YYYY-MM-DD-kebab-slug.md`, dated by the work. Every analysis gets exported the day it is produced — a report that exists only in a chat log does not exist.
- **Never state a score, metric, or trace that was not measured in a live run.** If it is an estimate, say so in the same sentence.
- **Supersede, don't delete.** When a verdict goes stale, banner the top and point at what replaced it; keep the evidence underneath.
- **Structural decisions become ADRs**, not report prose — CI enforces it.
- **Update the relevant index** in the same change that adds or supersedes a document.
