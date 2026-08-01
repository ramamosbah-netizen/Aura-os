# Code Quality Report

**Score: 8.3 / 10** — consistently high-quality, self-documenting code with strong conventions and remarkably little rot. Main concerns are mega-files, a large uncommitted surface, and pragmatic-but-real `any` usage.

## 1. Quantified health (measured, non-test src)

| Signal | Value | Verdict |
|---|---|---|
| TODO / FIXME / HACK / XXX | **18** across ~1,725 files | ✅ Exceptionally low rot |
| `console.log` in source | **0** | ✅ Disciplined (uses Nest `Logger`) |
| `: any` / `as any` | **97** | ⚠️ Moderate; lint-warned, not blocked |
| ESLint | flat config, type-aware-lite, bug-class focus | ✅ Pragmatic |
| Commits | 760 | Sustained history |
| **Uncommitted files** | **59** | ⚠️ Large WIP surface |

## 2. Strengths

- **Uniform module shape** — `domain/` + `*-store.ts` port + `in-memory-*`/`postgres-*` adapters + `*.service.ts`. Learn one module, navigate all 18. This is the codebase's biggest maintainability asset.
- **Self-documenting comments** — files carry genuine *why* commentary (e.g. `tenant-scoped-pool.ts` explains the connect()/tx-runner/outbox interaction; `permissions.guard.ts` explains derivation; migration headers state ownership laws). Comments explain intent, not restate code.
- **Naming** — clear, domain-aligned (`deriveSellUnitPrice`, `assessOpportunityHealth`, `commercialVariance`, `SCHEMA_MIGRATION_PENDING`). Route→permission naming is systematic.
- **Error handling** — enforced taxonomy, no 500-leaks, allow-empty-catch only where intentional.
- **Low duplication of logic** — shared rules live in `@aura/shared` / `core`; the in-memory vs postgres duplication is *intentional* (adapter pattern), not accidental.

## 3. Weaknesses

| Issue | Detail | Fix |
|---|---|---|
| **Mega-files** | `project-detail.tsx` 1,899 · `tender-detail.tsx` 1,447 · `engineering-client.tsx` 1,235 · CRM 98 files/finance 102 files modules | Decompose components; consider sub-package boundaries for the largest modules |
| **97 `any`** | mostly mappers/DTO boundaries (lint downgraded to warn per `eslint.config.mjs`) | Type the mappers; graduate `no-explicit-any` to error once burned down |
| **59 uncommitted files** | AI platform + market-intelligence + ~20 report docs, unreviewed, unmerged | Commit/PR in reviewable slices or stash; risk of loss and of shipping untested code |
| **Duplicated guard branch** | `if (!this.auth.enabled) return true` twice in `permissions.guard.ts` | Remove the redundant block |
| **Report-doc sprawl** | `docs/reports/` has duplicate/date-suffixed variants (`walkthrough 1 24-07-2026`, `aura_master_platform_status 19-07-2026`) with spaces in filenames | Normalize naming; archive superseded reports |
| **Root `.txt` files** | `ir.txt`, `permid.txt`, `reqids.txt`, `ir.txt` — undocumented scratch files in repo root | Review contents, gitignore or remove |

## 4. Documentation

- **Extensive and dated** — `docs/` has blueprints, ADRs (CI-gated), architecture, a 25-volume master report, 30+ dated operating reports, runbooks. Genuinely above-average.
- Risk: documentation *volume* now exceeds what a new engineer can absorb; the sheer number of overlapping status/walkthrough reports makes it hard to find the current source of truth. A single, maintained `docs/INDEX.md` + archiving of superseded reports would help. (Memory already flags report-integrity discipline — good.)

## 5. Unused packages / deps

- Dependency list is lean (web: next/react/lucide/jspdf; api: nest/pg/class-validator/xlsx). No obvious bloat. `xlsx` and `multer` carry known advisories (CI audit non-blocking) — plan replacement/patch.

## Recommendations (ranked)

1. **Land or stash the 59 uncommitted files** in reviewable PRs — don't let unreviewed AI-platform code accumulate.
2. **Decompose files >800 LOC** (components first, then split the largest modules).
3. **Burn down `any`** in mappers, then promote the lint rule to error.
4. Remove the duplicated guard branch and root scratch `.txt` files.
5. **Add `docs/INDEX.md`**; archive superseded reports; normalize filenames (no spaces).
