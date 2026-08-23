# Estimation vs Pricing — domain audit

**Date:** 2026-08-24 · **Status:** 🟢 CURRENT · **Branch:** `claude/sales-preaward-program` at `a743458c`
**Purpose:** settle one boundary before any Slice 6 code is written —

> **Estimation = what will it cost us?  ·  Pricing = what will we sell it for?**

**Gate:** no Estimation Workspace UI and no migrations until this report is reviewed.

Every claim below was read from the tree at the commit above. Line references are clickable.

---

## 1. Current state — there are TWO engines, not one

This is the finding that reframes the question. The codebase does not have one estimation engine with a
profit field; it has **two engines with different vocabularies and different mathematics**, and the
Pre-Award chain runs through both.

### Engine A — `computeBuildUp` (`shared/src/domain/estimation-core.ts:154`)

```
directCost   = Σ component.amount
indirect     = directCost × indirect%
overhead     = directCost × overhead%
costBase     = direct + indirect + overhead
risk         = costBase × risk%          ← compounds on the loaded base
profit       = (costBase + risk) × profit%
sellingRate  = costBase + risk + profit
```

Returns `BuildUpFigures { directCost, indirectAmount, overheadAmount, riskAmount, profitAmount, sellingRate }`.

### Engine B — `estimateLine` (`shared/src/domain/estimation.ts:81`)

```
directCost   = material(+wastage) + labour(hours×rate) + equipment + consumables + subcontract
overhead     = directCost × overhead%
risk         = directCost × risk%         ← on direct only, NOT compounding
warranty     = directCost × warranty%
contingency  = directCost × contingency%
totalCost    = direct + overhead + risk + warranty + contingency
sellPrice    = sellFromMargin(totalCost, targetMargin%)  =  totalCost / (1 − m)
```

Returns `EstimationResult { …, totalCost, sellPrice, marginPercent, labourHours, installDurationDays }`.

### Where each one runs

| Engine | Consumers |
|---|---|
| **A** `computeBuildUp` | Tendering `RateBuildUp` ([estimate.ts:93](../../modules/tendering/src/domain/estimate.ts), [:128](../../modules/tendering/src/domain/estimate.ts)) · CRM `PreAwardPackageService.addEstimate` ([:80](../../modules/crm/src/pre-award-package.service.ts)) |
| **B** `estimateLine` | CRM `pricing-sheet.ts` · `quotation-pricing.ts` · `quotation.service.ts` · `apps/api/src/estimation/estimation.controller.ts` · `sheet-advice.ts` |

So the Direct Pre-Award chain crosses the seam mid-flight: **the estimate is Engine A, the pricing sheet
is Engine B.**

---

## 2. Consumers — what actually depends on a selling number

### Tender depends on `sellingRate` structurally (this constrains the fix)

| Consumer | Use |
|---|---|
| `summariseEstimate` ([estimate.ts:182](../../modules/tendering/src/domain/estimate.ts)) | `totalSellingValue += sellingRate × qty` → `estimatedTenderValue` |
| `tender-gate.ts:31` | "priced" is defined as **`sellingRate > 0`** — the submission gate |
| `pricing-csv.ts:81,117,119` | export carries `sellingRateUnit` and derives margin from it |
| `estimate-sourcing.service.ts:73,146` | re-derives `sellingRate` when a component is sourced from a supplier quote |

**Conclusion: removing profit from Engine A would break the tender submission gate, the CSV export and
the tender value roll-up.** The shared function cannot simply lose its selling output.

### Direct Pre-Award depends on it only to launder it

`freezePricing` ([pre-award-package.service.ts:145–160](../../modules/crm/src/pre-award-package.service.ts)) builds the frozen sheet like this:

```ts
const marginPercent = totalSellingValue > 0 ? (1 - totalDirectCost / totalSellingValue) * 100 : 0;
const line: EstimationLineInput = {
  ...emptyEstimationInput(),
  description: `Estimate E-${…} — ${lineCount} line(s)`,
  quantity: 1,
  subcontractUnitCost: totalDirectCost,   // ← the entire estimate cost, posted as "subcontract"
  targetMarginPercent: marginPercent,     // ← reverse-engineered to reproduce the estimate
};
```

Read plainly: **the Pre-Award pricing sheet does not price anything.** It stuffs the whole estimated cost
into a fake subcontract line and back-solves the margin that reproduces the selling value the *estimate*
already decided. The commercial decision was taken upstream, per line, as `profitPercent`.

This is stronger than "profit sits in the estimate" — the pricing layer currently exists only as a
pass-through wearing the shape of a decision.

---

## 3. Semantic problems

**P1 — Two different meanings of "the commercial uplift."**
Engine A's `profitPercent` is a **markup on cost** (`cost × (1+p)`). Engine B's `targetMarginPercent` is a
**margin on sell** (`cost / (1−m)`). 15% in one is not 15% in the other (a 15% markup is a 13.04% margin).
Both currently sit inside what we call "estimation". Any workspace that shows a "%" without saying which
convention it uses will mislead an estimator.

**P2 — `risk` means two different things.**
Engine A: `risk% × (direct + indirect + overhead)` — compounds. Engine B: `risk% × direct` — does not, and
Engine B additionally has `warrantyPercent` and `contingencyPercent`, which Engine A has no concept of.
The same word produces different money depending on which side of the seam you are on.

**P3 — The selling number is persisted as if it were estimate truth.**
`EstimateRevision.totals.totalSellingValue` is stored on the estimate and is what `pricingFrozen` reproduces.
So the frozen "price" is a derived echo of the estimate, and a future Pricing Workspace would have nothing
left to decide unless this is separated.

**P4 — `resources` is a capability gap, not a modelling gap.** See §7.

---

## 4. Field classification

Classified from **current semantics in the code**, not from the target design.

| Field | Where | Evidence | Verdict |
|---|---|---|---|
| `CostComponent` @ `material` / `labour` / `plant` / `subcontract` / `other` | Engine A | `CostType` union, `estimation-core.ts:10` | **Cost Estimation** — unambiguous |
| `materialUnitCost`, `wastagePercent`, `labour{hoursPerUnit,crewSize,hourlyRate}`, `equipmentUnitCost`, `consumablesUnitCost`, `subcontractUnitCost` | Engine B | direct cost inputs | **Cost Estimation** |
| `indirectPercent` | Engine A | commented *"Indirect/preliminaries % on direct cost (mobilization, supervision, site setup)"* — these are things the company actually pays for | **Cost Estimation** (cost-side) |
| `overheadPercent` | A + B | no semantic comment in either engine; conventionally company overhead recovery | **Cost Estimation (recommended)** — see the judgment call below |
| `riskPercent` | A + B | Engine A comments *"priced exposure, not padding hidden in rates"* — an allowance for identified exposure, explicitly not margin | **Cost Estimation** (cost contingency) |
| `warrantyPercent`, `contingencyPercent` | Engine B only | cost provisions | **Cost Estimation** |
| `profitPercent` / `profitAmount` | Engine A | `(costBase + risk) × profit%` | **Commercial Pricing** — move |
| `sellingRate` | Engine A | `costBase + risk + profit` | **Commercial output**, not estimate truth — but Tender needs it (§2) |
| `targetMarginPercent` | Engine B | *"Target margin on the SELL price"* | **Commercial Pricing** |
| `sellPrice`, `unitSellPrice`, `marginPercent`, `marginValue` | Engine B | derived from margin | **Commercial Pricing** |
| `totalSellingValue` (EstimateRevision.totals) | CRM | Σ `sellingRate × qty` | **Commercial** — currently mis-homed on the estimate |
| Discount | — | **does not exist anywhere yet** | **Pricing only** (to build) |
| Frozen selling price | `PricingSheet.totals.totalSell` | exists | **Pricing only** ✔ already correct |
| Quotation amount | `quotationLinesFromSheet` | added in `a743458c` | **Projection of frozen pricing** ✔ already correct |
| `labourHours`, `installDurationDays` | Engine B | productivity outputs | **Cost Estimation** (programme data, not money) |

### The one genuine judgment call: `overheadPercent`

There is no comment in the code that settles it, so this is a decision, not a reading.

- **Cost-side (recommended):** company overhead is a real cost being recovered; an estimator should see a
  fully-loaded cost before any commercial decision. Keeps "Estimated Cost" meaning *what it costs us to
  deliver, all in*.
- **Commercial-side (alternative):** some contractors treat overhead recovery as part of the commercial
  loading, tuned per deal.

Recommending **cost-side**, because it keeps the Pricing Workspace's job clean: it receives one number
(Estimated Cost) and decides one thing (what we sell it for).

---

## 5. Proposed boundary — the canonical output of an Estimate

**The canonical output of an Estimate is `estimatedCost`:**

```
Direct Cost (material + labour + plant + subcontract + other)
  + Indirect / preliminaries
  + Overhead recovery
  + Risk / contingency / warranty provisions
  ─────────────────────────────────────────
  = ESTIMATED COST        ← the estimate's single committed number
```

and Pricing starts there:

```
Estimated Cost
  → Commercial markup / target margin
  → Discount / commercial adjustment
  ─────────────────────────────────
  = SELLING PRICE         ← frozen, and the only source of a quotation
```

This matches the boundary you proposed, and §4 supports it from current semantics rather than from the
target shape. `profitPercent` and every selling figure move to the right of the line.

---

## 6. Compatibility strategy — two layers, not a risky edit to a shared function

Because Tender structurally needs `sellingRate` (§2), **do not change `computeBuildUp`'s contract.** Split
the concern into two pure functions and let the existing caller compose them:

```ts
// Layer 1 — cost only. No profit, no margin, no selling number.
computeCostBuildUp(components, { indirectPercent, overheadPercent, riskPercent })
  → CostEstimateFigures { directCost, indirectAmount, overheadAmount, riskAmount, estimatedCost }

// Layer 2 — commercial. Consumes a cost, applies policy.
computeCommercialPricing(estimatedCost, { markupPercent } | { targetMarginPercent }, discount?)
  → SellingFigures { profitAmount, discountAmount, sellingRate, marginPercent }
```

Then:

- **Tender adapter keeps today's behaviour exactly** —
  `computeBuildUp(...)` becomes a thin composition of the two layers, returning the same
  `BuildUpFigures` shape it returns now. Tender code does not change at all.
- **Direct Pre-Award** calls Layer 1 only. Its estimate stops carrying a profit decision; the estimate's
  `totals` gain `estimatedCost`.
- **Pricing Workspace (Slice 7)** calls Layer 2 with a real policy, replacing the reverse-engineered margin
  in `freezePricing`, and the fake `subcontractUnitCost` line disappears.

There is precedent in the codebase for exactly this kind of neutral-parameter extension: `computeBuildUp`'s
own comment notes *"with riskPercent 0 the figures are exactly the pre-T3 ones, so existing build-ups
re-derive unchanged"* — risk was added the same way without breaking history.

**P1 must be resolved as part of Layer 2:** pick markup-on-cost or margin-on-sell as the canonical
convention and make the other an explicit, labelled conversion. Do not ship a workspace that shows a bare "%".

---

## 7. `resources: null` — a wiring gap, not a schema gap

The capability already exists and is proven in production code:

- `compileResourceBreakdown(input, quantity)` ([estimation-core.ts:93](../../shared/src/domain/estimation-core.ts)) turns a
  `ResourceBreakdown` into correctly-typed cost components — material (+ wastage, accessories), labour
  (technician / engineer / project manager, as `count × hours @ rate`), plant (transport, equipment rent),
  subcontract, other.
- Tendering already uses it; `RateBuildUp.resources` is populated there.
- `aura_crm_estimate_build_ups` already has a **`resources` column**, and the store already reads and writes
  it ([postgres-pre-award-package-store.ts:44–47](../../modules/crm/src/postgres-pre-award-package-store.ts)).

The only gap is in CRM: `addEstimate` hardcodes `resources: null` ([:81](../../modules/crm/src/pre-award-package.service.ts)) and the DTO accepts
`components` only. **No schema change is needed** — Slice 6 wires the existing function into the Direct
path and exposes it in the API/UI.

One caveat to carry into Slice 6: `compileResourceBreakdown` throws when `quantity <= 0`. With the closing
patch's `quantity: number | null`, an unknown quantity must be resolved before a resource sheet can compile —
consistent with the gates already shipped.

---

## 8. Migration impact

**No destructive migration is required for the boundary change.**

| Artefact | Impact |
|---|---|
| `aura_crm_estimate_build_ups` (`profit_percent`, `profit_amount`, `selling_rate`) | **Keep.** Tender writes them; Direct writes 0 for profit once the decision moves. Additive column for `estimated_cost` is optional — it is derivable from the stored parts |
| `EstimateRevision.totals` (jsonb) | Additive: add `estimatedCost`. Keep `totalSellingValue` for existing rows; for Direct it becomes historical rather than authoritative |
| `aura_crm_pricing_sheets` | No change. `packageId`, `estimateRevisionId`, `quotationId` already model the chain |
| Tendering rate build-ups | **No change at all** — the adapter preserves the current shape |
| Existing Direct data | The `GATE` fixture (§9) has `totalSellingValue: 85,767` decided in the estimate. After the split it should re-derive as `estimatedCost` + pricing policy. Worth re-running as a migration sanity check |

---

## 9. Tests and invariants to lock the boundary

**Parity (must pass before anything ships):**
1. **Tender golden-value test** — for a set of existing `RateBuildUp` inputs, the composed
   `computeCostBuildUp` + `computeCommercialPricing` reproduces today's `sellingRate` **exactly**, to the cent.
2. `tender-gate` still reports priced/unpriced identically.
3. `pricing-csv` export bytes unchanged for a fixed input.

**New invariants:**
4. A Direct `EstimateRevision` carries **no** commercial decision — assert `profitPercent === 0` and that
   `totals.estimatedCost === direct + indirect + overhead + risk`.
5. **A frozen pricing sheet is the only place a Direct selling number is decided** — changing the pricing
   policy changes the quote; changing anything on the estimate does **not** change an already-frozen sheet.
6. The existing D4 regression stays green: quotation total === frozen sheet total ≠ `opportunity.value`
   (already asserted in `pre-award-closing.test.ts` and `scripts/pre-award-closing-proof.mjs`).
7. Convention test for P1: a fixed cost with markup *m* and the equivalent margin produce the same selling
   price only through the documented conversion.

**Live proof:** extend `scripts/pre-award-closing-proof.mjs` rather than adding a new script — the
in-memory store cannot catch persistence defects (that is how the `on conflict … lines` bug reached the
browser).

---

## 10. Test data currently in the dev database

Marked in-app via PATCH (no direct SQL — there is no delete lifecycle for opportunities):

| Opportunity | Purpose |
|---|---|
| `[TEST DATA] SMOKE Direct AMC renewal` (`0a6d3769`) | Slice 5 defect evidence — the AED 0 chain |
| `[TEST DATA] CLOSING-TEST Marina Mall ELV` (`7c1583a2`) | dirty state, defect evidence |
| `[TEST DATA] GATE Yas Mall ELV` (`a591f562`) | **keep** — closing-gate evidence fixture: 12/48 human-edited scope → 67,800 cost → 85,767 frozen → quote 85,767 while `opportunity.value` is 777,777 |

Cleanup deferred until a governed lifecycle exists.

---

## 11. Recommendation

1. Adopt the boundary in §5 with `overheadPercent` on the **cost** side.
2. Implement the two-layer split in §6 — Tender composes, Direct uses Layer 1 only.
3. Resolve the markup-vs-margin convention (P1) explicitly before any workspace UI.
4. Treat `resources` as wiring (§7) — no schema work.
5. Land the parity tests in §9 **before** the Estimation Workspace.

**Open for your decision:** the `overheadPercent` classification (§4) and the canonical convention for P1.
