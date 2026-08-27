# Playwright CI — the "dead suite" was three stale specs, not an aborting web server

**Date:** 2026-08-28 · **Status:** 🟢 CURRENT · **Branch:** `main` · **Tree at:** `2d309feb`

Both Playwright jobs had been red on `main` for 12+ consecutive runs. This report records what was
actually failing, corrects the measurement that made it look far worse than it was, and describes the
fix that turns both jobs green.

---

## 1. The reported premise, and why it was wrong

The investigation was opened on this measurement:

> Failing spec **FILE** count in `web smoke (Playwright — TIER-2)`: 23 on every run, identical set
> every time. TIER-3 fails the same set.

**23 is the total number of spec files in `apps/web/e2e`, not the number failing.** The `list`
reporter prints a line for *every* test — `✓` passed, `✘` failed, `-` skipped — so counting unique
`*.spec.ts` filenames in the job log always returns the whole suite. It was constant across runs
because it is a property of the directory, not of the results.

The real counts, read from the `N failed / N passed` summary line of each run:

| Run | TIER-2 | TIER-3 (required gate) |
|---|---|---|
| 32967103366 | 5 failed / 69 passed | — |
| 32991199900 | 3 failed / 71 passed | 3 failed / 71 passed |
| 33044744076 | 3 failed / 71 passed | 3 failed / 71 passed |
| 33058974519 | 7 failed / 67 passed | 3 failed / 71 passed |
| 33059920580 | 3 failed / 71 passed | 3 failed / 71 passed |
| 33064618130 | 3 failed / 71 passed | 3 failed / 71 passed |

Not identical, and never 23. The suite was never dead — it was running ~95% green and failing a
small, mostly fixed set.

### `[WebServer] Error: aborted` is benign

The `uncaughtException: Error: aborted` / `code: 'ECONNRESET'` lines were read as the web server
crashing and cascading into the suite. They are not. In run 33064618130 they appear between tests
**46 and 48**, inside `offline-sync.spec.ts` — the spec whose subject is *"a browser killed mid-sync
resumes on reopen"*. It kills a browser mid-request on purpose; Node reports the half-read request as
`aborted`. Tests 47, 48 and 49 pass immediately afterwards, and `smoke.spec.ts` (which only asserts
`status < 500`) passes at test 61. **The server never went down in CI.**

For completeness: a Next dev server *did* die during one local reproduction run on Windows
(`net::ERR_CONNECTION_REFUSED` on :3100, 12 cascading failures). That is a local resource failure
under load, and it is what the reported signature would look like if it were real. It does not
happen in CI.

---

## 2. What was actually failing

Three specs failed in **6 of 6** TIER-2 runs and **5 of 5** TIER-3 runs, with zero variance:

| Spec | Cause | Introduced |
|---|---|---|
| `email-workspace.spec.ts:180` | Asserted a 7th Communication section, `contacts`, that was never built | `1393ed82` (2026-08-26) |
| `global-shell-home.spec.ts:6` | Asserted the pre-IA topbar nav (`Home/Projects/Suites/Reports/Admin`) | `d80d40ad` (2026-08-22) |
| `spine-journey.spec.ts:185` | Drove `/crm/leads` for an Opportunity create drawer that had moved — and then been orphaned | `d80d40ad` (2026-08-22) |

These are **deterministic**, and that is the point the triage kept missing. Issue #235 lists exactly
these three specs as examples of *flake*. They are not flake — flake varies, and these did not. They
were filed under a "flaky suite" heading and therefore never read as a standing red.

TIER-2 additionally carries a genuinely varying tail on top of the three — `compliance` ×4 in one
run, `user-onboarding:14` and `spine-journey:230` in another. **That** is the real subject of #235.

### 2.1 A real product regression, not just stale tests

`spine-journey.spec.ts:185` was reporting a live defect.

`d80d40ad` split Sales into its own pages: `/crm/leads` became a leads-only workspace and
`/crm/pipeline` became the deal board. In the process, `sales-pipeline-workspace.tsx` stopped being
imported by anything — and it was the only importer of `crm-pipeline-client.tsx`, a 68 KB component
holding the **only** `entity="Opportunity"` create drawer in the app.

Verified by import graph over `apps/web`:

- `app/crm/pipeline/page.tsx` → `pipeline-workspace.tsx` (live, no create path)
- `sales-pipeline-workspace.tsx` → `crm-pipeline-client.tsx` — **nothing imports the former**

So from 2026-08-22 there was **no UI path to create an Opportunity anywhere in the product**. The
spec was right and the app was wrong. Both files remain in the tree and are still being edited —
`crm-pipeline-client.tsx` was last modified on 2026-08-26 by `47ad5f67`, i.e. active development on
unreachable code.

A second defect surfaced once the drawer was restored: `PipelineWorkspace` seeded its list with
`useState(opportunities)` and never adopted the prop again, so `router.refresh()` after a save was
inert. Drag-and-drop hid this — its optimistic write already showed the new stage — but a *created*
deal simply never appeared until a hard reload.

---

## 3. The fix

| File | Change |
|---|---|
| `components/pipeline-workspace.tsx` | Restored the Opportunity `CreateDrawer`; adopt refreshed `opportunities` instead of shadowing them; added `pipeline-tab-board/list` and `opportunities-list` test ids |
| `app/crm/pipeline/page.tsx` | Read accounts for the drawer's account picker |
| `e2e/spine-journey.spec.ts` | Drive `/crm/pipeline`, the page that now owns the deal board |
| `e2e/email-workspace.spec.ts` | Assert the six sections that exist; Contacts recorded as an open gap rather than asserted |
| `e2e/global-shell-home.spec.ts` | Rewritten against the current suite taxonomy (see below) |

`global-shell-home.spec.ts` had stale assertions well past the line that was failing, invisible
because the run stopped at line 37. All were corrected against a live run:

- sidebar labels → the real taxonomy (`My Work / Communication / Sales / Pre-Award / …`)
- `/suites` launcher count → **12**, not 10
- the `/suites/workplace-collaboration` block → that suite no longer exists (`findSuite` returns
  null, the route 404s) and **no suite populates `featured`**, so the "Workplace shortcuts" rail it
  asserted never renders for any id. Replaced with the same intent — honest capability reporting —
  against the Communication suite, which still declares WhatsApp `NOT IMPLEMENTED`
- restricted-viewer launcher → **2** (the two ungated centers), plus a negative assertion that a
  gated business suite is absent
- **a vacuous negative control fixed:** `getByRole('link', { name: 'Admin', exact: true })
  .toHaveCount(0)` had matched nothing for *any* actor since the link was renamed `Admin Center`, so
  the assertion that a viewer cannot see Admin had stopped measuring anything

---

## 4. Verification

Run locally against an in-memory API on :4100 with auth engaged — the TIER-2 posture
(`health.schema.applied: null`, `auth/status: enabled: true`).

| Gate | Result |
|---|---|
| Browser suite (all 23 spec files) | **76 passed · 1 skipped · 0 failed** |
| `pnpm typecheck` | 51/51 tasks |
| `pnpm lint` | **0 errors**, 648 warnings (baseline) |
| `pnpm --filter @aura/web build` | pass |
| `@aura/web` tests | 131/131 |
| `@aura/api` tests | 311/311 |
| `@aura/crm` tests | 386 passed / 34 skipped |
| `@aura/core` tests | 276/276 |

Each fix was preceded by an observed failure of the same assertion, so every change has its own
negative control in the run log.

`pnpm test` (i.e. `turbo run test`) **is red**, and unrelated to this work: `@aura/web` fitness tests
took 37.3 s under turbo versus 3.3 s standalone, and every package passes standalone. That is the
parallel-load flake — see §5.

---

## 5. Three separate problems, previously filed as one

Issue #235 had accumulated three unrelated failures under one "flaky" heading. They need separating
because each closes on different evidence:

1. **Playwright flake** — varying specs, varying runs (`compliance` ×4, `user-onboarding`,
   `spine-journey:230`). Unproven cause; the on-demand-compilation hypothesis is still the live one.
   *This is what #235 should keep.*
2. **Deterministic dead specs** — the three above. **Fixed by this work.** Not flake, and calling it
   flake is why it survived 12 runs.
3. **`turbo run test` parallel-load flake** — unit suites fail under turbo and pass standalone.
   Different pipeline, different mechanism. Belongs in its own issue.

---

## 6. Should these jobs be required gates while broken?

**TIER-3 is already a required merge gate and was permanently red** — its only three failures were
the deterministic ones fixed here. That is the more serious half of the problem: a required gate
that always fails teaches everyone to merge past red, which is precisely what #235 was opened to
prevent.

The recommendation is therefore **not** to relax either gate:

- **TIER-3 (required): keep it required.** It is deterministic — 3 failed / 71 passed, identical in
  all five runs examined — and it is now green. A deterministic gate is exactly what a required gate
  should be.
- **TIER-2 (not required): leave it not-required for now.** Its varying tail is real and unfixed. It
  should become required only under #235's existing definition of done — N consecutive green runs on
  one unchanged commit.

---

## 7. Open items this surfaced

- **Communication → Contacts is not built.** `ViewId` has six members and there is no
  `view === 'contacts'` branch; `1393ed82` shipped as "A11-partial". The spec no longer asserts it.
- **Dead code with active edits.** `crm-pipeline-client.tsx` (68 KB) and
  `sales-pipeline-workspace.tsx` are unreachable from any route and should be deleted or re-wired
  deliberately — not left to absorb further commits.
- **`featured` is dead on `AuraSuite`.** The field and its rendering branch in
  `app/suites/[suiteId]/page.tsx` exist; no suite populates it.
