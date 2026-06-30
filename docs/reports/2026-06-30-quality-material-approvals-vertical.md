# Module-depth vertical — Quality Material Approval Requests (MAR)

**Date:** 2026-06-30
**Module:** `@aura/quality`
**Migration:** `0076_quality_material_approvals.sql` (applied live → DB at 76)

## What & why

Quality had NCR / inspection-requests / snags / ITP but no **Material Approval
Request** — flagged P1 in the gap analysis ("no MAR, no WIR"). MAR is a core UAE
QA/QC document: the contractor submits a proposed material (manufacturer, spec,
supplier) for consultant approval *before* procurement/installation.

## Domain (`modules/quality/src/domain/material-approval.ts`)

- `makeMaterialApproval` — validates projectId / reference / materialName; starts `draft` rev 0.
- Lifecycle: `draft → submitted → approved | approved_as_noted | rejected`;
  `rejected | approved_as_noted → draft` via revise (revision++).
- `reviewMaterialApproval(decision, by, comments)` — records reviewer + time;
  **requires comments** for `approved_as_noted` and `rejected`.
- `reviseMaterialApproval` — bumps revision, clears review, resets to draft (only from rejected/as-noted).
- Events: `quality.material_approval.created | submitted | reviewed | revised`.

## Vertical (clones the ITP vertical)

- domain `material-approval.ts` + **6 unit tests**
- store: extended `MaterialApprovalStore` port + in-memory + postgres impls
- migration `0076` — `aura_quality_material_approvals`, indexed (tenant / project /
  status), RLS-locked (`tenant_isolation_policy`)
- service: create / submit / review / revise / list (atomic `TX_RUNNER` writes +
  spine events); new `MATERIAL_APPROVAL_STORE` token + module provider
- API on `QualityController`: `POST/GET /api/v1/quality/material-approvals`,
  `PUT /:id/{submit,review,revise}`
- web: BFF routes + `/quality/material-approvals` page + client (create form,
  status badges, inline submit/approve/as-noted/reject/revise) + nav entry

## Verification

- `pnpm typecheck` **42/42**; `pnpm test` **41/41** tasks (quality **18/18**, 6 new;
  fixed the 3 existing `quality.test.ts` `new QualityService(...)` calls for the added store arg).
- **Live-DB E2E** (Supabase, API on :4144): create (draft) → submit (submitted) →
  reject w/ comments (rejected, comments persisted) → revise (draft, **rev 1**) →
  resubmit → approve (approved); guards: reject-without-comments → **400**,
  missing materialName → **400**; re-fetch confirms persistence (approved, rev 1).

## Next candidates

- WIR (Work Inspection Request) — the on-site execution counterpart to MAR (the other half of the flagged P1 gap).
- MAR → procurement: only approved materials orderable (link supplier-master / PO).
- Calibration register & audit schedule (remaining Quality limbs).
