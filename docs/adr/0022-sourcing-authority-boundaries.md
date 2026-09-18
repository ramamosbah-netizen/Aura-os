---
id: adr_7c41e9d3
number: 0022
title: Sourcing authority — what recommendation, approval, award and order creation may each do
status: Accepted
category: Architecture
owner: Architecture
date: 2026-09-18
supersedes: []
related: [0004, 0011]
---

# ADR-0022 — Sourcing authority: recommendation, approval, award, order

- **Status:** **Accepted.** Written before SUP-13 and SUP-14 are named complete, deliberately.
- **Owner:** `@aura/procurement`.
- **Enforced by:** `modules/procurement/src/sourcing-authority.fitness.test.ts`, which fails on every
  boundary this ADR draws. A boundary that is only written down is a boundary that moves.

## Why this exists now

SUP-13 and SUP-14 both work end to end. That is the moment to draw the lines, not after: four acts
sit within a few hundred lines of each other, each producing something the next one relies on —

```
assemble candidates  →  RECOMMEND  →  APPROVE  →  AWARD  →  purchase orders exist
   (AURA)               (a buyer)    (a manager) (execution)   (money is committed)
```

— and every one of them is a plausible place to do a little more than it should. The award could
"just" fix a price. The recommendation could "just" rank by total. The order could "just" be raised
without a decision, because somebody is in a hurry. Each of those is one commit away at any time,
and none of them looks wrong in the diff that introduces it.

So for each act, three questions are answered here and nowhere else: **what authority it holds**,
**what irreversible facts it creates**, and **what it must never do**.

## SUP-13 — the recommendation and its approval

### Authority it holds

To record that a person chose these offers, for these requisition lines, for this reason, on values
normalised at a stated comparison date — and that a *different* person approved, rejected, returned
or stood down that choice. It holds the approval matrix check on the **actual award value**, on each
supplier's award and on the whole decision, so splitting a commitment cannot evade a limit.

### Irreversible facts it creates

| Fact | Why it cannot be taken back |
|---|---|
| The recommendation and its selections | Each selection names the **revision** the decision was made on. It is never re-pointed: a decision made on Rev 1 was a decision about Rev 1, and a newer revision makes it STALE rather than updated. |
| The decision — who, when, note | It is the record that somebody with authority accepted a commitment. `decided_by/at/note` are never overwritten, including by a withdrawal (migration 0356). |
| The withdrawal — who, when, why | A second fact ABOUT the decision, never a replacement for it. |

### What it must never do

- **Name a winner, or rank by price.** An ordering is a recommendation under another name.
  `lowestQuote` was deleted for exactly this.
- **Create a purchase order.** It does not import `PurchaseOrderService`, and must not.
- **Change an offer, a revision or a price.** Everything commercial is read.
- **Re-point a selection** at a newer revision. Staleness is reported; it is not repaired.
- **Let the submitter approve their own** recommendation.
- **Approve an amount beyond the approver's limit**, whole or split.
- **Accept an offer that is not recommendable** — no effective revision, a required line without a
  technical verdict or not compliant, an unknown whole-offer total, or an expired offer.

## SUP-14 — the award

### Authority it holds

To execute an **already-made** decision: turn an approved recommendation into purchase orders, one
per supplier, carrying each supplier's own currency, prices, discounts and terms. It holds no
commercial discretion whatsoever. Everything it writes was decided somewhere else and is copied.

### Irreversible facts it creates

| Fact | Why it cannot be taken back |
|---|---|
| Purchase orders, numbered, with lines | `procurement.po.created` reaches committed project cost and the quantity ledger. An order is an instruction to a supplier; unsaying it is a cancellation, which is the order's own governed act. |
| The recommendation becomes `awarded` | It is no longer live, no longer withdrawable, and cannot be awarded twice. |
| `procurement.sourcing.awarded` | The audit trail of which decision, on which comparison basis, produced which orders. |

### What it must never do

- **Decide anything.** It does not create, amend or approve a recommendation.
- **Award what is not approved**, or what has gone **stale** since approval.
- **Compute a price.** No FX, no conversion, no re-derivation. It imports no exchange-rate service,
  and must not. A USD 100 offer becomes a USD 100 order line.
- **Write the comparison value onto an order.** The normalised figure is a decision aid. Putting it
  on the order redenominates a contract into a currency the supplier never quoted.
- **Raise an order outside a recommendation**, or raise the same one twice. Each is idempotent on the
  recommendation and the selection.
- **Run for somebody without `procurement.rfq.award`.**

## The line between the award and the order

The award **raises** orders; it does not **own** them. Once raised, an order is the purchase-order
aggregate's: its status, its approval to issue, its receipt position and its cancellation are all
governed there, by `procurement.po.*`. The award never touches an order again.

This is why the award goes through `PurchaseOrderService.create` rather than writing rows: that is
what gives an order its number, emits its creation event, writes the audit entry and refuses an
unapproved supplier. An award that inserted directly would produce orders that existed and were
committed against nothing.

## What this ADR does not decide

- **Cancelling or amending an awarded order.** It is the purchase order's own lifecycle.
- **Re-sourcing after an award.** An awarded recommendation ends that RFQ's sourcing; whether a
  further requirement is a new RFQ or a new recommendation is not decided here.
- **Discount kinds beyond the line-level unconditional one** (PO-01). See `LINE_DISCOUNT_BASES`.
- **Bid-time estimate restamping** (BID-01), which is keyed to the retired legacy quote award.
