# Projects + Delivery Operations — Architecture & Ownership Gate

**Date:** 2026-09-02  
**Scope:** discovery and bounded Project 360 IA authority before Procurement  
**Status:** DISCOVERY COMPLETE — bounded correction authorized; Procurement not started

## Authority

Projects owns project management, planning, coordination, controls and closeout.
Delivery Operations owns specialist and field execution. Existing domain writers remain
authoritative; Project 360 composes project context and links to those writers.

Closed authorities are preserved: Sales/Commercial, Gate A, Gate B/B1–B7, C1–C6,
Cost Ledger, Certification, Variations, Documents and the SOLD/EXECUTED/CERTIFIED/BILLED
separation.

## Repository baseline

- Branch: `main`
- HEAD: `208238c0068377216cdca940324773ed4828d356`
- `origin/main`: `4c9410b8f19d508f812d55904d949494053caa01`
- Working tree: already dirty with active Contracts/CLM work; no reset, clean, stash,
  migration rewrite or unrelated cleanup performed.
- Canonical Project 360 namespace: `/project/[projectId]` (ADR-0019).

## Current ownership matrix

| Capability | Current authority | Project 360 role | Classification | Evidence |
|---|---|---|---|---|
| Project identity/status | Projects | compose + governed project commands | REUSE | `projects.controller.ts`, `/project/[projectId]` |
| WBS/CBS and controls | Projects | scoped control/readback | REUSE | `project-360-client.tsx`, Projects API |
| Schedule/Gantt/baseline | Projects Schedule | link/readback; no duplicate schedule store | REUSE | `schedule.service.ts`, `/projects/schedule`, `gantt-client.tsx` |
| Reactive planning/CPM/resource levelling | Projects Schedule planning domain | not currently surfaced in Project 360 | EXTEND | `schedule-planning.ts`, `POST /projects/schedules/plan` |
| Engineering drawings/RFIs/submittals | Engineering | project-scoped context + deep link | REUSE | `engineering.controller.ts`, `project-areas.ts` |
| Site instructions/daily reports/progress/evidence | Site | project-scoped context + deep link | REUSE | `site.controller.ts`, Site UI |
| Quality inspections/NCRs/snags | Quality | project-scoped context + deep link | REUSE | `quality.controller.ts`, `project-areas.ts` |
| HSE permits/incidents/actions | HSE | project-scoped context + deep link | REUSE | `hse.controller.ts`, `project-areas.ts` |
| Testing/commissioning/handover | Commissioning/Handover | project-scoped context + deep link | REUSE | commissioning controllers |
| Documents and evidence | Documents/DMS | project association/readback | REUSE | `documents.controller.ts`, DMS routes |
| Variations/EOT/delays | Projects/C6 | governed controls/readback | REUSE | Projects controller and C6 tests |
| Actual cost | Cost Ledger | read-only projection | REUSE | C5 Cost Ledger authority |
| Certification | C4 | read-only context | REUSE | C4 authority |
| Project Action Center | none | missing composition layer | GAP | no project-scoped action catalog found |
| Execution Readiness projection | none | missing composition layer | COMPOSE GAP | no project readiness endpoint/projection found |
| Project-wide Notes | no single proven authority | must link record/activity notes | DECISION/COMPOSE | record-level notes exist; no generic ProjectNotes authority found |

## Project action ownership

Project 360 may expose contextual actions, but each action must call the existing
canonical authority:

| Project action | Canonical writer |
|---|---|
| Add task / baseline | Projects Schedule |
| Work instruction / daily report / site evidence | Site |
| RFI / drawing / submittal | Engineering |
| NCR / inspection / snag | Quality |
| Permit / incident / toolbox talk | HSE |
| Variation / EOT / closeout | Projects/C6 |
| Document / photo evidence | Documents/DMS or the owning workflow |
| Certification | C4 |
| Actual cost | C5 Cost Ledger |

No second writer or direct projection mutation is authorized.

## Execution Readiness decision

No new readiness table or universal checklist is authorized by this Gate. Readiness
must be composed from authoritative evidence from Engineering, Supply Chain, Planning,
Quality, HSE and Resources, and represented honestly as:

```text
READY
BLOCKED — <authoritative reason>
UNKNOWN — evidence unavailable
```

The current repository has the contributing engines but no Project-level readiness
projection. This is a bounded follow-up composition slice, not a reason to invent a
`work_packages` table.

## Work Package decision

The existing WBS/Schedule activity, execution records and cross-module `projectId`
linkage must be audited before introducing any new entity. Allowed outcomes are:

```text
REUSE | EXTEND | COMPOSE | GAP
```

No `work_packages` persistence may be created automatically from the label alone.

## IA finding

`/project/[projectId]` is canonical, but `ProjectShell` currently renders Command center,
Project controls and all delivery areas as one flat navigation list. The overview also
labels the area cards as the delivery spine. This is functionally scoped and ownership-safe,
but it still feels module-centric rather than a Project Office workspace.

The bounded correction is to group the navigation into project questions (Overview, Plan &
Schedule, Progress & Execution, Commercial & Cost, Changes, Approvals & Actions, Evidence,
Team, History/Closeout) while retaining project-scoped links to the owning delivery areas.
This must not remove or duplicate Engineering/Site/Quality/HSE/Commissioning capabilities.

## C5 constraint

Project 360 must not surface deferred EVM metrics as fabricated values:

```text
BAC = available only when authoritative
AC  = Cost Ledger
EV  = governed calculation
PV/SV/SPI/EAC/ETC/VAC/TCPI = UNAVAILABLE
```

`UNKNOWN` remains distinct from zero.

## Gate outcome

**Architecture & Ownership Gate = PASS for bounded IA correction.**

Authorized next work is limited to:

1. project-centric navigation grouping;
2. contextual Action Center links to canonical writers where routes already exist;
3. explicit source labels and honest unavailable/readiness states;
4. tests and browser proof for Project 360 context preservation and canonical deep links.

Execution Readiness composition and any new project-wide notes/work-package authority
remain separately bounded decisions after repository authority is mapped. Procurement is
not started by this Gate.

## Verification after bounded correction

- `@aura/web` typecheck: PASS.
- Project 360 focused Vitest suites: PASS — 3 files, 9 tests.
- `@aura/web` production build: PASS — Next.js compiled, TypeScript completed and 234
  application pages generated.
- `git diff --check`: PASS (Git emitted only the repository's existing line-ending warnings).
- API provenance check: PASS — `http://localhost:4000/api/v1/health` reported
  `environment=e2e-disposable`, schema `281/281`, projections ready.
- Targeted authenticated browser smoke was attempted against the disposable environment.
  It was not counted as PASS: the fixture POST received HTTP 429 from the API rate limiter
  before the Project 360 navigation assertions ran. No product failure was inferred from this
  environment-level rejection and no shared database was touched.

## Gate disposition

The bounded Project 360 IA correction is implemented and verified at source, typecheck, build
and focused-test level. Browser proof remains **NOT PROVEN** until the disposable API rate limit
window is clear and the same targeted smoke can create its isolated project fixture. This does
not authorize Procurement or any new Project/Delivery domain writer.
