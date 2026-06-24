# Report — Phase 0b.4b: Platform Workflow engine

**Date:** 2026-06-24 · **Repo:** `Desktop/aura-os` (branch `main`) · **Increment:** Phase 0b step 4b.

> A generic state machine any module drives — not a PO-specific flow. Ties workflow → access → events together.

---

## What shipped

**`@aura/shared`** (`workflow/workflow.ts` + 8 tests) — framework-free model:
- `WorkflowDefinition` (states, terminal states, transitions with an optional required `permission`), `WorkflowInstance` (current state, status, append-only history).
- Pure functions: `checkTransition` (structural validity), `applyTransition` (advances + auto-completes on a terminal state), `availableActions`, `isTerminal`. `WORKFLOW_EVENT` names.

**`@aura/core`** (`workflow/`):
- `WorkflowStore` port + `PostgresWorkflowStore` / `InMemoryWorkflowStore` (picked from `DATABASE_URL`, like every other kernel store). Definitions are global (`''`) or tenant-scoped, resolved with tenant-preferred fallback.
- `WorkflowService.start()` / `transition()` — the engine. **Enforces a transition's required permission via `AccessService`** (RBAC scope + ABAC `approvalLimit`), then emits `workflow.instance.*` on the event spine for every change.

**Wiring:** migration `0003_kernel_workflows.sql` (`aura_workflow_definitions` + `aura_workflow_instances`, RLS-locked); demo `WorkflowController` (`/api/workflows`); `WorkflowSeeder` seeds a `po.approval` flow + a demo grant (`u-demo` may approve ≤100000 in `c-demo`).

## The integration win

A transition isn't just a state change — `submitted --approve--> approved` is gated by `procurement.po.approve` **and** the approver's ABAC ceiling, then recorded as `workflow.instance.transitioned` + `workflow.instance.completed` on the outbox. Three kernel substrates (workflow + access + events) compose with no special glue.

## Verified

- Build **3/3**; tests **35/35** (8 new workflow + 12 identity + 9 AI + 6 DMS).
- **Live** against the dedicated Supabase project (migration 0003 applied):
  - `start → submit → approve` ⇒ `approved`/`completed`, history=2, **read back from Postgres**.
  - ABAC: approve 250000 > 100000 limit ⇒ **denied**. RBAC: ungranted user ⇒ **denied**.
  - `workflow.instance.transitioned/completed/started` all **relayed** via the outbox (persist-then-relay confirmed by the 1–2s gaps).

## Notes / follow-ups

- **Denials surface as HTTP 500** today (the kernel throws a plain `Error`; Nest maps it to 500). Small polish: a typed `AccessDeniedError` mapped to **403** at the API edge — deferred so it lands once across all guarded endpoints, not workflow-only.

## Next — Phase 0b step 4c

**Integration skeleton** (the last 0b piece): outbound webhooks + a generic import/export seam so external systems can subscribe to the event stream — completing the kernel before any business module.
