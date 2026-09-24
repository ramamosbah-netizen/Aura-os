# Estimate & Pricing — frozen discovery and contract assessment

**Date:** 2026-09-24 · **Scope:** the 19 EST capabilities and their dependencies in Sales Intake,
Technical Study, Commercial Approval and Tender Submission · **Status:** discovery only. No code
was changed and no capability was promoted.

Everything below was measured against the running API with **auth ON**, against the migrated
**PostgreSQL** database, driving **shipped roles**. One representative tender was traced end to
end: `TND-513246` — *Al Reem Tower, ELV systems package* for Aldar Properties, tender id
`3dd06c46-9d08-4b11-a2c8-050d6bad71c0`.

---

## 1. Capability inventory and missing acceptance layers

All 19 carry **eight missing layers each**. Not one has a single layer proved.

| ID | Capability | Status | Frozen DoD (abridged) |
|---|---|---|---|
| EST-01 | Quantity take-off lineage | PARTIAL | Take off by drawing/spec/location/work package, preserve revisions, reconcile every estimate line to approved technical scope |
| EST-02 | Material quantities and unit costs | PARTIAL | Enter resource quantities, save/reload, approve revision, reconcile internal sheet and customer output **without leaking internal cost** |
| EST-03 | Labour and productivity | PARTIAL | *(same DoD)* |
| EST-04 | Engineering hours | PARTIAL | *(same DoD)* |
| EST-05 | Equipment plant and access | PARTIAL | *(same DoD)* |
| EST-06 | Subcontractor costing | PARTIAL | *(same DoD)* |
| EST-07 | Logistics and landed cost | UNVERIFIED | Representative role executes it in the canonical authority |
| EST-08 | Wastage and consumables | PARTIAL | *(same as EST-02)* |
| EST-09 | Risk and contingency | PARTIAL | *(same as EST-02)* |
| EST-10 | Delivery overhead | PARTIAL | *(same as EST-02)* |
| EST-11 | Supplier quotation source | UNVERIFIED | Representative role executes it |
| EST-12 | Technical comparison | UNVERIFIED | Representative role executes it |
| EST-13 | Commercial comparison | UNVERIFIED | Representative role executes it |
| EST-14 | Margin versus markup | PARTIAL | Persist and render cost/margin/markup/discount **consistently** on internal sheet and customer offer |
| EST-15 | Discount and selling price | PARTIAL | Governed margin/markup and discount; approval thresholds hold; customer offer reconciles to the frozen sheet without exposing cost |
| EST-16 | Estimate revision and freeze | PARTIAL | Freeze and revise **in the UI**; compare versions; retain approver/reason; awarded basis points to one immutable revision |
| EST-17 | Internal approval | PARTIAL | Commercial/Technical/Management approvers review the **same frozen build-up** under SoD/threshold rules |
| EST-18 | Customer technical and commercial proposal | PARTIAL | Generate, approve, issue and **download** branded proposal PDFs from the frozen study/estimate |
| EST-19 | Awarded quantity continuity | **WRONG_BEHAVIOR** | Reject mismatched source quantities; approved change creates a traceable revision |

Six of the ten PARTIAL rows (EST-02…EST-10) share **one identical DoD sentence**. They are not ten
independent capabilities at the acceptance layer — they are ten cost categories inside one
build-up that must save, reload, freeze and reconcile. That matters for slicing: proving the
sheet once proves most of them, and pretending otherwise would be ten promotions off one run.

**Dependencies.** Sales Intake: INT-01…06, five PARTIAL and INT-04 WRONG_BEHAVIOR. Technical
Study: STU-01…08, three PARTIAL, three UNVERIFIED, STU-03 WRONG_BEHAVIOR. Commercial Approval sits
across CRM quotations and `Commercial and finance` (COM-01…10, none complete). Tender Submission
output sits in `Documents and exports` (OUT-01…09, none complete, OUT-05 WRONG_BEHAVIOR).

---

## 2. Entities, tables, routes, screens, permissions and calculation owners

**Tables** (all empty before this trace): `aura_tendering_tenders`, `_boqs`, `_boq_items`,
`_rate_buildups`, `_estimate_sources`, `_submissions`, `_clarifications`, `_bid_scores`,
`_outcomes`; `aura_crm_pricing_sheets`, `_estimate_revisions`, `_estimate_build_ups`,
`_quotations`; `aura_pricing_sources`, `aura_pricing_calibrations`.

**Calculation owners — and there are two engines in `shared`, both claiming to be the one.**

| Engine | File | Loadings | Selling decision | Margin definition |
|---|---|---|---|---|
| **A** | `shared/src/domain/estimation.ts` → `estimateLine` | overhead, risk, warranty, contingency — **each on direct cost, independent** | `sellFromMargin(totalCost, targetMargin)` | `(sell − totalCost)/sell`, overhead counted as **cost** |
| **B** | `shared/src/domain/estimation-core.ts` → `computeCostBuildUp` + `computeCommercialPricing` | indirect + overhead on direct; **risk compounds on (direct+indirect+overhead)** | `target_margin` or `markup`, plus discount | `grossProfit/sellingPrice`, overhead counted as **cost** |

Engine A's header says it *"lives in `shared` because CRM quoting AND Tendering estimation must
compute the same way — one engine, not two that drift."* Engine B exists and Tendering uses it
through the legacy adapter `computeBuildUp`. **The same four percentages produce different totals
in the two engines**, because A applies risk to direct cost and B compounds it.

`tenderBuildUpToEstimationLine` bridges B → A by converting every persisted **amount** back into a
percentage of direct cost. The conversion is careful and it does preserve the money — but its
existence is the proof that the two engines are not interchangeable.

**Screens.** Four pricing surfaces. Three consume the server engine correctly:

- `pricing-workspace.tsx` — imports `estimateLine` from `@aura/shared` and runs the real engine.
- `estimation-workspace.tsx` — renders server totals, computes nothing.
- `package-pricing-workspace.tsx` — figures from `computeCommercialPricing`, by its own comment.
- **`tender-pricing-client.tsx` — zero engine references. It reimplements the entire build-up in React** (`preview()`, lines 177–196): supply, wastage, manpower, direct, indirect, overhead, risk, profit, selling, sellingRate **and margin**.

**Authority map, measured rather than read off the catalogue:**

| Act | Permission | Holder | Measured |
|---|---|---|---|
| Create tender | `tendering.tender.create` | r-sales-manager | — |
| Create study | `tendering.study.create` | r-pre-sales | **201 as `u-e2e-presales`** |
| Approve study | `tendering.study.approve` | r-technical-manager | **201 as `u-e2e-techmgr`; author refused 403** |
| Create take-off | `tendering.takeoff.create` | r-pre-sales, r-estimator | **201 as `u-e2e-presales`** |
| Approve take-off | `tendering.takeoff.approve` | r-technical-manager | **201 as `u-e2e-techmgr`** |
| Project to BOQ | `tendering.takeoff.project` | r-estimator, r-sales-manager | **403 for all four shipped actors** |
| Price a line | `tendering.estimate.update` + `internal-pricing.access` | r-estimator | **403 for all four shipped actors** |
| Generate quotation | + `crm.quotation.create` | r-estimator, r-commercial-manager | **201 as `u-e2e-qs`** |
| Approve the offer | `crm.quotation.approve` | r-commercial-manager | **403 for the preparer, by name** |
| Submit the tender | `tendering.tender.submit` | r-sales-manager | **403 for all four shipped actors** |

---

## 3. The actual end-to-end path

The canonical chain is real, properly ordered and properly gated:

```
tender → technical study → APPROVED (technical manager, author refused)
       → quantity take-off → APPROVED (technical manager)
       → project-to-BOQ    → BOQ carries sourceBasisRevisionId
                              + sourceRevisionRef "technical-study:S-001:RFP Rev 0"
       → price the line    → per-unit build-up persisted
       → generate quotation → subtotal 117,804.00 · VAT 5,890.20 · total 123,694.20
       → submit_review     → internal_review
       → APPROVE           → ✗ BLOCKED
```

A take-off cannot be created without an approved technical study — measured:
*"an approved technical study is required before creating the scope / quantity take-off basis"*.
The BOQ is not free-typed; it is **projected from an approved take-off** and carries the revision
reference it came from. That is EST-01's lineage, and it exists.

**The quotation reconciles to the estimate.** Tender selling value `117,804.00`; quotation subtotal
`117,804.00`; the difference to `123,694.20` is 5% VAT. *(An earlier reading of mine compared the
VAT-inclusive total against the net estimate and called it a mismatch. It is not one.)*

---

## 4. Competing calculations

**Finding 4.1 — "Margin" means three different things on one screen, and the stored figure is the
wrong one.** Measured on the traced tender:

```
direct 88,798.80 · indirect 3,552.00 · overhead 7,104.00 · risk 2,983.20
profit 15,366.00 · selling 117,804.00 · stored marginPercent 19.07%

stored / screen header   (overhead + profit) / selling  = 19.0741%
shared core              (selling − cost)    / selling  = 13.0437%
screen line column       (selling − direct)  / selling  = 24.6216%
```

`modules/tendering/src/domain/estimate.ts:285` defines `marginPercent` as
`(totalOverhead + totalProfit) / totalSellingValue`, commented *"blended margin"*. Delivery
overhead is money the company **spends**; counting it as margin **overstates the real gross margin
by 6.03 points** on this tender. The screen prints that figure under a bare label `Margin`.

13.0437% is not arbitrary: it is exactly the 15% markup expressed as a margin on sell
(15/115 = 13.0435%). The shared core is right; the stored figure is wrong; and a third formula
in the per-line column ignores indirect, overhead and risk altogether.

This is EST-14's DoD — *"persist and render cost/margin/markup/discount **consistently**"* — failing
on its own screen.

**Finding 4.2 — the tender pricing screen is a second pricing engine.** It reproduces the selling
price correctly today. It is still a parallel implementation with no test binding it to the server,
and it already disagrees on margin.

**Finding 4.3 — two `shared` engines with different risk semantics**, as set out in §2.

---

## 5. Revision and authority boundaries

Prepare → review → approve is genuinely separated, and the strongest control in the vertical is
real: **the preparer cannot approve their own offer, and is refused by name.**

```
403 — "the preparer of quotation QUO-2026-000001 cannot approve their own quotation —
       segregation of duties requires a different approver"
```

**But the freeze does not hold the estimate.** With the offer in `internal_review`, re-pricing the
underlying BOQ line was **allowed (201)** and the tender's selling value moved from `179,821.20`
to `2,279,774.40`. The quotation kept its own snapshot at `117,804.00`, so the *offer* did not
silently change — but the estimate it was drawn from is freely rewritable beneath it, and nothing
marks the offer as no longer matching its source. EST-16 asks that *"the awarded basis points to one
immutable revision"*. Whether an **approved** offer is protected could not be measured, because no
offer can be approved (§6).

---

## 6. The blocker — the journey cannot complete

**Commercial approval is unreachable, so the client-facing output and the tender submission are
unreachable.**

```
approve → 409 "approval blocked: readiness checklist is not configured"
```

Nothing on the tender → quotation path seeds the evidence checklist. Seeding it by hand
(`POST /document-requirements/seed`) produces the `COMMERCIAL_EVIDENCE_TEMPLATE`:

```
COMMERCIAL_OFFER    need 1  have 0
DATASHEET           need 1  have 0
TECHNICAL_PROPOSAL  need 1  have 0
VENDOR_QUOTE        need 3  have 0
verdict NOT_READY
```

**And the checklist is circular.** It requires a `TECHNICAL_PROPOSAL`; the proposal generator
refuses:

```
409 — "technical proposal requires the approved Technical Study and approved commercial offer
       — Generate and internally approve the current commercial offer."
```

The proposal needs the approved offer; the approved offer needs the proposal. **The generated
proposal can never be the evidence for its own approval.** The only escape is uploading a proposal
produced outside AURA — which makes EST-18's *"generate … from the frozen study/estimate"* unmeetable
on this path.

Downstream, both refusals are correct given the gate and both are terminal:

```
technical-proposal  409 for ever
submit              409 "only a tender with an approved technical study, approved quantity
                         take-off and internally approved commercial offer can be submitted"
```

**Finding 6.1 — an empty checklist reads `READY`.** `decisionReadiness([])` returns `verdict: READY`
while `assertApprovalReadiness` refuses the same state as "not configured". A screen reading the
readiness endpoint shows READY; the approval refuses. Two answers to one question.

**Finding 6.2 — `VENDOR_QUOTE ×3`** ties every commercial approval to supplier comparison —
EST-11, EST-12 and EST-13, all UNVERIFIED.

---

## 7. Controlled outputs and their source revision

| Output | Status | Source revision |
|---|---|---|
| `pricing.xlsx` (internal) | **200**, 14,130 bytes, real xlsx | live estimate — not a frozen revision |
| `pricing/export.csv` (internal) | **200**, 735 bytes | live estimate |
| `technical-proposal` (client-facing) | **409, unreachable** | would be the approved study + approved offer |
| Client commercial offer PDF | not reached | — |

The two outputs that work are **internal** and are correctly gated on
`tendering.internal-pricing.access` — `u-e2e-qs` reads them (200), presales, techmgr and sales are
refused (403). **Every client-facing output in this vertical is unreachable.** EST-18 has nothing to
download.

---

## 8. SEC-01 inside this vertical

Per the standing instruction, SEC-01 is recorded and remediated *inside the slice that exposes it*:

- **`r-estimator` has no provisioned identity.** `tendering.internal-pricing.access`, `crm.estimate.freeze` and `crm.pricing-sheet.*` have never been exercised by the role that holds them. The central act of Estimate & Pricing has only ever been performed by an administrator.
- **`r-sales-manager` has no provisioned identity.** It alone holds `tendering.tender.create` and `tendering.tender.submit`.
- Consequently **`tendering.takeoff.project`, `tendering.estimate.update` and `tendering.tender.submit` were refused to every shipped actor that exists**, and the trace could only proceed as `u-admin`.

This is a blocker for the journey, not tidying: without those two identities no slice here can be
proved under the role whose job it is, and a capability proved only by an administrator has had its
permissions proved by nobody.

---

## 9. Proposed remediation slices, smallest first

Each is independently provable against a frozen DoD. **None is started.**

**Slice A — the two missing commercial identities.**
Provision `u-e2e-estimator` (`r-estimator`) and `u-e2e-salesmgr` (`r-sales-manager`). No role is
widened. Prerequisite for every slice below; on its own it proves nothing and promotes nothing.

**Slice B — one definition of margin.** *(EST-14)*
Make `marginPercent` mean gross profit over selling price everywhere. If the business genuinely
wants the overhead-inclusive figure, it is a second named field — `blendedMarginPercent` — never the
one printed under `Margin`. Delete the React reimplementation in `tender-pricing-client.tsx` and
read the server figures, as the other three screens already do. Retire the per-line column's fourth
formula.

**Slice C — the approval deadlock.** *(EST-17, EST-18)*
Decide what satisfies `TECHNICAL_PROPOSAL` for a tender-sourced offer. Seed the checklist when the
quotation is generated, so the gate is configured by the act that creates the thing it gates. Make
`decisionReadiness([])` and `assertApprovalReadiness` agree that an empty checklist is not ready.
**This is the slice that unblocks the journey** — until it lands, no client-facing output and no
tender submission exists.

**Slice D — the frozen estimate.** *(EST-16)*
Re-pricing a BOQ line beneath an offer under review, or approved, either creates a revision or is
refused. Prove the awarded basis points at one immutable revision.

**Slice E — the client-facing proposal.** *(EST-18, EST-02…EST-10 "without leaking internal cost")*
Generate, download and prove that no internal cost vocabulary appears in it.

**Slice F — supplier sourcing.** *(EST-11, EST-12, EST-13)*
Required by `VENDOR_QUOTE ×3`. Larger, and it depends on Slice C.

**Recommended first bounded slice: C, with A as its prerequisite.**
B is the more satisfying finding and D is the more dangerous one, but C is the only slice that turns
a dead end into a journey. Until an offer can be approved, EST-16, EST-17 and EST-18 have nothing to
be proved against, and no client-facing output exists to reconcile to the frozen sheet.

---

## 10. Ownership, preserved

Nothing proposed above moves the ownership model. **Estimate owns the calculation truth**
(`shared/src/domain/estimation*.ts`); **commercial approval governs the selling decision**
(`quotation.service.approve`, SoD enforced by throw); **the quotation consumes the approved
revision**. Slice B deletes a parallel engine rather than adding one. No new pricing engine is
proposed anywhere.
