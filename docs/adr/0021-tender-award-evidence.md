---
id: adr_0b1b455a
number: 0021
title: Tender Award Evidence and Governed Won Provenance
status: Accepted
category: Architecture
owner: Architecture
date: 2026-08-27
supersedes: []
related: [0020]
---

# ADR-0021 — Tender Award Evidence and Governed Won Provenance

- **Status:** **Accepted and implemented** (migration 0253). The precedence question below is now
  DECIDED — see "Precedence — DECIDED".
- **Date:** 2026-08-27 (proposed and accepted the same day, implemented as one slice)
- **Relationship to [ADR-0020](0020-qualification-record-and-award-snapshot.md):** follow-up, and —
  on the value question — **semantically superseding**. See "The conflict" below.
- **Owner:** `@aura/tendering`. CRM only *consumes* the evidence.
- **Implemented in:** `@aura/tendering` (domain + service + stores), migration 0253, the CRM award
  reactor, and the Opportunity 360 money labels.

## This is not an added field

The purpose of this ADR is a **change of source of truth**:

> from an **inferred commercial award value** to a **customer-evidenced award value**.

Reading it as "the Tender aggregate gains a few more columns" misses the decision entirely, and
would produce an implementation that quietly keeps the old semantics behind new fields.

## The conflict (the reason this ADR exists)

There are now **two different answers** to "what was this tender awarded at?", and they are not
guaranteed to agree:

| Source | What it actually is | Shipped? |
|---|---|---|
| **Approved Commercial Baseline** (behind the tender's decided quotation) | what **we** approved and offered — the same figure the auto-created Contract inherits (G-50) | **YES** — shipped by the ADR-0020 follow-up, and today's source of `contractedValue` on a tender award |
| **`TenderAwardEvidence.awardedValue`** | what the **customer actually said they awarded** | **NO** — proposed here |

The two figures **may** be equal. Nothing guarantees they are. The first is an *approved offer*; only
the second is an *award*. Today's behaviour therefore infers an award value from a commercial
document of our own — defensible as an interim step, but it is not the same claim.

### Precedence — DECIDED

```
TenderAwardEvidence.awardedValue
        |
   present and proven
        --> THE authoritative Award Value

Approved Commercial Baseline
        |
   remains the approved offer / commercial baseline
        --> does NOT automatically become a customer-awarded value
```

**Consequence, implemented deliberately:** a tender with **no** `TenderAwardEvidence.awardedValue`
stays **`LEGACY_WON`** — *even when it has an Approved Baseline*. This was a deliberate change to
shipped semantics, made as one slice, and it is asserted by a dedicated test (see the acceptance set,
row 14).

**The two concepts are separated, not ranked.** The baseline was NOT demoted to a fallback for the
award value; it kept its own job and stopped doing one that was never its own:

| | Approved Commercial Baseline | Tender Award Evidence |
|---|---|---|
| Means | our approved **offer** / commercial basis | what the **customer awarded** |
| Governs | the **Contract** value + `commercialBaselineId` (G-50) — *unchanged* | the **deal's** `contractedValue` + `awardSource='tender_award'` |
| Resolver | `findTenderBaseline`, still called by the contract reactor | `tender.awardEvidence`, read live by the close reactor |

Measured before the change: the dev database held **0 tenders and 0 tender-route wins**, so no
existing record was demoted by this.

## Context — why no existing field can be promoted

The audit finding that settles the model: AURA holds no field that means "what the customer
awarded".

| Field | What it actually means |
|---|---|
| `Tender.value` | *Estimated bid value* — mutable, ours |
| `TenderSubmission.submittedValue` | what **we** bid |
| `TenderOutcome.ourBidValue` | what **we** bid |
| BOQ / estimate totals | our cost or price build-up |

Promoting any of them recreates the defect class the Opportunity 360 semantic programme removed: a
number presented with a confidence its provenance does not support.

## The model

```ts
type TenderAwardEvidence = {
  awardedValue: number;          // excl. VAT — the Award Value
  currency: string;
  awardedAt: string;
  awardReference: string | null; // PO / LOA / Award Letter ref
  evidenceDocumentId: Id | null; // DMS document, when one exists
  capturedBy: Id;
  capturedAt: string;
};
```

**`Tender.status = won` is NOT a Documented Tender Award.**

```
Tender Won + valid AwardEvidence          Tender Won + awardEvidence = null
        |                                          |
tendering.tender.awarded                   LEGACY_WON / "Award not evidenced"
        |                                          |
Opportunity:                               INTENDED OUTCOME, not a failure —
  awardSource        = tender_award        AURA holds no authoritative figure
  contractedValue    = awardedValue        and will not invent one. Visible,
  awardedAt          = evidence.awardedAt  never hidden.
  awardedQuotationId = null
        |
resolveDealOutcome()  -->  GOVERNED_WON
        |
Qualification-at-Award snapshot (ADR-0020)
```

### What counts as evidence

**Minimum structured evidence = money + currency + awardedAt.**

`awardReference` and `evidenceDocumentId` are important *provenance*, but deliberately NOT part of
basic correctness in the first release: a genuine award can exist without a clean reference number,
and refusing it would push real awards back into the legacy path. Making them mandatory by policy or
deal size is a later, separate decision.

## Invariants — enforced in the DOMAIN, not only the UI

1. `awardedValue` is finite and `>= 0`. **Zero is a valid value**; absence is `null` (THE ZERO RULE).
2. `currency` is REQUIRED whenever Award Evidence exists.
3. `awardedAt` is REQUIRED.
4. `tender.value`, `submittedValue`, `ourBidValue`, BOQ and estimate totals are NEVER a fallback.
5. Once used to close an Opportunity, Award Evidence is **immutable or versioned** — a historical
   Award Value must never change silently. ADR-0020's snapshot trigger is the precedent to follow.
6. `awardedQuotationId` stays `null`: the decision source is the Tender Award, not a quotation
   revision.
7. `resolveDealOutcome` does NOT change and gains NO tender special case. Provenance stays one rule.

## Write flow — one command, one transaction

The governed path must NOT be "close the tender, then add evidence later":

```
Award Tender command
  |- validate award evidence
  |- persist evidence
  |- transition tender --> won
  \- emit tendering.tender.awarded
```

all inside a single transaction, so no window exists in which a deal is Won while its award evidence
is half-captured. A legacy/manual tender close without evidence must be a **separate, explicit
path** — never the same command silently ignoring the fields.

## Event payload

`tendering.tender.awarded` carries enough facts to be self-describing:

```json
{ "tenderId": "...", "awardedValue": 0, "currency": "AED",
  "awardedAt": "...", "awardReference": null, "evidenceDocumentId": null }
```

…but the reactor **re-reads the live Tender before updating the Opportunity** rather than trusting
the payload — the same rule as Slice 9.

## Acceptance set (minimum)

| # | Test |
|---|---|
| 1 | Tender award with valid evidence → Opportunity `GOVERNED_WON` |
| 2 | `contractedValue === awardedValue` |
| 3 | `opportunity.value` never leaks into `contractedValue` |
| 4 | Differing bid / submission / BOQ totals do not affect Award Value |
| 5 | `awardedValue = 0` works |
| 6 | No Award Evidence → stays `LEGACY_WON` |
| 7 | Missing `awardedValue` / `currency` / `awardedAt` → the governed command REJECTS |
| 8 | Replay of the same award is idempotent |
| 9 | A competing / changed award does not silently overwrite provenance |
| 10 | Transaction rollback → no half-written Tender Award, no partly-Won Opportunity |
| 11 | Qualification-at-Award snapshot is captured with NO tender-specific logic |
| 12 | Fresh-connection PG read proves Tender evidence + Opportunity provenance |
| 13 | Money surfaces show **Quoted Total (incl. VAT)**, **Award Value (excl. VAT)** and **Contract Value** as separate values |

| 14 | A tender with an Approved Baseline but **no** Award Evidence stays `LEGACY_WON` — while its contract still inherits that baseline |

All 14 are implemented: the tendering half in `modules/tendering/src/tender-award-evidence.test.ts`,
the end-to-end deal chain through the real reactor in
`apps/api/src/events/cross-module-subscriber.test.ts`, and the database half in
`modules/tendering/src/tender-award-evidence.pg-int.test.ts` (gated on `CRM_PG_TEST_URL`).

## Implementation notes (decisions taken while building)

1. **`changeStatus(id,'won')` is REFUSED.** An audit of every caller found no production path that
   needs an unevidenced win, so rather than leaving a second, ungoverned road to `won` beside
   `award()`, the generic status flip rejects it and names the governed command. This is what makes
   "an `awarded` event always carries award evidence" true by construction.
2. **No `closeWonUnevidenced()` was invented.** Nothing needed it. Unevidenced wins remain reachable
   exactly where they legitimately occur — historical rows, and the deal-chain auto-tender that is
   BORN `won` via `create()` — and they read `LEGACY_WON`, which is the honest answer rather than a
   failure. Adding a speculative command would have created the very parallel path this ADR closes.
3. **`version` was added to the payload**, beyond the seven fields sketched above. The ADR called for
   evidence that is "immutable **or** versioned"; this does both, following ADR-0020's precedent, so
   `readTenderAwardEvidence` can REFUSE a payload it cannot fully parse instead of rendering a
   half-understood award as a customer award.
4. **Three boundaries, one rule** for the award amount — `@Min(0)` on the DTO,
   `makeTenderAwardEvidence` in the domain (which every internal caller hits), and a CHECK constraint
   in 0253 for direct SQL. The pattern migration 0252 established for `win_probability`.
5. **Money vocabulary applied on the 360.** `outcome.contractedValue` carries two different measures
   depending on lifecycle, and both were labelled "Contracted". It now reads **Award Value
   (excl. VAT)** when the award is documented and **Contract Value** otherwise.
