# Retiring the per-controller try/catch→400 boilerplate

**Date:** 2026-07-07 · **PR:** #31 (`feat/error-taxonomy`, continuation)
· Verified against the live tree: `nest build` clean, 29 unit + 6 e2e API tests green, taxonomy fitness green, eslint on changed files 0 errors.

Follow-up #2 from the 2026-07-06 enforcement report. Now that `classifyDomainMessage`
(the global filter's taxonomy) is enforced by `error-taxonomy.fitness.test.ts`, the
per-controller `try/catch → BadRequestException((e as Error).message)` wrappers are dead
weight: they forced every domain error to 400 and hid the taxonomy's more-correct 404/409.

## What changed

| | Count | Notes |
|---|---|---|
| Trivial 400-rethrow wrappers removed | **98** | across **21** controllers |
| — via scoped codemod | 95 | exact `try { … } catch (e) { throw new BadRequestException((e as Error).message); }` |
| — by hand | 3 | comment-guarded (procurement `changePoStatus`/`approvePo`, stock `recordMovement`); stale `// … as a 400` comments removed |
| NotFound rethrow wrappers | **6 left untouched** | removing a forced-404 risks a 404→400/409 *regression*; out of scope for a cleanup pass |
| Net | **+388 / −780** lines | handlers collapse to a direct `return this.svc.x(...)` |

The codemod (throwaway, in scratchpad) matched only the exact trivial shape; its body pattern
forbids crossing a `} catch (` so a comment-guarded (non-matching) catch can't make a lazy
match bleed into the next method — a bug caught and fixed before apply.

## Behavior change (intended, per the recorded follow-up)

Removing a wrapper lets the raw domain message reach `classifyDomainMessage`. Messages that
were validation-class stay **400**; state-transition messages become the more-correct **409**,
absent-aggregate messages **404**. Concrete shifts now live:

- procurement `changePoStatus` / `approvePo` — approval-gate / under-level messages → **409 CONFLICT**
- stock `recordMovement` — "insufficient stock" → **409 CONFLICT** (was a forced 400)

No message regressed to **500**: the taxonomy fitness test scans every `throw new Error(...)`
literal through the real classifier and still passes (2-entry internal allowlist unchanged).

## Verification

- `nest build` (tsc via nest): clean.
- API unit suite: **29/29**; e2e suite: **6/6** (real Nest app + global filter).
- `error-taxonomy.fitness.test.ts`: **2/2** — no new 500-escape.
- eslint on the 21 changed files: **0 errors** (removed the now-unused `BadRequestException`
  import in `amc.controller.ts`; pre-existing `any`/`AuditService` warnings unrelated).
- Full monorepo `turbo run build`: **22/22** tasks.

## Remaining

- ~~The 6 `NotFoundException` wrappers~~ **DONE (commit `445ac17`)** — verified every underlying
  message contains "not found", so each classifies to the identical **404** through the taxonomy;
  removed behaviour-preservingly. All 104 wrappers (98 BadRequest + 6 NotFound) are now retired.
- ~~Server-side `evaluateForm`~~ **mechanism landed (commit `66d5e32`)** — `assertFormValid`; see
  `docs/reports/2026-07-07-server-side-form-enforcement.md`. Rollout to remaining endpoints ongoing.
