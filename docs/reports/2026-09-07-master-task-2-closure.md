# Master Task 2 — Closure Report

**Branch:** `fix/browser-suite-truthful-again` · 19 commits · 180 files · +1718 / −907
**Date:** 2026-09-07
**Status:** COMPLETE, pending PR review.

---

## What this task was asked to do

Two complaints, both of which turned out to be true in ways more specific than they sounded:

1. *"the ui and theme is not applied on all page"* — narrowed by the reporter to "ui in color, page architecture and navigation".
2. *"the user can use this app to manage sales, tender, pricing, projects from A to Z"*.

---

## Acceptance evidence

| Check | Result |
|---|---|
| Browser suite | **95 passed · 0 failed · 1 skipped** of 96, `retries: 0` |
| Database | Built **from zero**: `282 applied, 0 already current` |
| API/DB pairing | Proven by 4 independent facts (see *Method* below) |
| RLS fitness | 15 assertions pass after the new migration |
| Migration reversibility | `@DOWN` proven: column present → dropped → applied twice, no error → restored by `@UP` |
| `pnpm typecheck` | 51/51 tasks pass |
| `eslint` | 0 errors |
| Quality unit tests | 30/30 |

The one skip is `admin-control-center.spec.ts:141`, whose own title says the capability is *"still NOT built"*. It is an honest marker, not a hidden failure.

`retries: 0` is set deliberately in `playwright.config.ts:45` — *"a flaky test must stay a VISIBLE failure, never be masked by a retry"* — and no run in this task recorded a flaky or retried test.

---

## Delivered

### Theme — roughly 900 planted colours moved onto the design tokens

Six batches. The batch that mattered most revealed the sweep had been **scanning `apps/web/components` only**: route files under `apps/web/app` carry their own inline styles and had never been touched — 293 literals across 23 pages. On any page whose markup lives in the route file rather than a client component, the theme genuinely was not applied. The original complaint was accurate.

The login page is the sharpest case and the first thing every user sees: its sign-in button had `color: '#0b0e14'` hardcoded, correct on the dark theme's amber and wrong on the light theme's, where `--accent-ink` is `#ffffff`.

**A regression the codemod introduced, and its repair.** The rule mapped every `rgba(0,0,0,x)` to `--overlay` regardless of alpha. `--overlay` is the 62% modal scrim; most of what it replaced was a 0.06–0.2 surface tint. On the Copilot fab's `⌘J` chip that composited to exactly `#614312` over the amber accent — the colour axe reported — dropping contrast from **6.46:1 to 2.17:1**, below AA. 13 further sites had the same substitution; each is now classified by what it actually sits on (`--tint-ink` on the brand, `--panel-2` on a panel, `--overlay` kept only for the one real scrim).

Print and export surfaces are deliberately excluded: they render to paper, where the colour is the artefact rather than the theme.

### Navigation — six built capabilities that nothing linked to

A route that builds, renders and passes its own spec is still dead to the user if nothing links to it. Checking that direction produced 15 candidates; reading each left 5 defects. Reachability by real navigation went **193 → 199 of 208**.

- **Commissioning 360** — a 135-line detail page carrying witness, sign-off and the punch gate. The register listed every test and no row opened one.
- **Authority Compliance** — the Delivery suite's `owns()` already claimed the path, so the taxonomy expected the page in that suite, but no nav item existed.
- **Four print views built and never offered** — the pricing cost breakdown, the payslip, the goods receipt note, the subcontract agreement. A payroll run could be calculated and paid and never handed to the employee.

Ten candidates were **not** "fixed" after reading them: `/project/[projectId]/team` duplicates a tab that already exists; `/doccontrol/transmittals` is a thinner duplicate of `/documents/control`; the rest are compatibility redirects, where being unlinked is the point.

### The discipline lens now has effect where it has a control (AURA-P360-003, AURA-P360-004)

The lens select is rendered by the Project 360 shell, whose navigation links to `workspace/<section>`. `scoped()` was already re-attaching `?discipline=` to every one of those hrefs, so the parameter arrived and was dropped. The effect existed only on `/project/<id>/<area>`, which that navigation does not link to.

Sections now run their records through the **same** `filterAreaRows` the area register uses, so one selection cannot mean two things, and a banner says the view is filtered — without it the lens silently changes every number and a reader cannot tell a small count from a narrowed one.

Proving it exposed that NCRs carried no system at all, so the Quality section narrowed nothing. Migration `0282` adds `system text`, threaded through domain → store → service → API → BFF → form. **Nullable, not defaulted**: a default would make every historical NCR claim a system it was never assessed against, and the lens would then hide those rows — turning a gap in coverage into a gap in evidence.

Proven by **identity, not counts**, three consecutive runs 4/4:

| lens | CCTV NCR | fire-alarm NCR | unattributed NCR |
|---|---|---|---|
| none | shown | shown | shown |
| `?discipline=cctv` | shown | **hidden** | shown |
| `?discipline=fire-alarm` | **hidden** | shown | shown |

Plus the journey a person performs: raise through the form with System=CCTV, save, read the stored value back, find it under that lens and not under another.

### Five product defects fixed on the way

| | |
|---|---|
| `/crm` | "log the next step" now actually logs a next step |
| `/my-work` | the task editor no longer reopens on every action |
| Command Center | the activity feed no longer fails hydration — it read `Date.now()` during render, so server and client disagreed across a minute boundary |
| Radar | the Lead action works in list view |
| Internal chat | the composer no longer accepts a message it will throw away |

### Two lost-interaction defects, same family

Both are the failure `lib/use-hydrated.ts` was written for: *"the field looks filled while the component's state is still empty"*.

- **The discipline lens** — `setDiscipline` only navigates, so a choice made before the handler attached reached nothing and was reconciled away.
- **The chat composer** — a controlled input with Send disabled on `!text.trim()`, and nothing gating either on hydration. A message typed before React attached was discarded, leaving the box visibly full and the button dead with no explanation.

Both are classified as **product** defects on the stated rule: a timing defect is a test bypassing a readiness mechanism the product *has*. Neither had one.

The chat one only appeared under **full-suite load** — the file passes on its own, because hydration wins the race when nothing else competes. A retry would have buried it permanently.

### Test and tooling honesty

- **`meetings-workspace` could only tell the truth once.** Its final status assertion was a bare `getByText('completed')`, matching every completed meeting any earlier run left behind. Passed against a virgin database, strict-mode violation on the second run. Now scoped, verified by running twice against a dirty database.
- **The provisioner named the actor variables it had been leaving out.** Unset, specs fall back to `u-approver`, which CI's TIER-2 seeder creates and this script does not — so a local run got a 401 and reported it as two *permission* specs failing. A fixture gap wearing the name of a product defect.
- **`AURA-BUILD-001`** — `scripts/stale-dist-check.mjs` now refuses a typecheck that would read a dependency's stale `dist`.

---

## Method — and what it cost to get right

Three orchestration errors in this task produced readings that were wrong, and each was discarded rather than explained away. They are recorded because the corrected procedure is the durable output.

**1. DDL during a live suite.** `migrate` and raw SQL ran against the database a suite was using. Two specs failed (`commissioning-workflow`, `project-operations-workspace`); both pass on a clean run. The reading was thrown away.

**2. Measuring on a warm database.** The same specs gave 6 failed → 5 failed → 0 failed across three runs with no code change, because they need state they do not create and which earlier runs leave behind.

**3. A readiness check that could not tell live from dead.** The database was wiped and re-provisioned while the previous API still held `:4000`. `/health` answered 200 from that stale process and reported `282/282`, because the rebuilt database has the same migration count. Six chat specs and a global-setup `Invalid credentials` were artifacts of that — and were filed as a product gap before being disproved.

**The procedure that produces a truthful reading:**

    kill the pid LISTENING on the port — not `pkill` on a wrapper
    wait until the port is actually FREE — not merely unresponsive
    start, then assert: new pid + schema report + a real login + expected data state
    only then measure

**Two claims corrected mid-task, both on evidence rather than argument:**

- *"nothing in navigation reaches `/project/<id>/<area>`"* — false. Operations → Overview → Active execution links `/project/<id>/site`, and `site` has no static segment.
- *"the login contrast failure is pre-existing"* — false, and the reasoning was the instructive part: contrast was recomputed for the two **inks** against a background assumed unchanged. The background was the half that had moved. Measuring one side of a ratio proves nothing about the ratio.

**One fix reverted after implementing it.** The permit page's segregation-of-duties gate renders `ok: true` unconditionally, so the approve button stays enabled for the requester and the API refuses after the click. It looks like a defect; an existing spec documents the behaviour deliberately — *"the control does not depend on the page having reasoned correctly"* — and the change broke that spec, which was the correct outcome.

---

## Not in scope, carried to Master Task 3

- Supabase / login restoration — deferred by instruction until the evidence chain closed. It has.
- A-to-Z journey verification for sales, tendering, pricing and projects beyond what the suite covers.
- The reporter's own inability to sign in locally, unresolved.
- Open entries in the companion [gap findings](2026-09-07-master-task-2-gap-findings.md):
  `AURA-ENV-002`, `AURA-TEST-001`, `AURA-QUALITY-002`, `AURA-QUALITY-003`, `AURA-COMMS-002`,
  `AURA-AUTH-001`. Whether any becomes a G-2x row in
  [`docs/aura-audit/18-MASTER-GAP-REGISTER.md`](../aura-audit/18-MASTER-GAP-REGISTER.md) is that
  register owner's call.

The PR is not yet open: `gh` is not installed in this environment and no GitHub token is available, so it needs a person.
