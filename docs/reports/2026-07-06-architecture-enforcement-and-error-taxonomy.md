# Architecture enforcement: fitness tests, clean module graph, shared discipline, error taxonomy

**Date:** 2026-07-06 · **PRs:** #26 #27 #29 #30 (merged) · #31 (open: `feat/error-taxonomy`)
· Verified against the live tree: full monorepo build + 41/41 test tasks green; live Postgres round-trips cited per row.

The aggregate-contract arc (ADR-0011/0012, reports of 2026-07-04/05) ended in a system that
**enforces its own architecture**. This report records what is now law-with-teeth, not prose.

## 1. What merged (PRs #26/#27/#29/#30)

| Piece | Where | Enforced/verified by |
|---|---|---|
| BusinessAggregate contract | `shared/src/aggregate/aggregate.ts` | fitness: aggregates expose id/tenantId/companyId |
| `discipline` shared dimension | `shared/src/dimensions/discipline.ts` (promoted from Engineering on 2nd consumer — Rule of Three) | fitness: no module redefines the vocabulary (caught + fixed a 3rd copy in doccontrol) |
| Discipline on aggregates | Engineering (7 aggregates), Procurement PO/PR (migration 0131) + `?discipline` filters | live: create/filter round-trips |
| Design Change → Variation | `engineering.design_change.approved` → CrossModuleSubscriber → draft VO | live: VO-DC-* created once (idempotent) |
| EngineeringDocument + Definitions | one aggregate, many docTypes; `DOCUMENT_DEFINITIONS` registry (ADR-0017) | fitness: no `docType===` literal outside registry; definitions declarative |
| RA → HSE hand-off | `engineering.document.submitted` (ownerModule=hse) → HSE review queue | reactor test (idempotent) |
| **ADR-0004 debt = 0** | quality/ITP gate ports → app-layer `GatesModule`; finance 3-way match → `PO_MATCH_PORT` + app-layer adapter | fitness: KNOWN_DEBT set is **empty**; live: quality gate still blocks PO issuance; match still blocks over-PO invoices |
| Architecture fitness tests | `apps/api/src/architecture.fitness.test.ts` (6 tests) | self-validating baselines (fail on new violations AND on stale baseline) |
| Engineering hub + cockpit UI | overview stats, per-docType form-engine fields, discipline filter | live HTML + BFF round-trips |
| Procurement spend-by-discipline | dashboard panel (count/spend/share per trade) | live: real PG data rendered |

**Every one of the 17 business modules imports only `@aura/core` + `@aura/shared`.**

## 2. PR #31 (open) — enforced error taxonomy (gap register Vol 23 #8, error half)

Audit: of **389** domain `throw new Error(...)` literals, **57 escaped** the global exception
filter's message taxonomy as opaque 500s — state guards ("only a draft agreement can be
activated"), limit guards ("exceeds remaining ceiling"), gate blocks, WPS validation, and
`Access denied` (→500, not 403).

Fix: `classifyDomainMessage` extracted as a pure function in `all-exceptions.filter.ts` and
extended from the audit data (403 access-denied / 404 not-found+absent-prereqs / 409
state-transition / 400 validation-limit-gate). **`error-taxonomy.fitness.test.ts` enforces it**:
extracts every throw literal in `modules/*` + `apps/api`, runs it through the real classifier,
fails CI on any new 500-escape (2-entry internal allowlist). The redundant per-endpoint
try/catch on invoice status change was removed (filter proves identical envelope live).

Verified live on unwrapped endpoints: stock-item altUnits factor-0 → `400 VALIDATION "alt unit
"box" needs a positive factor"`; duplicate unit → 400; 3-way match → 400 with full reason. All
were 500s.

## 3. Gap-register movement (Vol 23)

- **#8 Global validation layer** — error-envelope half **done** (PR #31); server-side
  `evaluateForm` half still open.
- Remaining P0s unchanged (RLS deferred last by standing decision; auth-default/secrets/
  deploy/backups need environment choices).

## 4. Follow-ups (recorded, not started)

1. Server-side `evaluateForm` (other half of #8) — needs schema↔endpoint mapping decision.
2. Delete remaining per-controller try/catch→400 boilerplate (~20 controllers) now the taxonomy
   is enforced — mechanical, but changes some 400s to more-correct 404/409; do with e2e watch.
   **DONE 2026-07-07** — 98 trivial 400-wrappers removed across 21 controllers (−392 net lines),
   procurement/stock now correctly 409; see `docs/reports/2026-07-07-controller-wrapper-retirement.md`.
   (6 NotFound wrappers left as a case-by-case follow-up.)
3. Platform Definition Registry: extract only when a 3rd module grows its own (ADR-0017 rule).
