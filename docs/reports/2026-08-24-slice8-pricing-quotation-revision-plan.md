# Slice 8 — Pricing ↔ Quotation Revision Integrity (implementation plan)

**Date:** 2026-08-24
**Depends on / follows:** [2026-08-24-opportunity-stage-winloss-audit.md](2026-08-24-opportunity-stage-winloss-audit.md) §4
**Status:** PLAN — for review before any code. Nothing implemented.
**Prerequisite for:** the `accepted → Won` reactor + governed manual override (do NOT build those until this lands).

---

## 1. The defect, precisely

Three independent root causes combine so that re-pricing a direct deal produces an **independent
quotation** instead of a **revision**, and a retry can leave an **orphan**.

| # | Root cause | Evidence |
|---|---|---|
| R1 | `PricingSheetStatus` has no `superseded` — freezing P v2 leaves P v1 `frozen`, so two frozen sheets coexist. | `modules/crm/src/domain/pricing-sheet.ts:23` |
| R2 | `frozenPricingFor` does `list({ status:'frozen', limit:1 })` — with two frozen sheets it returns an **arbitrary** one. | `modules/crm/src/pre-award-package.service.ts:323` |
| R3 | `convert-to-quotation` **always `quotations.create(...)`** a fresh rev-0 quote (`QT-OPP-{oppId}`, no `parentQuotationId`) and never revises; then links the sheet **after** creation (non-atomic). | `apps/api/src/crm/crm-opportunities.controller.ts:160`, `:173` |

**Failure trace (the P-002 case):**
1. Freeze P v1 → `convert-to-quotation` → Q rev 0 created + `linkQuotation(v1, Q0)`. ✔
2. `openPricingRevision` → P v2 (`parentSheetId=v1`); set policy; freeze. Now **v1 and v2 both `frozen`** (R1).
3. `convert-to-quotation` again → **new** rev-0 quote with the same number, no `parentQuotationId` (R3) → an **independent** quote, not Q rev 1. `linkQuotation` may also throw "only one quotation per sheet" if it hits v1 → the just-created quote is left **orphaned** (create ran before link; not atomic).

**Consequences:** `listRevisions` sees two rev-0 quotes sharing a number and (correctly) refuses to
treat them as a chain (`quotation.service.ts:236`) — so history splits; and "the accepted quotation"
becomes ambiguous, which is why automatic Won cannot be built on this yet.

---

## 2. Target behaviour (invariants)

- **I1 — One live frozen sheet per package.** At most one `frozen` pricing sheet exists for a package
  at a time; older frozen versions are `superseded`.
- **I2 — One live quote per direct deal.** At most one non-terminal, non-`revised` quotation per
  opportunity (its "live" quote).
- **I3 — Version alignment.** Freezing a new pricing version and materialising the quote yields a
  **quotation revision** (`parentQuotationId` → prior live quote, `revision+1`) whose lines are
  projected from the new frozen sheet. P v(n) ↔ Q rev(n−1).
- **I4 — Atomic.** Create/revise + regenerate lines + link + events happen in one transaction; no
  partial state (no orphan quote, no half-linked sheet) is ever persisted.
- **I5 — No stale generation.** A `superseded` sheet cannot generate or revise a quote (409-style).
- **I6 — Idempotent.** Re-running materialise with no pricing change returns the existing live quote
  unchanged (no new revision).

---

## 3. Work breakdown

> **Approved refinement (do not destroy history):** effectivity is modelled **orthogonally** to
> `status`, NOT by mutating `frozen → superseded`. `status` stays the permanent lifecycle fact; a new
> `supersededAt / supersededBy / supersededByPricingId` marks effectivity. A superseded revision stays
> `frozen` with `frozenAt`, `frozenBy`, `commercial`, `quotationId`, `lines` all intact — the audit we
> need for Auto-Won. Current = `status==='frozen' && supersededAt===null`. **← DELIVERED in PR-1.**

### Step 1 — Pricing sheet effectivity (domain + stores + migration) — DELIVERED
- `pricing-sheet.ts`: add `supersededAt/By/ByPricingId` (orthogonal to status); `supersedeSheet(sheet, {pricingId, actorId})` (frozen-only, self-supersede guard, idempotent) + `isCurrentlyEffective` / `isHistoricallyFrozen`.
- `pre-award-package.service.ts`: when a new pricing version is **frozen** (`freezePricingSheetById` / `freezePricing`), mark the prior `frozen` sheet of that package `superseded` in the **same tx**.
- `frozenPricingFor`: return the **unique** `frozen` sheet (assert ≤1; if legacy data has >1, pick highest `version` and log). Prefer an explicit "latest frozen" query over `limit:1`.
- Stores: update both `in-memory-pricing-sheet-store.ts` and `postgres-pricing-sheet-store.ts` for the new status + ordering.
- **Migration:** add the status value if constrained; **backfill** any package with >1 frozen sheet → keep highest `version` frozen, older → `superseded`. (New migration number; check latest is 0247.)

### Step 2 — Revision-aware materialisation (single writer)
Replace the create-always logic with one service method (proposed
`PreAwardPackageService.materialiseQuotation({ tenantId, opportunityId, customerName, accountId, actorId })`):
1. `sheet = frozenPricingFor(...)`; refuse if none / superseded (I5).
2. `live = ` the opportunity's live quote (`sourceOpportunityId = opp`, status ∉ terminal/`revised`).
3. **No live quote** → `quotations.create(...)` rev 0 (today's path) → `linkQuotation(sheet, q.id)`.
4. **Live quote tied to an older pricing version** (`sheet.quotationId !== live.id`) →
   `quotations.revise(live.id)` → regenerate the new draft's lines from the sheet
   (`saveEstimation(next.id, sheet.lines)`) → `linkQuotation(sheet, next.id)`.
5. **Live quote already reflects this sheet** (`sheet.quotationId === live.id`) → return `live` (I6).
- `convert-to-quotation` controller delegates to this method; the tender path is untouched (see §4).

### Step 3 — Atomicity
- Wrap Step 2's create/revise + `saveEstimation` + `linkQuotation` + event emits in `tx.run(...)`
  using the existing `appendWithClient` pattern (`opportunity.service.ts:163`). A link failure rolls
  back the create/revise — no orphan can persist (I4).

### Step 4 — Link semantics
- `linkQuotation` stays 1-sheet-1-quote, but each **sheet version** links to its own quotation
  **revision**, so v2 → Q rev1 is valid (v2 had `quotationId=null`). No guard change needed; add a
  test asserting a fresh sheet version links cleanly to the new revision id.

### Step 5 — Tests (characterization-first, with negative controls)
- **Characterization** (lock current behaviour): freeze v1 → materialise → rev 0; freeze v2 →
  materialise → assert TODAY's broken result (independent rev-0 / orphan), so the diff is provable.
- **Fixed behaviour:** second materialise → Q **rev 1**, `parentQuotationId = rev0.id`, lines from v2;
  `listRevisions` returns one connected 2-item chain.
- **Invariants:** ≤1 frozen sheet/package (I1); ≤1 live quote/opp (I2); superseded sheet refuses (I5);
  idempotent no-op when unchanged (I6).
- **Atomicity:** inject a link failure → assert **no** quote row persisted (I4).
- **Negative control:** revert the service change → the fixed tests must fail (per standing habit).

### Step 6 — SDK / BFF
- `convert-to-quotation` response shape is unchanged (returns a `Quotation`), so likely no SDK change;
  if any DTO shifts, regen SDK **after** rebuilding api dist (per repo gotcha). Run `pnpm lint`.

### Step 7 — UI (follow-up, not Slice 8 core)
- Negotiation/Quotation tab already reads `listRevisions` (`negotiation.controller.ts:91`) — after the
  fix it will show the aligned P→Q chain automatically. Verify only; no new UI in this slice.

---

## 4. Scope guard — do NOT regress the tender path
There are **three** quotation-generation flows; Slice 8 touches only the **direct Pre-Award package**
one:
- `convert-to-quotation` (direct opp) — **in scope**.
- `PreAwardService.generateQuotation` (approved-scope direct path, already idempotent per scope) — align if it shares the sheet, else leave.
- `PricingSheetService.generateQuotation` + `pricing-sheets.controller` (tender pricing → quote via `sourceTenderId`) — **out of scope**; regression-test it stays green.

---

## 5. Risks & gotchas
- **Migration/backfill** of existing double-frozen sheets on the live dev DB — write it idempotent; verify against `list_migrations` (latest is 0247).
- **Two stores** (in-memory + postgres) must both get the status + ordering change or CI diverges.
- **Money (G-10):** lines are regenerated through the estimation engine (`saveEstimation`) — keep the money-string policy; do not reintroduce `number` drift.
- **Rebuild order:** api dist before SDK regen; run lint (0 errors) — per the pre-push gate checklist.

---

## 6. Acceptance criteria
1. Re-pricing then materialising yields a **quotation revision**, never an independent quote.
2. Exactly **one** live frozen sheet and **one** live quote per direct deal at all times.
3. **No** orphan quote is reachable under any failure (atomic).
4. `listRevisions` returns a single connected chain aligned to pricing versions.
5. A superseded sheet **cannot** generate/revise.
6. Materialising with no pricing change is a **no-op**.

---

## 7. Suggested PR shape
- **PR-1 (domain/data):** Step 1 + migration + store updates + invariant tests. Small, reviewable, no behaviour change to the controller yet.
- **PR-2 (behaviour):** Steps 2–5 (revision-aware materialise, atomic, tests) + controller delegation.
- Branch: `claude/slice8-pricing-quotation-revision`. One slice/PR per your convention.
