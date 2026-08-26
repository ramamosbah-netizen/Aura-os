# Opportunity 360 — Phase 0 Semantic Audit (read-only)

**Date:** 2026-08-25 · **Branch:** main @ `6b5731c7` · **Method:** code-path measurement + one live probe
**Changes made:** NONE (audit only — no app code, no DB writes, E2E record untouched)

## Method

Every row below is anchored to a real code path (`file:line`) that was read, not inferred. Where a live
value is quoted it comes from the single opportunity currently in the dev DB — the governed Won E2E
record `41aee1b0` (`value = 0`, `contractedValue = 33986.67`, `awardSource = quotation_accepted`).

Constraint acknowledged: the DB holds exactly **one** opportunity, so it cannot surface contradictions
that need legacy / lost / tender-route / multi-quotation deals. The audit is therefore code-path-driven;
any extra cases must come from unit fixtures or `BEGIN…ROLLBACK`, never from mutating the E2E record.

---

## THE ROOT CAUSE — one defect, four expressions

**"Not Applicable" and "Not Assessed" are collapsed into "Healthy" at four independent layers.**
This single conflation produces most of the reported contradictions. Measured:

| # | Layer | Evidence | What it does |
|---|-------|----------|--------------|
| 1 | Health engine | `shared/src/domain/opportunity-health.ts:230` | `if (terminal) { state = 'ON_TRACK'; }` — a Won/Lost deal is forced to ON_TRACK **while its score stays computed**. This is literally the reported "🟢 On Track · 18/100". |
| 2 | Attention rule | `shared/src/domain/crm.ts:562-563` | `if (!active) return { active, gaps: [], needsAttention: false }` — terminal deals short-circuit to *zero gaps*, indistinguishable from "assessed, no gaps". |
| 3 | Insights primitive | `apps/web/components/ui/record.tsx:160` | `InsightsPanel` accepts only `insights: Insight[]`; `length === 0` renders **"Nothing needs attention — you're on top of this one."** A caller has **no way** to say "not assessed" or "couldn't load". |
| 4 | 360 client rules | `apps/web/components/opportunity-360-client.tsx:367` | The qualification insight is gated on `outcome.status === 'open'`, so a Won deal emits none. |

**The causal chain, verified live on the Won E2E deal:** stage is terminal → (1) health says ON_TRACK,
(2) attention returns `gaps: []`, (4) client emits no qualification insight → the insights array is
empty → (3) the panel prints *"Nothing needs attention — you're on top of this one."*
…on a deal whose qualification is **1/4** and which has **no customer PO/LOA and no contract**.

This is the same defect class as **G-05 error semantics** (an empty result rendering identically to a
failure). The fix is the 5-state model, and — as G-05 taught — the tests must **assert the wording**,
plus a negative control.

**Blast radius of the primitive (#3):** `InsightsPanel` is consumed by exactly 3 record pages —
`lead-360-client.tsx`, `opportunity-360-client.tsx`, `quotation-360-client.tsx`. Fixing the primitive
fixes all three at once.

**Positive precedent — the codebase already knows how to do this.** The health engine carries an
`applicable` flag per dimension (`opportunity-health.ts:157,177,217`) and an `alignment.assessed` flag
(`:201`). So "not assessed ≠ healthy" is already modelled *inside* one engine; it is simply not
expressed in the states it returns, nor honoured by the other three layers.

---

## Concept matrix (measured)

| Concept | Current source | Evidence | Authoritative source | Verdict |
|---|---|---|---|---|
| **Award Value** | `opportunity.contractedValue` when `awardSource != null` | `opportunity-360-outcome.ts` | award provenance (accepted quotation → baseline subtotal) | **FIXED** (`6b5731c7`) |
| **Contract Value** | sum of non-cancelled contracts | `opportunity-360.controller.ts:138` (`contractSum`) | contracts (mutable via variations) | **CORRECT** — kept separate from award value |
| **Quoted Value** | `sum(quotation.total)` (VAT-inclusive) | `opportunity-360.controller.ts:141` | quotation totals | OK, but **naming is ambiguous**: quote total (35,686) vs award net (33,986.67) differ by VAT and are shown side by side without labels |
| **Deal Value (Deal Depth)** | `opp.value` | `opportunity-depth.controller.ts:113` | lifecycle-dependent: award value once won | **BROKEN** — reads 0 for the Won deal. Same class as the fixed `contractedValue`. |
| **Qualification** | 4 booleans, thresholds re-derived **client-side in 6 places** | `opportunity-360-client.tsx:224,243,339,367,374,450` | one server-side `QualificationState` | **BROKEN** — divergent cutoffs (`<2`, `===2`, `>=3`); line 450 labels 1/4 as *"early / unqualified"*, conflating **Unknown** (never asked) with **Unqualified** (assessed, failed) |
| **Deal Health** | real engine, 5 dimensions, weighted | `shared/src/domain/opportunity-health.ts` | keep the engine | **PARTLY BROKEN** — the engine is sound; the *state verdict* collapses terminal → ON_TRACK (`:230`) |
| **Attention** | server `opportunityAttention` **is** consumed by the client (`:223,365`) | `crm.ts:557-572`, client `:223,365` | unified rules over DealFacts | **PARTLY OK** — wiring is right; the rule returns nothing for terminal deals, and knows nothing about win-plan / contactability / documents |
| **Customer Buying Stage** | `opportunity.buyingStage`, nullable, set manually | `crm.ts:152`, `crm-opportunities.controller.ts:65` | buying journey | **UNVERIFIED** — `buyingJourneyAlignment(stage, buyingStage)` exists (`pipeline-command.controller.ts:143`) and the health engine already models `alignment.assessed`; needs a null-case probe |
| **Next Best Action** | server `resolveNextAction` + **client re-derivation** | `crm.ts:536`, client `:242-252` | unified rules | **FRAGMENTED** — server resolves it, client also invents its own (`nba`) |
| **Commercial Readiness** | governance facts (scope/estimate/pricing) | `pre-award-package.controller.ts` governance | pre-award package | **SOUND** — proven by the E2E; not yet surfaced as a readiness strip in the 360 |

---

## Recommended Phase 0 deliverables (still no UI work)

1. **The 5-state model** — `VerifiedHealthy | AttentionRequired | NotAssessed | NotApplicable | UnableToVerify`,
   with fixed wording per state, and `InsightsPanel` extended to take a *state*, not just a list.
   Highest leverage: one primitive, 3 pages, kills the false all-clear.
2. **`QualificationState` enum + lossy adapter** — `true → Confirmed (evidence: null)`,
   `false → Unknown` (never "Failed"). Zero migration; immediately removes the "unqualified" mislabel
   and lets Phase 1 build the summary card once against the final contract.
3. **`DealFacts`** — one aggregation contract feeding the deterministic rules, so no controller or client
   invents its own definition again (the mechanism behind both `contractedValue` and Deal Depth).
4. **Terminal-stage rule set** — a Won deal is not "on track" and not "nothing to do": it needs its own
   post-award rules (award evidence → PO/LOA → contract → handover).

### Split of findings

| Fix now (no migration) | Needs migration | Pure UI composition |
|---|---|---|
| `InsightsPanel` 5-state | Evidence-based qualification (`status/evidence/source/confirmedBy/confirmedAt`) — Phase 2 | Overview cockpit layout |
| Deal Depth award value | Win-plan tiering fields (Light/Standard/Strategic) — Phase 3 | 14 tabs → 6 areas |
| Health terminal state (`CLOSED`/not-applicable) | | Readiness strip |
| Qualification enum + adapter, computed server-side | | Stakeholder summary |
| Client stops re-deriving qualification / next-action | | |

### Deliberately deferred
The composite Deal Health **number** stays as-is until Phase 4. Its inputs are still moving; re-weighting
now would just reproduce "18/100 · On Track" with better arithmetic.

## Open question surfaced by the audit
Quote total (VAT-inclusive, 35,686.00) and award value (net, 33,986.67) are both displayed as money on
the same page with no label distinguishing gross from net. Decide the display convention before Phase 1.
