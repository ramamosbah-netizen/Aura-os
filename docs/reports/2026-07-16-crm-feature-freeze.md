# CRM Feature Freeze — 2026-07-16

**Status: the CRM Completion Sprint (C1–C9) is complete. The CRM enters Feature Freeze.**

This is the closing document of the sprint declared in
[the completion plan](2026-07-16-crm-completion-plan.md). It records what was built, proves it
against the live tree rather than asserting it, names what was deliberately left undone, and states
what Freeze means in practice. Every figure below was re-checked on `main` at the time of writing.

---

## 1. What Freeze means

From today, the CRM takes **no new features**. The only changes that land are:

- fixes for problems found in real use,
- the one known follow-up already filed (§4), and
- security or data-integrity corrections.

Anything that adds capability waits behind the 10-OS roadmap, which resumes with **Tender OS**.
Freeze is a decision about where effort goes next, not a claim that the CRM is flawless — §4 is the
honest list of what it is not.

---

## 2. The nine slices, verified

Each slice is one merged PR off `main`. "Verified" means the named files exist on `main`, the suite
is green, and the behaviour was exercised end-to-end over HTTP — not that the code was read and
believed.

| # | Slice | PR | Migration | Net-new surface |
|---|-------|----|-----------|-----------------|
| C1 | Lifecycle completion (G8+G9+G10+G11) | #121 | 0175 | lead `verified/assigned/qualifying`, `acceptedAt` + the 7th §8 reason, activity types (whatsapp/site-visit/…), `in_progress` lifecycle |
| C2 | Win Plan (§14 / G16) | #122 | 0176 | §14's ten narrative fields as one `winPlan` jsonb; size-aware coverage, derived never gated |
| C3 | Installed Base & White-Space (§26) | #123 | 0177 | per-account systems register + deterministic white-space findings → deduped Radar signals |
| C4 | Sales Workspace "My Day" | #124 | — | one page composing my meetings/work/leads/deals, derived per read |
| C5 | Source→Margin funnel (G15/§29) | #125 | — | Source → Wins → Contract Value → **Actual Margin**, honest about what it can't measure |
| C6 | Executive CRM (§7) | #127 | — | win/loss reason analysis + revenue concentration (the columns G5 made mandatory, finally read) |
| C7 | CRM automation (§8) | #128 | — | event→notification wiring + tenant-scoped sweep (route on facts, escalate once) |
| C8 | CRM AI (§9) | #129 | — | deal brief, email draft, meeting summary — advisory, facts-first |
| C9 | Polish + QA + this declaration | — | — | the freeze pass |

*(C1–C5 reached `main` together via #126, which landed the stacked chain; C6–C8 branched off `main`
directly. The stacked-merge lesson is recorded in project memory.)*

### QA gate (run on `main`, this pass)

| Check | Result |
|-------|--------|
| Workspace build | OK |
| Typecheck | 43/43 packages |
| CRM unit tests | 157 across 15 files |
| Full e2e suite | 102 across 23 files |
| CI on every slice PR | green (lint · typecheck · test · e2e · Playwright smoke · migration gate · restore drill · docker · gitleaks) |

Migrations run 0175→0177; each was applied to the live database when its slice shipped and re-runs
from scratch under the CI migration gate. The generated SDK carries 754 typed operations.

---

## 3. Two disciplines that held across all nine

These are why the slices compose instead of contradicting each other, and they are the things most
worth preserving through Freeze:

1. **One judge per question.** `leadAttention`, `opportunityAttention` and `winPlanCoverage` live in
   `@aura/shared` and are the *only* deciders of their questions. My Day, the pipeline cockpit, the
   automation sweep and the AI brief all *read* those verdicts — none re-derive them. A deal can
   never be at risk in one view and healthy in another.
2. **Derive, don't store; and never dress absence as data.** Every C-slice read (coverage, funnel,
   concentration, brief) is computed per request and stored nowhere, so it cannot drift. And each
   one names what it *cannot* see rather than defaulting it to zero: an undelivered win has no
   margin (not a 0% margin), an un-costed project is unmeasured (not free), a key-less AI provider
   returns *no* narrative (not an echo of its own prompt dressed as analysis).

---

## 4. Known gaps and deferrals — carried into Freeze

Freeze is honest or it is worthless. These are open, known, and intentionally not fixed in the
sprint:

- **Account-name snapshot on create (filed, in progress).** `opportunity.accountName` (and the same
  convention on tender/contract/project) is documented as a snapshot but is only written when the
  caller supplies it — a record created with just an `accountId` carries none, and readers that
  trust the snapshot render raw ids. C6 and C8 work around it by falling back to the live account
  name. A dedicated fix (with a `0178` backfill) is already underway in a separate task and will
  land as its own PR; it is **not** on `main` as of this freeze.
- **Automation is scheduler-driven, not self-scheduling.** `POST /crm/automation/run` is a
  tenant-scoped endpoint an external scheduler must call (mirroring `fleet/vehicles/check-expiry`).
  There is no in-app cron. This is deliberate — CRM tables are under RLS, so a cross-tenant
  background timer would read nothing — but it means "who calls the sweep, how often" is an
  operational setup step, not a code default. The once-only escalation contract depends on it.
- **AI narrative requires a configured model.** With no `ANTHROPIC_API_KEY` the brief returns facts
  and an honest "no model" note, and drafts refuse. This is the correct failure, but it does mean
  the narrative half of C8 is dark until a key is set.
- **UI surface for C4/C5/C6 was not visually verified in a browser** during the sprint — the local
  preview boots from the primary worktree. Those surfaces are covered by e2e on their payloads, by
  typecheck on the render, and by CI's Playwright smoke; they were not eyeballed. A pass with real
  seeded data is the natural first item of real-use feedback.
- **This audit covers model and rule coverage, not UX quality.** A field existing and a screen
  rendering is not the same as the flow being pleasant to use. Freeze explicitly invites
  usage-discovered fixes for exactly this reason.

---

## 5. What comes next

The CRM is the first fully-completed OS in the platform. Per the 10-OS roadmap, effort now moves to
**Tender OS**, then Procurement → Project-Execution → Finance → Asset/AMC → HR → Warehouse →
Exec-Intelligence → AI OS. The acquisition-to-margin loop the CRM now closes
(Signal → Lead → Opportunity → Won → delivered → Actual Margin → back onto the Radar) is the spine
those later OSes hang execution off.

Freeze holds until real use says otherwise.
