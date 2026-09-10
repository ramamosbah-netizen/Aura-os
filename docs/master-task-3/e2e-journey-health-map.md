# End-to-end journey health map — Signal → Close

**Goal:** get the full app working from signal/radar to project close. This maps the actual state of
every handoff, from live verification against the running stack, the demo seed, and the code.

**Headline:** this is **not a from-scratch build**. The whole lifecycle is already architected, wired
via events, gated by proper state machines, and has UI at every stage. The tender path and the front
entry are **proven working live**. What remains is verifying the two paths not yet walked click-through,
closing a short list of known gaps, and locking the whole journey behind an end-to-end test.

## The journey, stage by stage

| # | Handoff | Mechanism | Backend | UI | Verified |
|---|---|---|---|---|---|
| 1 | Signal/Radar → Lead | `POST signals/:id/promote` | ✅ wired | `/crm/radar` | ✅ **live** (201) |
| 2 | Lead → Opportunity | assess → `PATCH :id {status:qualified}` → `POST leads/:id/convert` | ✅ | `/crm/leads`, `/crm/opportunities` | ✅ **live** (201, opp value 1.5M) |
| 3a | Opportunity → Tender | `POST opportunities/:id/start-tender` | ✅ | `/tendering/*` | ✅ **demo** (2 tenders) |
| 3b | Opportunity → Quotation | `POST opportunities/:id/convert-to-quotation` | ✅ | `/crm/quotations/*` | ✅ **live** (201, draft) |
| 4a | Tender won → Contract | event `tendering.tender.awarded` → `createContractFromBasis` | ✅ | `/contracts/*` | ✅ **demo** (won → active contract) |
| 4b | Quotation accepted → Contract | action chain → `accepted` → `convert-to-contract` / `crm.quotation.accepted` reactor | ✅ wired | ✅ | ⚠️ wired; not yet walked to a contract live |
| 5 | Contract signed → Project | event `contracts.contract.signed` → auto-create project | ✅ | `/project/[id]` | ✅ **demo** (Marina Tower project) |
| 6 | Project → Complete | `PATCH projects/:id/status` (planned→active→completed) + §27 closeout gate | ✅ wired | `/project/[id]/*`, closeouts | ⚠️ gated; completion not yet walked live |
| 7 | Complete → Contract complete → Renewal signal | events `projects.project.completed` → complete contract + raise `RENEWAL_DUE` signal (loops to Radar) | ✅ wired | — | ⚠️ wired; loop not yet walked live |

## What the live walk proved (before the disposable DB cycled)

- **Signal → Lead → Opportunity works end to end**: create signal (201) → promote → lead (201) →
  record assessment → `PATCH {status:qualified}` → convert → opportunity (201, `direct_sale`, 1.5M).
- **`convert-to-quotation` works** (201, draft quotation).
- **The demo seed materialized the tender path live**: accounts → opportunities → 2 tenders (one
  `won`) → 1 `active` contract → project *"Marina Tower ELV Delivery"*.

## What looked like breaks but are correct gates (not bugs)

The walk first "failed" at three points; each was the journey **correctly refusing a shortcut**:

- **Lead can't convert while `new`** — qualification is a deliberate two-part act: `PATCH
  :id/qualification` records the assessment (the engine only *recommends*), and the human act is a
  separate `PATCH :id {status:qualified}`. Correct.
- **Quotation status is action-driven**, not a free set: `submit_review → approve → send → accept`.
  `convert-to-contract` refuses anything but `accepted`. Correct governance.
- **Project can't jump `planned → completed`** — it must go `planned → active`, then complete through
  the §27 closeout-readiness gate. A project with no delivery cannot be closed. Correct.

So the state machines are sound; the journey enforces its own integrity.

## Genuine gaps to close (prioritized)

1. **P1 — Prove the whole loop click-through, and lock it.** No single automated test walks
   signal→close. Build one authenticated end-to-end test (the repo has the e2e harness) that drives
   both paths — direct-sale (quotation→contract) and tender — to a project and through completion to
   the renewal signal. This turns "wired" into "proven" and guards against regression. *(Also flushes
   out 4b/6/7, the three handoffs not yet walked live.)*
2. **P2 — Confirm/finish the two unwalked handoffs** the test will exercise: quotation→accepted→
   contract (direct sale), and project active→closeout→completed→(contract complete + renewal signal).
   If either has a real break, fix it.
3. **P3 — Reachability in the UI.** Confirm each transition is actually clickable, not just an API:
   the quotation action chain (submit_review/approve/send/accept), lead qualify, project activate and
   closeout. Any transition that exists only in the API is a journey gap for a real user.
4. **P4 — Known deferred hardening** (already tracked): §22 loose ends (AURA-PM-004 steps 2–3, per-
   project calendar into planning, resource labels); procurement sourcing lineage (PROC-GAP-03, the
   RFQ→PO hole) if the delivery sub-flow matters; the flaky fitness tests (AURA-FIT-001).

## Environment note

The local disposable Postgres (`aura-dev-postgres`, tmpfs) **cycles and wipes itself** — it lost all
data mid-session, which crashed the API on reconnect. Re-provision restores it
(`node apps/api/scripts/provision-local-db.mjs`), but the instability is why live walking is fragile
and why the P1 automated test (which seeds its own fixtures per run) is the right way to prove the
journey, rather than a hand-driven walk.

## Recommended next step

Start **P1**: an authenticated signal→close end-to-end test. It is the single highest-value artifact —
it proves the full journey works, pins the exact break if one exists, and becomes the regression guard
that keeps "the full app from signal to close" true as the code changes.
