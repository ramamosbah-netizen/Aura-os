# §25 P3 — UI reachability audit (signal → close)

**Question:** is every journey transition actually *clickable* by a person, or only reachable through
the API? **Verdict: the whole journey is clickable.** Every governed transition the e2e tests drive
is exposed in the UI as a control that calls the *same* endpoint, gated by the *same* state, and in
several places the UI narrates the governance it is about to trigger.

Verified by component inspection (the button → endpoint wiring), a live check of the Radar in the
browser, and the existing browser specs that already cover the later stages.

## Per-stage reachability

| Stage | UI control | Wiring | Notes |
|---|---|---|---|
| **Signal → Lead** | `PROMOTE` button on the Radar | `components/signals-radar.tsx` → `/api/crm/signals/:id/promote` | Confirmed live: `/crm/radar` renders the signal with a promote verdict ("Strong 82% confidence — promote to a lead"). |
| **Lead → Opportunity** | qualify + a convert drawer | `components/lead-360-client.tsx` + `lead-convert-drawer.tsx` | Conversion readiness is read from the same `resolveIdentity` engine the backend converts with — the UI won't offer a convert the server would refuse. |
| **Opportunity → Quotation / Tender** | quotation and tender actions | `components/opportunity-360-client.tsx` | Both execution paths (direct sale, tender) are present, keyed on `executionType`. |
| **Quotation lifecycle** | status-gated buttons: **Review → Approve ✓ → Send → Accept ✓ → → Contract** | `components/quotation-360-client.tsx` → `/api/crm/quotations/:id/status` (and `/convert-to-contract`) | The full governed state machine, each button shown only for the status that permits it. The UI even hints the gate: *"Send is gated on approved — approving locks the commercial baseline."* |
| **Contract → sign** | status → `active` | `components/contract-360-client.tsx` → `/api/contracts/contracts/:id/status` | On signing, the UI says *"Contract signed — the Project is being created on the deal chain."* — it names the handoff it triggers. |
| **Project → activate → closeout → complete** | Closeout tab: readiness panel + finalize; status transitions | `components/project-360-client.tsx` + `project-closeout-wizard.tsx` | The component's own header: *"finalizing closeout + completing the project completes the source contract."* The UI drives the completion loop knowingly. |

## Governance is surfaced, not hidden

The UI does not merely expose the transitions — it *explains the gates before the user hits them*:
approval locks a baseline; send needs approval; a contract signature spawns a project; completing a
project completes its contract. This is the same governance the P2 tests satisfy the honest way, made
visible where a person acts. A control the server would refuse is generally not offered, so the screen
and the write agree.

## Existing durable browser coverage (not re-created here)

Two of the deepest UI surfaces already have Playwright browser specs, so P3 does not duplicate them:

- **Project closeout** — `apps/web/e2e/closeout-readiness.spec.ts` drives the Closeout tab in the
  browser: a per-domain readiness panel, a disabled Finalize button when blocked, and the clean close.
- **Resource planning** — the §22 Step 14 evidence walked the planning workspace in the browser
  (run → conflict → governed accept) on `/projects/schedule`.

## Recommendation

Reachability is proven at the component boundary and spot-checked live; the API journey itself is
locked by `journey-signal-to-close.spec.ts` (4 tests, both commercial paths + the loop). The one
optional follow-up worth its cost is a **CRM-front browser click-through** — Radar promote → lead
convert drawer → opportunity — to guard the front-of-journey UI against selector/flow regressions the
API tests cannot see. It is deferred here deliberately: the promote and convert flows are modal/drawer
interactions whose value as a durable test is real but whose selectors need stabilising first, and the
local disposable database's mid-session cycling makes browser-driven iteration unreliable until that is
addressed.

## Verdict

**P3 passes.** The full signal→close journey is reachable and clickable in the UI, wired to the same
governed endpoints proven end to end in P1/P2, with the governance surfaced at the point of action.
