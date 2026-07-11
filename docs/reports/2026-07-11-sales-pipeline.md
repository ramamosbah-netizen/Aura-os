# Sales Pipeline Rebuild — Lead/Opportunity Separation + Optional Deal Chain

**Date:** 2026-07-11 · **Branch:** `feat/sales-pipeline`
**Why:** the pipeline page mixed Leads and Opportunities in one surface (KPIs said
"Won Deals: 3" while the empty state said "No leads yet"), and EVERY won opportunity
auto-created a Tender — wrong for direct sales, AMC renewals, variations and service
contracts. ~30% of a real pipeline.

---

## 1. What shipped

### The deal chain becomes OPTIONAL per deal (migration **0145**)
`Opportunity` grew `requiresTender` (default true), `ownerId`, `nextAction`. The
won→tender reactor now checks the flag: **`requiresTender=false` ⇒ no tender** — the
deal converts straight to a quotation via the existing `convert-to-quotation` endpoint.
The stage-changed event carries the flag; the path is chosen at creation ("Tender /
estimation" vs "Direct sale") and can be toggled on the card until the deal closes.
Architecture: `Account → Lead → Opportunity → [Tender/Estimation] → Quotation →
Contract → Project` — bracketed = optional.

### Honest KPIs (leads ≠ opportunities)
Total Leads · Qualified Leads · Active Opportunities · Pipeline Value · **Weighted
Forecast** (Σ value×probability) · Won Value · **Won This Month** (count · value) ·
**Win Rate** (won ÷ closed). The "3 won / no leads" contradiction is impossible now —
the two entities are counted and displayed separately.

### Board | List | Forecast | Activities
- **Board**: `New Leads → Qualified Leads → Discovery → Proposal → Negotiation → Won → Lost`.
  Lead cards: Qualify ✓ → "→ Opportunity" (creates a qualification-stage opportunity
  linked by leadId and marks the lead qualified). Opportunity cards show **Account ·
  Value · Probability bar · Expected close · Owner · Next action · path tag**
  (TENDER PATH / DIRECT SALE, click-to-toggle); Advance ▶ / Won ✓ / Lost ✗; won cards
  get "→ Quotation". Column headers carry count + stage value.
- **List**: separate Opportunities and Leads tables (stage select, AI forecast, path
  toggle, convert actions).
- **Forecast**: weighted pipeline grouped by expected-close month (+ unscheduled row,
  totals).
- **Activities**: the CRM activity log (new BFF `/api/crm/activities`).

### Bug fixed on the way
`OpportunityService.update` spread `...updates` without dropping undefined keys — a
sparse PATCH (e.g. `{stage}`) plus any explicitly-undefined field overwrote existing
values and 500'd on the NOT NULL `requires_tender`. Now filters undefined (the
account.service pattern).

## 2. Verification (live, dev DB)
Created "SMOKE Direct AMC renewal" (`requiresTender=false`, owner, next action) and
"SMOKE Tower ELV bid" (`true`); won both → **only the ELV bid produced a tender**
("Tender: SMOKE Tower ELV bid"); the AMC deal converted to quotation
`QT-OPP-… draft AED 9,450`. Board browser-verified: KPI row (Won This Month
5 · AED 249,000, Win Rate 100%, leads honestly 0), Won column cards showing
TENDER PATH / DIRECT SALE tags, owner, "Next: Send renewal quote", → Quotation.
crm 16 tests · builds green · migration gate green (145, @DOWN) · SDK 672 ops.

## 3. Notes
- Drag-and-drop on the board deferred (stage moves via Advance/Won/Lost buttons —
  same semantics, keyboard-friendly); a dnd pass is cosmetic.
- Lead→Opportunity conversion keeps the lead (status qualified) for funnel metrics.
- `winProbability` still defaults 20; the AI forecast per deal remains in List view.
