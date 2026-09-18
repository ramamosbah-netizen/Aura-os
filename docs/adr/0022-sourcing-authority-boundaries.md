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
**what facts it creates that may never be erased**, and **what it must never do**.

The middle one is deliberately worded that way rather than as "what it makes irreversible". Only one
act in sourcing is irreversible — raising the purchase orders — and calling a recommendation's
lifecycle irreversible would forbid transitions the business legitimately needs. What must survive
is the record that each act HAPPENED; the current status is a projection of those acts and moves as
they accumulate.

## SUP-13 — the recommendation and its approval

### Authority it holds

To record that a person chose these offers, for these requisition lines, for this reason, on values
normalised at a stated comparison date — and that a *different* person approved, rejected, returned
or stood down that choice. It holds the approval matrix check on the **actual award value**, on each
supplier's award and on the whole decision, so splitting a commitment cannot evade a limit.

### The facts it records, and the state it projects

The distinction matters more here than anywhere else in this ADR, and an earlier draft got it
wrong by calling the recommendation itself "irreversible". It is not. A recommendation is a
working record with a legitimate lifecycle — drafted, submitted, returned, approved, stood down —
and freezing that lifecycle in the name of auditability would block transitions the business
genuinely needs.

**What is immutable is that each act HAPPENED**, not the state the record is in now:

| Durable fact — never erased | Why |
|---|---|
| This recommendation was made, on these offers, on these revisions | Each selection names the **revision** the decision was made on, and is never re-pointed. A decision made on Rev 1 was a decision about Rev 1; a newer revision makes it STALE, which is something a person then acts on, not something the record quietly absorbs. |
| It was submitted, by whom and when | The maker's act. |
| It was decided — approved, rejected or returned — by whom, when, with what note | Somebody with authority accepted or refused a commitment. `decided_by/at/note` are never overwritten, including by a withdrawal (migration 0356). |
| It was stood down, by whom, when and why | A LATER fact ABOUT the decision, never a replacement for it (`withdrawn_by/at/reason`). |
| It was awarded, by whom and when | `awarded_by/at`, written by the claim that authorises the purchase orders (migration 0359). |

**`status` is none of those.** It is a projection of them — the current position, derived from what
has happened, and legitimately mutable as more happens. The rule is not "the status may never
change"; it is that **changing it never costs a fact**. A transition that would have to overwrite
one of the rows above is the thing this ADR forbids, and that is a much narrower and more useful
prohibition than calling the aggregate immutable.

The genuinely irreversible act in sourcing is one act, and it is SUP-14's: raising the purchase
orders. Everything before it is a record of deliberation.

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

### The facts it creates — and these ARE irreversible

| Fact | Why it cannot be taken back |
|---|---|
| Purchase orders, numbered, with lines | `procurement.po.created` reaches committed project cost and the quantity ledger. An order is an instruction to a supplier; unsaying it is a cancellation, which is the order's own governed act. |
| The recommendation becomes `awarded` | It is no longer live, no longer withdrawable, and cannot be awarded twice. |
| `procurement.sourcing.awarded` | The audit trail of which decision, on which comparison basis, produced which orders. |

### What "exactly once" means here, and how it is held

The award is where sourcing stops being deliberation and becomes money, so its correctness includes
what happens when two of them run at the same moment. None of these is hypothetical: two buyers
click Award in the same second, or a request is retried while the first attempt is still running.

| Must never happen | Held by |
|---|---|
| Two sets of purchase orders for one decision | An advisory lock on the recommendation, taken inside the transaction BEFORE anything is read; a conditional claim `approved → awarded` whose row count decides the winner; and a unique index on the recommendation selection (migration 0358) that makes a second order impossible even from a future code path that forgets the first two. |
| One supplier ordered from and the next not | One transaction around the whole award — orders, lines, events and the claim. It commits or it does not. |
| Orders that exist while the decision still reads unawarded | The same transaction: the claim is part of it. |
| An order placed on a revision that had already been superseded | The staleness check reads the confirmed revisions `FOR SHARE` inside the transaction, so a concurrent confirmation — which must supersede the current revision before it can promote the next past the partial unique index — waits. The check is true AT COMMIT, not merely when it was made. |

Proved in `sourcing-award.pg.test.ts` against real PostgreSQL with two connections, because none of
these failures can be reproduced in memory or by a sequential test however thorough.

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
