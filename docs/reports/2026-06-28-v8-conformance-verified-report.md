# AURA OS — V8 Conformance & Codebase Analysis (Verified)

> **Date:** 2026-06-28
> **Author:** Architecture review (live verification)
> **Method:** Every verdict checked against the actual working tree — `pnpm typecheck`, `pnpm test`, source inspection, migration scan — **not** read from the self-authored roadmap.
> **Scope:** Full codebase analysis + conformance against the *AURA OS V8 Enterprise Architecture Standard*.

---

## 0. Verified Health Snapshot

| Check | Result |
|---|---|
| `pnpm typecheck` | ✅ **42/42 tasks pass** |
| `pnpm test` | ✅ **40/40 packages pass** (~150+ individual tests green) |
| Business modules | 17 |
| SQL migrations | 51 |
| TS source files (excl. `node_modules`/`.d.ts`) | 504 |
| Test files | 55 |
| Last git commit | `cd08948` (2026-06-25) |
| Uncommitted | **97 modified + 368 untracked files** |

The codebase **compiles cleanly and the full suite is green.** The foundation is real, not scaffolding.

---

## 1. Headline

The codebase is **simultaneously ahead of and behind its own V8 documents.**

- **Ahead of the roadmap:** CDM value objects, pgvector RAG plumbing, and single-tx primitives all exist despite being marked unchecked `[ ]`.
- **Behind its own Constitution where it matters most:** the load-bearing laws (command pipeline, atomic write, RLS policy coverage) are built as *reference implementations* but **not enforced platform-wide.** The Constitution states "No exceptions are permitted" — in practice the strongest laws are proven in **one** module and aspirational in the rest.

The gap is not vision or scaffolding; it is that the **constitution's strongest laws are demonstrated rather than enforced**, and a large body of good work sits uncommitted.

---

## 2. Constitution Conformance — the 7 non-negotiable laws

| # | Law | Verdict | Evidence |
|---|---|---|---|
| 1 | Decoupled DB contexts (no cross-module joins) | ✅ **Holds** | Modules compose via events + snapshots; no cross-module table reads found. Consistent across 17 modules. |
| 2 | Command pipeline integrity (validate→authz→idempotency→outbox in **one tx**) | ⚠️ **Partial — the big gap** | Pipeline exists in `core/src/commands/` (`command.bus.ts`, `idempotency.*`, `lock.service.ts`) but is **reference-only — not imported by any controller or service.** Single-tx writes (`tx.run` + `createWithClient` + `appendWithClient`) adopted in **CRM only**; contracts, tendering, projects, finance, procurement still do non-atomic create-then-append (`0` uses of `appendWithClient`). |
| 3 | Read-model segregation | ⚠️ **Partial** | Projections exist (`core/src/projections`, pipeline/P&L/ledger), but not all dashboards proven to read exclusively from them. |
| 4 | Interface decoupling (pluggable drivers) | ✅ **Holds** | Store ports + in-memory/Postgres impls selected by `DATABASE_URL`; AI behind a provider interface. |
| 5 | Immutable financial ledger (+ balance trigger) | ✅ **Holds** | `0050_finance_double_entry_trigger.sql` is a genuine `DEFERRABLE INITIALLY DEFERRED` constraint trigger enforcing `Σdebit = Σcredit` at commit. |
| 6 | Strict API backward compatibility (versioning) | ❌ **Not met** | Routes are `/api/<module>/...` with **no `/v1/` prefix** (Part XV §2 mandates version prefixes). No contract-version gating. |
| 7 | Multi-tenant isolation via RLS | ⚠️ **Partial** | RLS **ENABLED broadly** (92 `ENABLE ROW LEVEL SECURITY` across ~90 `aura_*` tables). But only **41 explicit `CREATE POLICY`** statements; the remainder lean on the dynamic policy function in `0049_dynamic_hierarchical_rls`. Policy coverage is uneven, not the per-table guarantee the law implies. |

**Net: 3 of 7 laws fully hold, 3 partial, 1 unmet.** The architecture *shape* is faithful; the *enforcement* is incomplete.

---

## 3. Roadmap Claim Accuracy (self-report vs reality)

The roadmap's checkboxes are **mostly honest, and in places too modest.**

### Claims verified TRUE (real, not vaporware)
- ✅ **Double-entry integrity trigger** — real (migration 0050).
- ✅ **Numbering & Audit engines** — exist in `core/src/{numbering,audit}`, referenced by finance/procurement/tendering services.
- ✅ **CDM value objects** (`Party`, `Address`, `Period`, `Quantity`) — real and well-implemented with validation logic in `shared/src/domain/cdm.ts` — **despite being marked unchecked `[ ]` in Phase 8.** Roadmap *understates* here.
- ✅ **pgvector RAG plumbing** — real `INSERT … ::vector` + cosine `<=>` search in `intelligence/src/vector-store.service.ts` (also marked `[ ]` but built).

### Claims that overstate or carry hidden caveats
- 🔴 **pgvector RAG embeddings are fake.** `vector-store` calls `aiService.embed()`, but `claude-provider.embed()` returns a **deterministic seed-filled pseudo-vector** (`new Array(1536)` hashed from text), not a real embedding-model call. The pipes are real; **semantic search will not actually be semantic** until a real embedding provider is wired.
- ⚠️ **Part IV CDM file paths are wrong.** The standard cites `shared/src/domain/cdm/party.ts`, `…/document.ts`, `…/location.ts`, etc. — none exist. Everything lives in one `cdm.ts`, and `Document`, `Project`, `Location`, `Account/CostCenter` CDMs are **not** present there. The CDM is ~40% of what Part IV specifies.
- ⚠️ **"Command Pipeline & CQRS ✅ (Phase 1.5)"** — primitives exist but are unused (see Law #2). "Done" means "built," not "enforced."

---

## 4. Hygiene Issues that Violate the Standard's Own Rules

- **Compiled artifacts in source/git.** ~32 `.js`/`.d.ts`/`.map` files plus whole `dist/` trees are sitting in `modules/finance/src`, `modules/inventory/src`, and `modules/*/dist`, showing as untracked. Pollutes `git status` and the decoupling fitness-test scan.
- **The entire V8 expansion is uncommitted.** Last commit `cd08948` (2026-06-25). 97 modified + 368 untracked files since. Everything analyzed here — AMC, builder, command pipeline, CDM, pgvector, 38 migrations — exists **only in the working tree.** Top operational risk regardless of architecture.
- **No Architecture Fitness Tests (Part XVI) run in CI.** Decoupling/RLS/dependency-cycle scans are specified but not wired into CI — which is exactly why Laws #2/#6/#7 can drift unnoticed.

---

## 5. Recommended Next Actions (in order)

1. **Commit the working tree** in logical chunks — nothing else matters if it is lost.
2. **Close the Law #2 gap:** thread the existing `appendWithClient`/`tx.run` pattern (already proven in CRM) through the other five deal-chain services, then route writes through `CommandBus`. Highest-leverage fidelity fix.
3. **Wire a real embedding provider** (or label RAG honestly as stubbed) — current pseudo-embeddings make AI search claims misleading.
4. **`.gitignore` + delete the `dist/`/`.js` leakage**, then add the Part XVI fitness tests to CI so the constitution self-enforces.
5. **Add the `/api/v1/` version prefix** (Law #6) before any external SDK/portal consumers exist — cheap now, expensive later.

---

## 6. Bottom Line

A genuinely strong, architecturally disciplined system — 17-module event-sourced ERP, typechecks and tests clean across 40 packages, consistent module template that has scaled without rotting. The five-layer architecture is real and faithful to the V8 shape.

What remains is **enforcement, not invention**: make the constitution's strongest laws binding across all modules (not just CRM), wire a real embedding model, clean the artifact leakage, and — most urgently — **commit the work.**

---

## Addendum (2026-06-29) — Law #2 atomic-write gap closed

The V8 expansion was committed in 9 layered commits on branch `feat/v8-enterprise-expansion` (build hygiene + shared/core/modules/intelligence/api/web/infrastructure/docs); 32 orphaned compiled artifacts were removed from `src/` and a `.gitignore` safety net added.

The **atomic-write half of Constitution Law #2 is now closed.** The six services that still did non-atomic create-then-append — `contracts`, `tendering`, `projects`, `finance/invoice`, `procurement/PO`, `inventory/GRN` — were converted to the CRM template: aggregate row + domain event commit in ONE transaction via `TX_RUNNER` + `store.createWithClient` + `events.appendWithClient` (null tx falls back to sequential writes for no-DB dev). Investigation showed the T2/T3 modules (assets, doccontrol, engineering, fleet, hr, hse, quality, site) **already** used this pattern, so **single-tx create is now uniform across all 17 business modules.** Verified `pnpm typecheck` 42/42 and `pnpm test` 40/40 after the change (committed `8f97caf`).

**Still open on Law #2:** writes are not yet routed through `CommandBus` (the command pipeline remains reference-only), and status-transition writes (`changeStatus`/`update` + event) are still non-atomic — only the create path was made transactional, matching the established template. These are the remaining follow-ups.
