# Business Journey Audit — Tender Route, end-to-end inside AURA

**Date:** 2026-07-17 · **Method:** live E2E in the running app (UI only for every journey action; no external tools) · **Scenario:** "An invitation to tender arrives from Emaar — ELV package (CCTV, access control, structured cabling, BMS interface) for Creek Harbour Tower B. Bid bond required, submission due in 3 weeks."

Journey #2 under the rule: **measure AURA by completed business journeys, not by pages or modules.** Journey definition: Signal → Lead → Opportunity (tender route) → Tender → BOQ → bid decision → pricing → submission → won → **Contract**.

## The journey as executed (all inside AURA, one sitting)

| # | Step | Where | Result |
|---|------|-------|--------|
| 1 | Detect signal (Tender Discovery / Tender Detected / 75) | Radar → + Detect signal | Signal captured with evidence text; AI read "PROMOTE — strong 75%" |
| 2 | Promote → Lead | Radar card | Lead created, `signalId` lineage kept (the S3 PG fix from journey #1 held — 201, no 500) |
| 3 | Qualify & Convert | Lead 360 drawer | **Exact-match linked** existing Emaar Hospitality account; Opportunity opened (2.4M, **"Path after winning: Tender / estimation"** in the drawer — the route is chosen at convert) |
| 4 | → Tender (with provenance) | Opportunity 360 header | **BUILT DURING AUDIT** (blocker #1) — TND-2026-000001 created carrying title/value/account/deadline + `sourceOpportunityId`; progression footer shows Tender reached, linked |
| 5 | Bid Decision (Go/No-Go) | Tender page | **BUILT DURING AUDIT** (blocker #2) — 5 weighted criteria scored → **GO 74/100** (server-computed), persisted, shown with reasoning |
| 6 | BOQ line item | Tender page → Add Line Item | 1.1 IP CCTV 220 ea (import path exists but not exercised) |
| 7 | Rate build-up (internal pricing) | Pricing sheet | Material+wastage+accessories+transport+manpower → OH/risk/profit → sell AED 563,266, **margin 20.46%, 1/1 priced** (after blocker #3 fix) |
| 8 | Generate client quotation | Pricing sheet | QUO-2026-000001 draft 591,429 incl. VAT, `sourceTenderId` linked — zero re-entry |
| 9 | Submit Tender | Tender page | Gate passed (GO decision + priced + value) → **SUBMITTED**. When tried early, the gate correctly refused with reasons |
| 10 | Mark Won | Tender page | **WON → Contract auto-created** (`tenderId` linked, AED 2.4M draft) — the deal-chain reactor fired |

**Verdict: the Tender journey COMPLETES inside AURA** — after three blockers were fixed mid-audit. Provenance held at every hop: `signalId` → lead, `sourceOpportunityId` → tender, `sourceTenderId` → quotation, `tenderId` → contract.

## Gaps found (and status)

| # | Gap | Severity | Status |
|---|-----|----------|--------|
| 1 | **Opportunity→Tender hop didn't exist in-app** — no action anywhere to create the tender from the deal; the BFF stripped `sourceOpportunityId` (the Nest API accepted it); the progression's Tender node was inert. The journey's first hop required leaving the system's flow and losing provenance forever. | 🔴 blocker | **FIXED** — "→ Tender" header action on Opportunity 360 (tender route, deal open, no tender yet) posts title/value/account/deadline/`sourceOpportunityId`; BFF forwards the fields. Verified: progression picks the tender up, button disappears after. |
| 2 | **Bid decision (Go/No-Go) had no UI at all** — the submit gate demands it, but bid-scores was API-only (no BFF route, no page section). The journey dead-ended at submission with no way to comply. | 🔴 blocker | **FIXED** — bid-scores BFF + "Bid Decision (Go / No-Go)" panel on the tender page: 5 weighted criteria (0–10 sliders), notes, server-computed score → GO/CONDITIONAL/NO-GO badge, Re-score. |
| 3 | **PG date mapper corrupted `submissionDeadline`** — `String(pgDate).slice(0,10)` → `"Tue Sep 15"`, then *every subsequent tender UPDATE* (pricing save, status change, clarification deadline extension) died with a raw PG `invalid input syntax for type date`. Any tender WITH a deadline was un-updatable. Hidden until now because seeded tenders had null deadlines. | 🔴 blocker | **FIXED** — calendar-safe local-date mapping in `postgres-tender-store.ts` (API rebuilt+restarted; save/submit/won verified after). Journey-#1 lesson repeats, read-side this time: **PG stores need one E2E read→write cycle per column type.** |
| 4 | Tender gate 409s displayed as a bare "CONFLICT" pill — the server's rich verdict ("No Go/Conditional bid decision on record… Nothing is priced…") was thrown away (`d.error` instead of `d.message`). | 🟠 friction (UX-trust) | **FIXED** — status errors now surface the gate's message. |
| 5 | **Tender WON does not close the source opportunity** — the deal still reads "Qualification · Open · At risk" while its chain shows a live contract. The win never flows back (no reactor, no nudge); forecast and pipeline still count a deal that was already won. | 🟠 friction | OPEN — add tender.won → opportunity won (with winReason from the tender) reactor, mirroring S9's pattern. |
| 6 | **Tender-won contract bypasses commercial-baseline governance** — `quotationId: null`, `commercialBaselineId: null`, and value = tender.value (the 2.4M estimate), not the submitted bid (591,429 quote). On the direct path R3 forces approve→baseline→contract; on the tender path a draft quotation dangles while the contract materializes ungoverned. | 🟠 governance | OPEN — the won-reactor should run the quotation through its lifecycle (or take the submission's priced value) and stamp the baseline. |
| 7 | Radar doesn't refresh after Detect or Promote — the new signal (and the promoted state) appear only after a manual page reload; both POSTs return 201. | 🟡 polish | OPEN |
| 8 | Signal→Lead still drops what the signal knew (journey-#1 gap #2, re-confirmed): evidence → `requirement` null, TENDER_DISCOVERY source degraded to `campaign`, project name from the title lost, no contact person. The convert drawer's default title was "Emaar Hospitality — Emaar Hospitality". | 🟡 friction | OPEN — same fix as journey #1: promote carries evidence/title/estimate, 1:1 source mapping. |
| 9 | Advisor panel reopens on every page load and overlaps the tab row and header actions — it was dismissed 6+ times during this journey. | 🟡 polish | OPEN — remember dismissal for the session. |
| 10 | The tender header shows "Total Cost Estimate AED 2,400,000" while the pricing sheet says value 563,266 (1/1 priced) — two numbers for one tender with no reconciliation cue. | 🟡 polish | OPEN — reflect priced value (or label the delta) once a sheet exists. |

## What the audit proves about the architecture

- **The gate architecture is real** — the submit gate refused an unpriced, undecided bid with precise reasons, and passed the moment the evidence existed. Server-resolved verdicts (the WorkflowGate contract) mean preview and enforcement can never disagree.
- **The chain reactors extend to the tender path** — tender.won → contract fired unaided, with lineage.
- **The same two weaknesses as journey #1, in new places**: PG-store column handling that unit tests never exercise (last time: unbound params on UPDATE; this time: date corruption on READ→WRITE), and *visibility* — rules fired correctly but their verdicts, and the win itself, were invisible or unreflected where the user stands.
- **New this journey: path-asymmetry as a gap class.** Governance built on the direct path (R3 baselines) silently doesn't apply on the tender path. Journeys, not features, expose this — the feature "works"; the journey leaks.

## Journey Score

Six categories, 0–10 each, scored strictly from what the live run showed. **Overall = round(sum / 60 × 100).** End-to-End Completion is a gate, not a category.

| Category | Score | Evidence from this run |
|---|---|---|
| Automation | 7/10 | tender.won→contract reactor, sheet→quotation one-click, pricing engine live-computes. −3: the first hop had to be built mid-audit; the won→opportunity loop is missing. |
| Data Continuity | 6/10 | Provenance held at all five hops. −4: signal→lead drop (again), contract carries neither baseline nor the submitted bid's value. |
| Governance | 7/10 | Submit gate (bid decision + priced + value) enforced flawlessly. −3: R3 baseline governance bypassed on this path; contract from a draft quotation. |
| User Guidance | 6/10 | Gate verdicts now surface with reasons (fixed mid-audit from a bare "CONFLICT"). −4: nothing tells the user the won tender didn't close their deal; raw PG error surfaced during the bug window. |
| Zero Re-entry | 7/10 | Deal→tender carried title/value/account/deadline; sheet→quotation zero re-typing. −3: signal→lead re-entry (again); convert title re-typed. |
| Discoverability | 6/10 | Bid decision now lives on the tender page; pricing sheet one click away; opp progression walks the chain. −4: the won contract is invisible from the tender page; radar/list staleness hides created records. |
| End-to-End Completion | ✅ PASS | Signal → Contract, one sitting, UI only — after 3 blocker fixes. |

### Overall Journey: **65 / 100**

**The curve so far: Direct Sale 82 · Tender 65.** Reading: the tender path's rails and gates are solid; its points are lost to the *seams* — the untested first hop, the ungoverned last hop, and win-state that doesn't flow back. Gaps #5 and #6 alone are worth ~10 points and are both reactor-sized, not feature-sized.

Next journey: **Procurement** (PR → RFQ → PO → GRN), or re-run Tender after #5/#6 to verify the score moves.
