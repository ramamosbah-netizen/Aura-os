# Report — Phase 0b.1: Identity & Access kernel

**Date:** 2026-06-24 · **Repo:** `Desktop/aura-os` (local, branch `main`) · **Increment:** Phase 0b step 1 of the kernel.

> Built first because it gates every write — no module authorizes anything on its own.

---

## What was built

**Framework-free model in `@aura/shared`** (`src/identity/`):
- `org.ts` — `ORG_LEVELS` (`tenant → company → business_unit → department → team`) + `OrgNode` (tree via `parentId`).
- `access.ts` — `Permission` (`module.aggregate.action`), `Scope` (`org` node **or** concrete `resource`), `Role`, `Grant` (+ ABAC `GrantAttributes.approvalLimit`), `AccessTarget`, and the **pure evaluator**:
  - `permissionMatches(pattern, requested)` — exact · `*` (all) · trailing `*` · mid-segment `*`.
  - `scopeContains(scope, target)` — org scope covers the target if the grant's node is an **ancestor-or-self** in the target's `orgPath`; resource scope must match exactly.
  - `evaluateAccess(grants, roles, target)` — allow iff a grant's role matches the permission **and** its scope contains the target **and** ABAC permits (`approvalLimit ≥ amount`). First satisfying grant wins.

**Injectable kernel services in `@aura/core`** (`src/identity/`), wired into `CoreModule`:
- `OrgService` — holds the org tree, resolves `orgPath(nodeId)` (ancestor→self chain) for scope checks.
- `AccessService` — the **single authorization entry point**: `can(userId, target)` / `assert(...)`. Every module calls this; none rolls its own auth.

This realizes the requested chain: `User → Company A → Project X → Procurement` = a grant scoped to Company A (or to Project X) carrying a procurement role, with an optional approval ceiling.

## Verified

- `pnpm build` → **shared → core → api all compile** (8.3s).
- `pnpm test` → **12/12 vitest tests pass** in `@aura/shared`: permission matching (6), org-scope ancestor-allows vs different-company-denies, ABAC `approvalLimit` over-ceiling denied, resource-scoped grant allowed, role-without-permission denied, resource exact-match.
- Toolchain note: pnpm's supply-chain gate required approving esbuild's build (vitest dep) via `onlyBuiltDependencies: [esbuild]` in `pnpm-workspace.yaml` — esbuild only installs its own native binary; safe.

## Decisions

- **Pure logic in `shared`, thin services in `core`** — the access rules are framework-free (trivially testable, reusable client + server); Nest only does DI.
- **One `can()` for the whole platform** — modules never implement access checks.
- **In-memory stores for Phase 0b** (`OrgService`/`AccessService` maps) — the Postgres-backed impls (roles, grants, org tree + RLS) land with the database increment.

## Next (Phase 0b step 2)

**Postgres event store + transactional outbox** on Supabase — replace the in-memory `EventStore` with a durable ledger that writes inside the business transaction, plus a relay to the bus; first migration. Then AI Provider Layer → `core`, then DMS / Workflow / Integration skeletons.
