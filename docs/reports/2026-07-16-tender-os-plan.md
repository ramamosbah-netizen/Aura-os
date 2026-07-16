# Tender OS — the plan, verified against the live tree

**Date:** 2026-07-16 · **Decision:** with the CRM in Feature Freeze, the next OS on the 10-OS
roadmap is **Tender OS** (Estimating & Tendering, vision §2.2).

Same method as the CRM Completion Sprint: the vision's page/capability list is checked line-by-line
against code on `main`, most of it turns out to be already built, and the honest remaining work is a
short list of slices. Each slice = one branch/PR (migration where needed, domain, API, UI, e2e,
live-DB verify, SDK drift check). Every "exists / gap" call below was read off the tree, not assumed.

---

## 1. What the vision asks for (§2.2)

> Tender Dashboard · Tender Register (Invitations · Opportunities · Public · Private) · **Bid/No-Bid
> (AI)** · Tender Documents · **BOQ Import (Excel/PDF/OCR)** · Estimation (Material · Labour ·
> Equipment · Subcontract · Indirect · Overheads · Risk · Margin) · Vendor RFQ · Vendor Comparison ·
> Bid Review · Submission · Award Tracking · Lessons Learned.
>
> Emits: `estimating.tender.registered`, `estimating.bid.decided`, `estimating.quote.priced`,
> `estimating.tender.awarded`.

---

## 2. Gap map — vision vs `main`

| # | Capability | State on `main` | Gap |
|---|-----------|-----------------|-----|
| Register | Tender entity (`tender.ts`), account snapshot, deadline, `sourceOpportunityId` | ◐ | No **source classification** (invitation / public / private / opportunity), no clarification/addendum tracking |
| Bid/No-Bid (AI) | `bid-score.ts` — criteria, weighted score, `go/conditional/no_go` | ✅ built | **Not gated** into the lifecycle — a tender can be priced & submitted with no bid decision on record |
| BOQ | `boq.ts` + `pricing-csv.ts` (CSV in/out) | ◐ | Excel/PDF/**OCR** import missing; CSV only |
| Estimation | `estimate.ts` — rate build-up, resource breakdown, cost types `material/labour/plant/subcontract/other` | ✅ deep | The 8 named axes are **5 cost types** — Indirect / Overheads / **Risk** / **Margin** are not first-class layers on the estimate |
| Vendor RFQ / Comparison | `estimate-source.ts` + `estimate-sourcing.service.ts` (sourced unit costs, staleness) | ◐ | Overlaps Procurement RFQ; a comparison view is thin |
| Bid Review | — | ❌ | No pre-submission review / approval gate |
| Submission | `status: 'submitted'` (a bare enum value) | ❌ | No submission **record** — what was submitted, when, by whom, ref/portal |
| Award Tracking | `win-loss.ts` — outcomes, competitor bids | ✅ built | — |
| Lessons Learned | `buildWinLossAnalytics` (win rate, competitor stats) | ✅ built | — |
| **Lifecycle governance** | `changeStatus` accepts **any → any, no guard** | ❌ | **The backbone gap.** `draft → won` is legal with no bid decision, no priced estimate, no submission |
| Events | `created/updated/submitted/awarded/lost` | ◐ | Vision's `bid.decided` and `quote.priced` are not emitted |

**Read of the map:** the *pieces* are largely present and some are deep (estimation, bid scoring,
win/loss). What is missing is the **spine that orders them** — a governed lifecycle — plus a few
depth items (submission record, estimate margin/risk layers, richer register, real BOQ import).

---

## 3. The T-slices, in build order

The order is chosen the way the CRM audit chose R1/G5 first: **the backbone before the depth**, and
highest-governance-value / lowest-risk first. A tender that can't skip its own gates is the thing
every later slice leans on.

1. **T1 — Lifecycle + stage gates (the backbone). ✅ DONE.** The tender lifecycle is now
   `draft → qualifying → estimating → priced → submitted → won/lost` plus terminal `declined`
   (no-bid), governed by `checkTenderTransition` (mirrors CRM's `checkStageTransition`): cannot
   estimate without a Go/Conditional bid decision, cannot mark priced without a priced estimate,
   cannot submit without decision + price + value, cannot win/lose without a submission, cannot
   decline without a recorded No-Go. Retreats are always allowed. Emits `bid_decided` and `priced`
   (the vision's `bid.decided` / `quote.priced`). **No migration** — the gate reads the existing
   bid-score and estimate records as evidence; status stays a free `text` column. The deal-chain
   reactor now creates its auto-tender as `submitted` (a tender born from a won opportunity carries
   an already-submitted, winning bid), so the chain flows past the gate.
2. **T2 — Submission record.** What was submitted, when, by whom, against which addendum/portal —
   the fact `status: 'submitted'` only gestures at today.
3. **T3 — Estimation margin & risk layers.** Indirect / Overhead / Risk / Margin as first-class
   layers over the direct-cost build-up, so the bid price is a governed roll-up, not a hand figure.
4. **T4 — Register depth.** Source classification (invitation / public / private / from-opportunity),
   clarifications & addenda, the Tender Register/Dashboard views.
5. **T5 — BOQ import (Excel first).** Real spreadsheet import beyond CSV; PDF/OCR is a later stretch.
6. **T6 — Bid review gate + vendor comparison view.** The pre-submission review and a proper
   sourced-vs-live comparison surface.

T2–T6 are independent enough to reorder once T1 lands. BOQ OCR and the AI bid-scoring model tuning
are explicitly **stretch**, not blockers.

---

## 4. Proposed first slice: T1 — lifecycle + gates

Rationale: it is the same call that made the CRM coherent. Right now the tender lifecycle is the
pre-G5 CRM — `changeStatus` will move a tender anywhere. Everything downstream (submission, award,
win/loss learning) is only trustworthy if the states that precede it actually happened. T1 makes the
gates real, emits the two missing events, and needs one additive migration. Low risk, high
governance value, and it unblocks the ordering of everything else.

**Open question for confirmation before building:** is the lifecycle backbone (T1) the right first
slice, or is there a business-priority item (e.g. BOQ Excel import, or the estimation margin layers)
you want first? The gap map is stable either way; only the order changes.
