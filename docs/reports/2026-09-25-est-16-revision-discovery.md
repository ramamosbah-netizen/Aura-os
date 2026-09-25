# EST-16 — estimate revision and freeze: what a revision is today, measured, and the smallest design

2026-09-25. Discovery only — **no code changed.** Measured against the running API with auth on,
PostgreSQL rebuilt from zero, and the shipped roles.

## The definition

> Freeze and revise the complete estimate in the UI; compare versions, retain approver/reason and
> prove the awarded basis points to one immutable revision.

The frozen ownership model this must keep: **the estimate owns the calculation; commercial approval
governs the selling decision; the quotation consumes the approved revision** — and an *estimate
revision* is not the same thing as a *submitted quotation revision*.

## What already holds

| Clause | State | Evidence |
|---|---|---|
| Freeze on review | **Holds** (step 4, `e2611252`) | Submitting for review seals the costing; re-pricing under review or after approval is refused 409. |
| Freeze while committed | **Holds** | With the offer `sent`, re-pricing: *409 tender pricing sheet is locked … the costing behind a committed price is immutable.* |
| A review has two outcomes | **Holds in the API** | `return_for_revision` needs a reason, is append-only against the revision, and is refused to the preparer. |
| Approver retained | **Holds** | The commercial baseline records `lockedBy`/`lockedAt`; measured `lockedBy u-e2e-qs2`. |
| Awarded basis is immutable | **Holds in the model** | The award pins `commercialBasis` (baseline id + quotation id) at the moment of award (ADR-0021); the baseline is an immutable snapshot of the offer's lines, its internal pricing and its **estimation** — the estimate as it was approved. |

## What is broken — measured

```
generate           QUO-2026-000002 rev 0   97,787.34
submit, RETURNED   "Re-rate the camera against the Gulf Security offer"   (u-e2e-qs2)
re-price           201
generate again     QUO-2026-000003 rev 0   93,607.92      <- a NEW number, no link to 000002
QUO-2026-000002    still a live DRAFT at 97,787.34        <- the old estimate, and the return reason, stranded on it

approve 000003     baseline rev 0  93,607.92  lockedBy u-e2e-qs2
send               re-price 409 (locked — correct)
revise             201 -> QUO-2026-000003 rev 1 draft 93,607.92   (no reason asked)
re-price           201 (unlocked: rev 0 is now 'revised')
rev 1 total        93,607.92   <- a COPY of rev 0; the re-priced estimate never reaches it
```

1. **Regenerating forks the offer.** Every "Generate quotation" creates a new quotation number. A
   returned offer is re-priced into a *different* offer, while the returned one stays a live draft at
   the old figures, carrying the reviewer's reason. Two drafts for one bid, and the chain that would
   let anyone compare them does not exist.
2. **A revision does not follow the estimate.** Revising a sent offer copies its lines. Once the copy
   exists the sheet unlocks, the estimator re-prices, and the revision keeps the old figures — the
   estimate and the offer drift apart with nothing saying so. That is the quantity-and-value agreement
   rule broken on the commercial side: a revision that goes for approval priced from an estimate that
   no longer exists.
3. **A revision records no reason.** A return costs a reason; a revise does not.
4. **Nothing on screen reaches these acts.** The quotation page has no *Return for revision* (the API
   has it), shows no review history, and its *Revisions* tab lists chips with no comparison. The tender
   does not show the basis an award pinned.

## The smallest design (for the programme owner to freeze)

**A — one offer per tender, revised rather than regenerated.** When a tender already has a generated
offer, *Generate* produces its **next revision** from the current estimate — same number, revision
+1, `parentQuotationId` set, the previous one superseded (`revised`) and kept immutable. A draft that
has never been submitted is refreshed **in place** instead, so re-pricing before anyone reviewed
anything creates no revision noise. After a first submission, every change is a revision.

**B — for a tender offer, revising re-prices.** The CRM copy-revise stays for direct and opportunity
offers. For a tender-sourced offer, *Revise* supersedes the sent revision and unlocks the sheet; the
next revision's figures come from the estimate through *Generate* (A), never from a copy — the
estimate owns the calculation.

**C — a revision costs a reason.** Revising a committed offer requires a reason, recorded
append-only against the revision it supersedes, beside the review decisions (who, when, why).

**D — compare versions, server-side.** A comparison of two revisions of one offer, computed in the
domain and rendered by the screen: per BOQ item (matched by `sourceItemId`) quantity, unit price and
line total, and from the frozen estimation direct cost and selling rate; totals; and for each revision
who approved it, who returned it and why, and why it was revised. No figure computed in the browser.

**E — on screen.** *Return for revision* with its reason on the Approval tab for the reviewer; the
review and revision history on the Revisions tab with the comparison; *Revise* asking for its reason;
the tender showing the awarded basis (offer, revision, approved by and when) with a link to it.

**Proof, when built:** a shipped-role browser run — prepare, submit, return with a reason, re-price,
generate Rev 1 of the SAME offer, compare Rev 1 with Rev 0, approve, send, revise with a reason,
re-price, generate Rev 2, approve, award — with the award's basis read back as Rev 2's baseline and
Rev 0 and Rev 1 unchanged in PostgreSQL.

## Built while the decisions are open

The parts that do not depend on them, proved in `apps/web/e2e/tender-offer-review-award.spec.ts`
(shipped roles, auth on, PostgreSQL):

- **Return for revision, on screen.** The Approval tab carries the second review outcome with its
  reason. The preparer who tries it is refused in the server's words; the independent reviewer returns
  the offer and it is back in draft, read back.
- **The review history.** Every return with who, when and why against its revision, and the approval
  with who and when, on the Approval tab.
- **The award names its revision.** The tender reads *Awarded on QUO-… Rev 0 — approved by …*, linked
  to that offer, and the pinned basis is read back as that revision's baseline.
- **Readiness asks what submission asks.** Found on the way: readiness omitted the transition gate, so
  it reported ready without a bid decision and the screen enabled a submission the server refused. It
  now evaluates the same gate against the same value `submit` uses; the button is disabled and says
  why until the bid decision exists.

Not built: A, B, C and D above — they wait on the decisions below.

## Decisions needed

1. **A:** after a first submission, is every change to a tender offer a new revision of the same
   offer (same number), with only a never-submitted draft refreshed in place? *(recommended)*
2. **B:** for a tender-sourced offer, does *Revise* hand the figures back to the estimate — the next
   revision regenerated from it — instead of copying the previous revision's lines? *(recommended)*
3. **C:** does revising a committed offer require a recorded reason, like a return does? *(recommended)*

None of these changes who may do what. They decide what a revision of a bid **is**.
