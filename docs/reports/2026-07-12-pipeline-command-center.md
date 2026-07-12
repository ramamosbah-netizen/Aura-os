# Sales Pipeline Command Center

**Date:** 2026-07-12 · **Branch:** `feat/pipeline-command-center`
**Why:** the last item in the commercial sequence. The pipeline had a board, list
and month forecast, but no manager's cockpit — no aging, no stalled detection, no
owner performance, no at-risk triage. This adds the analytics layer over the same
opportunities (no schema change).

## 1. `GET /crm/opportunities/pipeline`
New `PipelineCommandController` (literal route before `:id`). Computes, from
opportunities + activities + contacts:
- **Portfolio KPIs** — open deals/value, weighted forecast (Σ value × prob),
  average deal size, average age, 90-day win rate, won 90d value.
- **Weighted forecast** by expected-close month.
- **Pipeline aging** — buckets by age (0–14 / 15–30 / 31–60 / 60+ days).
- **Stalled deals** — open, aged ≥14d, no activity in ≥21d (or never touched),
  from the per-opportunity last-touch off the activity stream.
- **Owner performance** — open deals/value/weighted + 90-day win rate per owner.
- **At-risk deals + recommendations** — flags each open deal for: expected close
  passed · gone quiet · weak qualification (BANT < 2) · no decision-maker mapped
  (using the stakeholder roles). Emits a rule-based next-step recommendation,
  ranked by value × number of risk reasons.

## 2. Pipeline "Command" view (default)
A new first tab in the pipeline client (`crm-pipeline-client.tsx`), fetched
client-side: the portfolio KPI row, the **at-risk table** (deal → 360, value,
stage, owner, risk chips, recommended next step), pipeline aging bars,
owner-performance table, weighted forecast by month, and the stalled list. Board /
List / Forecast / Activities remain.

## 3. Verification (live, dev DB, :4310/:3310)
Endpoint returned the KPIs (open 2 deals / 325k, weighted 145k, 90-day win rate
100% over 8 wins / 782k), aging, owner rows (u-sales, unassigned), forecast, and
two at-risk deals with **distinct** recommendations — "Marina Retrofit" (close date
passed) → *Re-baseline the close date*; "SMOKE DnD" (quiet, unqualified) → *Log a
touch*. Browser confirmed the Command dashboard renders as the default view. api +
web builds green · SDK regenerated (687 ops). No migration (pure analytics).

## 4. Sequence complete
This closes the user's relationship-driven commercial roadmap: Contacts &
Stakeholders 360 → Opportunity 360 → Commercial Activity System → **Sales Pipeline
Command Center**, all on top of the deal chain (Account → People → Opportunity →
Tender/Direct → Quotation → Contract → Project).
