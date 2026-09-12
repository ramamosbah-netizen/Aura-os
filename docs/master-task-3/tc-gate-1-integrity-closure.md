# TC-GATE-1-INTEGRITY-CLOSURE

**Scope:** the two confirmed T&C integrity defects, and nothing else. No new tabs, no Handover
change, no ITP / snag / training / dossier / O&M / certificate / scope-tree / asset-handoff
authority. Gate 2 not started.

**Delivered against:** `main`. Migration `0296`, applied and proven on the disposable database with
auth on.

---

## 1. The two defects, and what they now do

### Defect 1 — retest lineage

**Was:** `recordResult` mutated the test point in place. A point that failed and was retested became
`result: 'pass'` on the same row, `tested_at` overwritten, the failing remark replaced by the passing
one. A failure was visible only until it was corrected.

**Is:** a test point is a DEFINITION (point no, description, expected). Every execution is an
immutable **run**. Runs accumulate:

```
PL-034  Permanent link 034   expected ≤ 90 m        →  pass   (passed on retest)
  Run #1  fail   104.8 m   Over length at patch panel        2026-09-12 · u-admin
  Run #2  pass    71.2 m   Re-pulled through riser and re-tested
```

The point's `result` / `actual` / `remarks` / `testedBy` / `testedAt` are now a **derived snapshot**
of the latest run, kept so every existing reader still answers "where does this point stand" in one
read. `applyLatestRun` is the only thing that writes them.

### Defect 2 — tally bypass

**Was:** `PUT :id/test` took a typed `pointsPassed` that overwrote the tally `syncTally` derives from
the points, and `commission()` gated on that tally. Typing "2 of 2" over a sheet whose points had
failed made a failed system commissionable.

**Is:** two independent closures, because either alone leaves a hole.

1. `recordTest` **refuses** once the system has any test point: *"only a system without an itemized
   test sheet can have its tally entered by hand — CX-… has 2 test points; record results against
   them and the tally is derived"* (409). The path stays open for a system tested without a sheet,
   where a tally is the only record there is and contradicts nothing.
2. `commission()` **re-derives eligibility from the evidence** at sign-off, rather than trusting the
   stored tally: every point must exist and read `pass`. A point that stands failed or was never
   executed is named in the refusal — *"still failing (PL-034)"*, *"never executed (IMG-01)"*.

---

## 2. Schema changes

`infrastructure/migrations/0296_commissioning_test_runs.sql` — one new table, nothing altered or
dropped.

| Column | Notes |
| --- | --- |
| `id` | uuid pk |
| `tenant_id`, `company_id` | tenant scope, matching the sibling tables |
| `test_item_id` | the point this run executed |
| `commissioning_id`, `project_id` | denormalised, so a system's whole lineage is one indexed read |
| `run_no` | 1-based per point; `UNIQUE (test_item_id, run_no)` |
| `result` | `CHECK (result IN ('pass','fail'))` — a run is an outcome, never `pending` |
| `actual` | the value measured in **this** run |
| `remarks`, `tested_by`, `tested_at`, `created_at` | |

**Immutability is enforced by the database, not only by the service.** The table carries a SELECT
policy and an INSERT policy and nothing else, so no row is visible to UPDATE or DELETE.

One thing worth recording precisely, because the first version of the proof asserted it wrongly:
**PostgreSQL does not raise on those commands — the statement simply matches no rows and reports
zero affected.** The guarantee is identical (nothing can be rewritten or erased) but the failure is
*silent*, so code that "successfully" updates a run has updated nothing. The migration comment and
the test now both say so. This was caught by running the proof, not by reading the code.

The INSERT policy also requires the run's `test_item_id` to belong to a point of the same tenant, so
a run cannot be attached to another tenant's point by supplying its id.

**Backfill:** every existing point carrying a result becomes its run #1 (`tested_at` falling back to
`created_at`), so history does not start empty and a tested point never reads "never executed".
Points still `pending` correctly get no run.

**Pre-existing inconsistency noted, not touched:** `aura_commissioning_records.project_id` is `uuid`
while `aura_commissioning_test_items.project_id` is `text`. The new table follows the test-item
sibling it hangs off. Recorded as a gap rather than fixed inside this gate.

---

## 3. Authority decisions

| Decision | Rationale |
| --- | --- |
| **The run is the authority; the point's result is a projection** | One business truth, one writer. The snapshot exists for readers, and only `applyLatestRun` writes it. |
| **The latest run decides** | A point's standing is its most recent execution — not "ever passed", which would let a later regression hide behind an earlier success. |
| **A run's `actual` is taken verbatim, including null** | The old code carried the previous measurement forward, which printed a value beside a result that did not produce it. The earlier measurement is not lost: it is on its own run. |
| **A failing run must carry remarks** | Pre-existing rule, kept. A fail with no explanation is the one entry nobody can act on, and the retest that follows has nothing to answer. |
| **The tally derives, or does not exist** | Where a sheet exists, `syncTally` is its only writer. Where none exists, the manual tally remains the only record and is allowed. |
| **Sign-off eligibility reads the evidence** | The tally is a summary; a gate must ask the thing being summarised. |
| **No new authority created** | No ITP, no snag register, no training record, no certificate. Runs are test execution evidence, which T&C already owned. |

---

## 4. Compatibility impact

| Surface | Impact |
| --- | --- |
| `PUT :id/test-items/:itemId/result` | **Kept, same shape, same response.** Now appends a run instead of overwriting. Existing callers — including `commissioning-workflow.spec.ts` — are unchanged and still pass. |
| `POST :id/test-items/:itemId/runs` | New, preferred spelling. POST because it is not idempotent: sending it twice records two executions, which is what a retest is. |
| `GET :id/test-items/:itemId/runs`, `GET :id/test-runs` | New reads. |
| `GET :id/detail` | Gains `testRuns`. Additive; existing fields unchanged. |
| `PUT :id/test` | **Behaviour change.** Now 409s for a system with a test sheet. The register already surfaces API messages, so the refusal is visible where the control is. |
| `recordResult` (domain export) | **Removed**, replaced by `applyLatestRun` + `makeTestRun`. Internal to the module; the only caller was the service. |
| `CommissioningStore` | Gains `appendTestRun` / `listTestRunsForItem` / `listTestRuns`. Both adapters implement them; the in-memory one refuses a duplicate run number too, so a test that passes there cannot be one Postgres would reject. |
| Events | New `commissioning.test-run.recorded`, carrying `pointNo`, `runNo`, `result`, `actual`, `remarks` and `isRetest`. Nothing subscribes yet; it exists so the audit trail does not depend on reading a table. |
| `handover.accepted` → AMC, `warrantyStartDate` | **Untouched and re-verified.** No change to the deliver → maintain flow. |

---

## 5. UI adjustment

Confined to what the integrity change requires, plus the one control without which it would be
unusable.

- **`components/commissioning-test-sheet.tsx` (new)** — the test sheet now renders each point with
  its run lineage beneath it, oldest first, and badges a point that reads pass having once failed as
  **"passed on retest"**. The static table it replaces could only show one result per point, which
  is the defect rendered in HTML.
- **Recording a run** lives on the same component. Results were API-only before, so with lineage but
  no control the retest half of the workflow would be invisible to the people doing the testing. A
  commissioned record shows no control at all.
- **Nothing else changed.** The register's manual-tally control is untouched; it now surfaces the
  409 the same way it surfaces every other refusal.

---

## 6. Tests

| Suite | What it proves |
| --- | --- |
| `modules/commissioning/src/domain/test-punch.test.ts` | Run validation (result, remarks on fail, run numbering); the latest run decides by number not array order; an unexecuted point is not a pass; the snapshot takes the run verbatim. |
| `modules/commissioning/src/test-integrity.test.ts` (new, 10 cases) | The full service path: failure survives retest; lineage on the 360 payload; every run audited with `isRetest`; tally refused with a sheet, allowed without one; sign-off blocked while failing, blocked while unexecuted, allowed after retest; signer/witness and punch gates still hold. |
| `modules/commissioning/src/test-run-immutability.rls.pg-int.test.ts` (new, 8 cases) | **Against real PostgreSQL as `aura_app` (asserted NOSUPERUSER/NOBYPASSRLS):** RLS enabled + forced; exactly `{SELECT, INSERT}` policies; append works; UPDATE affects 0 rows and the failure survives; DELETE affects 0 rows and the row survives; duplicate run number refused; invisible to another tenant and with no tenant bound; a run for another tenant's point refused. |
| `apps/web/e2e/commissioning-test-lineage.spec.ts` (new) | The browser proof — §7. |
| `apps/web/e2e/commissioning-workflow.spec.ts` | Unchanged, still passes: the compatibility check on the old `PUT …/result` spelling. |

**Full run:** every workspace suite green (apps/api 396, modules/projects 425, modules/crm 427,
modules/finance 258, … commissioning 39 + 8 pg-int), `pnpm typecheck` 51/51, web unit 182/182,
production `next build` clean, and `rls-fitness.mjs`: *247 tenant-scoped tables · enabled 247 ·
forced 247 · with-policy 247*.

---

## 7. Browser evidence

Signed in as `u-admin`, auth on, against the disposable database (`health.environment =
"e2e-disposable"`, 296/296 migrations applied). Every step below is an assertion in the spec, driven
through the real UI:

| Required proof | Result |
| --- | --- |
| Run #1 FAIL recorded and visible | ✓ `run-PL-034-1` shows `fail`, `104.8 m`, "Over length at patch panel" |
| A failing run must explain itself | ✓ fail with no remarks → refused, message surfaced in the UI |
| Manual tally cannot contradict the sheet | ✓ `PUT :id/test` → **409**, "only a system without an itemized test sheet…"; page still reads `0/2 points passed` and the point still reads `fail` |
| Commissioning blocked while a point fails | ✓ "still failing (PL-034)", status unchanged |
| Corrective / retest path | ✓ run #2 recorded through the UI |
| Run #2 PASS, latest authoritative | ✓ point reads `pass`, measured `71.2 m` |
| Historical failure remains visible | ✓ run #1 still `fail` with its reason and its measurement, and a **"passed on retest"** badge on the point |
| Blocked while a point was never executed | ✓ "never executed (IMG-01)" |
| Signer + witness still required | ✓ sign-off with a blank witness refused |
| Eligible only after valid passing evidence | ✓ commissioned once both points passed; sign-off line names the witness |
| Both runs remain queryable afterwards | ✓ on the commissioned record the lineage still renders, and `GET :id/test-runs` still returns the failure |
| Commissioned record is immutable | ✓ no record-run control on a commissioned system |

The screenshot in the closure evidence shows a **commissioned** system still displaying Run #1 fail
above Run #2 pass — the exact state that was previously unrepresentable.

---

## 8. Remaining gaps (not in this gate)

1. **`project_id` type mismatch** between `aura_commissioning_records` (uuid) and the test-item /
   test-run tables (text). Pre-existing; noted in §2.
2. **No UI to add test points.** The sheet can be executed from the browser now, but points are still
   created API-only, so a sheet cannot be authored from the app. This is the natural Gate-2 item.
3. **`fail(record, reason)`** still sets the record's status directly, independently of the points.
   With the sheet as the authority it is now a second, weaker way to say "failed" and should either
   derive or be retired — a small authority question, deliberately left for review.
4. **No defect linkage yet.** A failed run does not create or reference a punch item / Quality NCR.
   The directive's `Run #1 FAILED → Defect → Corrective action → Run #2 PASSED` chain has its first
   and last links proven here; the middle link is Gate-2 work, and must REFERENCE Quality's NCR
   authority rather than create a second one.
5. **Witness is still a name, not a state.** `witnessedBy` is captured at sign-off; the proposed
   Planned → Ready → In Progress → Witnessed → Accepted lifecycle is not built.
6. **The new event has no subscriber.** Deliberate: it is an audit fact today, and a hook for Gate 2.

**Gate 2 not started. Awaiting review.**
