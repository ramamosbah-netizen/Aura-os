# Wave 4 Progress Report — Supplier decision and material delivery

**State:** IN PROGRESS

**Opened:** 16 September 2026

**Starting point:** `b76a8a5b` on `main` (Wave 3 CLOSED / VERIFIED)

**Frozen discovery baseline:** 180 capability leaves and 46 reconciled gap records — unchanged

## Iteration 1 — Procurement authority investigation (no promotion)

Programme rule 8 requires an UNVERIFIED leaf to be investigated before anything is built, and Wave 3
paid for that rule twice: `ENG-03` and `ENG-04` each turned out to have more built than the register
implied, and `ENG-04` had **two** independent submittal registers that disagreed. Wave 4 opens with
twenty pinned rows, eighteen of them UNVERIFIED and three WRONG_BEHAVIOR. Building first would be the
worst available move.

Nothing was built, changed or promoted in this iteration. One temporary probe was written to answer a
question the code could not answer by inspection alone; it was run, recorded below, and deleted.

### The frozen gate this wave must meet

> **Exit gate:** Buyer and Technical/Commercial managers approve a comparison; PO matches the selected
> version; Storekeeper partially receives and later completes it; Site issue/return reconciles
> quantities and value; all 16 pinned supplier/buyer proofs are resolved.

### Finding 1 — the gate's four functional clauses are carried by rows that are NOT in the pinned 16

The roadmap's scope table pins twenty rows to this wave: `EST-07`, `EST-11`, `EST-12`, `EST-13`,
`SUP-01`–`SUP-12`, `BUY-01`, `BUY-02`, `BUY-03`, `BUY-07`. The gate's fifth clause says *"all 16
pinned supplier/buyer proofs"* — which is `SUP-01`–`SUP-12` plus `BUY-01`, `BUY-02`, `BUY-03`,
`BUY-07`. The four `EST` rows are pinned to the wave but are not part of that clause.

The first four clauses are carried by four rows that appear in neither list:

| Gate clause | Carrier | Classification |
| --- | --- | :---: |
| Buyer and Technical/Commercial managers approve a comparison | `SUP-13` Approval and recommendation | PARTIAL |
| PO matches the selected version | `SUP-14` Selected quotation to PO | PARTIAL |
| Storekeeper partially receives and later completes it | `BUY-05` Partial receipt | **WRONG_BEHAVIOR** |
| Site issue/return reconciles quantities and value | `BUY-06` Stock issue and return | **WRONG_BEHAVIOR** |

This is the same shape Wave 3 had, where `PLN-06`/`PLN-07`/`PLN-08` carried a clause without being
pinned — and it was handled there by proving the clause rather than the row's whole classification.
The difference is that two of these carriers are WRONG_BEHAVIOR, which is a claim that the system
currently does the wrong thing, not merely that nobody has checked.

**The wave's real span is therefore 16 pinned + 4 gate carriers + 2 gap records**, not 16. `BUY-04`
(Purchase approval, WRONG_BEHAVIOR) and `BUY-08` (Commitment and exposure, PARTIAL) sit in the same
groups and are named here so they are not discovered late.

### Finding 2 — the root cause is one structural absence: there are no lines anywhere

Every one of `SUP-01`–`SUP-12` is a **per-item** attribute. The schema has no items to hang them on.

| Table | Migration | What it actually is |
| --- | --- | --- |
| `aura_procurement_purchase_requests` | [0015](../../../infrastructure/migrations/0015_procurement_pr.sql) | header only: `title`, `project_id`, `status`, **one scalar `value numeric`** |
| `aura_procurement_purchase_orders` | [0009](../../../infrastructure/migrations/0009_procurement_purchase_orders.sql) | header only: `title`, `supplier_name`, `project_id`, **one scalar `value numeric`** |
| `aura_procurement_rfqs` | [0053](../../../infrastructure/migrations/0053_procurement_rfq.sql) | header: `title`, `pr_id`, `due_date` |
| `aura_procurement_rfq_quotes` | [0053](../../../infrastructure/migrations/0053_procurement_rfq.sql) | **one row per supplier**: `supplier_name`, `amount numeric`, `lead_time_days`, `notes` |

The service layer states it plainly in its own comment — *"the PO has no line items: it is a header
with a `value`"* ([purchase-order.service.ts:185](../../../modules/procurement/src/purchase-order.service.ts:185)).

Measured against the twelve pinned SUP rows, the aggregate quote row supports **one** of them:

| Row | Attribute | Where it lives today |
| --- | --- | --- |
| `SUP-09` | Lead time | `lead_time_days` on the quote — aggregate, not per line |
| `SUP-01` | Technical compliance | nowhere |
| `SUP-02` | Deviations and exclusions | nowhere |
| `SUP-03` | Make and model | nowhere |
| `SUP-04` | Item quantity and unit | nowhere |
| `SUP-05` | Unit price | nowhere — only an aggregate `amount` |
| `SUP-06` | Currency normalization | **no currency column exists at all** |
| `SUP-07` | VAT and tax | nowhere |
| `SUP-08` | Freight and logistics | nowhere |
| `SUP-10` | Payment terms | nowhere |
| `SUP-11` | Warranty | nowhere |
| `SUP-12` | Quotation validity | nowhere |

Gap record `F-04` names this exactly — *"Full normalized supplier comparison not established by
aggregate RFQ model"* — and it is carried by `SUP-13`, a row that is not in the pinned 16 but carries
the gate's first clause.

`SUP-13`'s recorded behaviour is *"RFQ recommends lowest aggregate amount and permits buyer
selection"*. With no currency column, **"lowest aggregate amount" compares raw numbers that may be in
different currencies.** Nothing in the schema prevents a quote in one currency from being recommended
over a cheaper quote in another.

### Finding 3 — `J3-05` is accurate, line for line

The record reads: *the material request screen has title/value/project without material lines,
quantity, unit, spec, date or CBS, and labels the currency `$`.* Checked against
[pr-list.tsx](../../../apps/web/components/pr-list.tsx):

- the create form offers exactly three fields — `title`, `value`, `projectId` (lines 86–96);
- `value` is labelled **"Estimated cost ($)"** (line 88);
- the list formats money as `'$' + n.toLocaleString(...)` (line 25), hardcoded.

No quantity, unit, specification, need-by date, work package or cost code is captured. `BUY-01`
("Material requisition lines") has no lines to requisition.

### Finding 4 — Wave 0 closed three defects; the register still calls them open. Both are partly right.

The Wave 0 closure report records `J3-01`, `J3-02` and `J3-03` as CLOSED with named proof. The
register carries all three as `OPEN`, and `BUY-04`/`BUY-05`/`BUY-06` as WRONG_BEHAVIOR citing those
same defects as current behaviour. That contradiction had to be resolved before planning around
either. It resolves differently for each.

**`J3-01` / `BUY-04` — genuinely fixed at the service layer.** `update()` accepts
`Partial<Pick<PurchaseOrder, 'title' | 'reference' | 'supplierId' | 'supplierName'>>` — `status` is
not in the pick, so an update cannot touch it. `changeStatus()` admits only
`draft | issued | closed | cancelled` and refuses the rest with *"PO status X requires its governed
submit, approve or receipt command"*; `issued` requires `approved` unless the value auto-approves.
The WRONG_BEHAVIOR classification looks stale. It is **not** promoted here: the frozen DoD also wants
permissions, UI, browser and handoff proof, and this iteration promotes nothing.

**`J3-04` / `BUY-02` — fixed for the identified supplier, open for the unidentified one.**
`update()` validates a supplied `supplierId` for existence, tenant and approval
([purchase-order.service.ts:167-171](../../../modules/procurement/src/purchase-order.service.ts:167)).
But a PO whose `supplierId` is null accepts any `supplierName` as free text — the same free-text
identity pattern that `ENG-06` recorded as debt for `sender`.

**`J3-03` / `BUY-05` — the fix is real but conditional, and the unknown case resolves to the
permissive answer.** This one could not be settled by reading, so it was probed.

The reconciliation is a single expression
([purchase-order.service.ts:276](../../../modules/procurement/src/purchase-order.service.ts:276)):

```ts
const status: PurchaseOrderStatus = ordered !== null && ordered > 0 && received !== null && received < ordered
  ? 'partially_received'
  : 'received';
```

`ordered_quantity` is nullable — migration
[0212](../../../infrastructure/migrations/0212_po_boq_coding.sql) added it as *"all nullable +
additive"* — and `makePurchaseOrder` defaults it to `null`. The existing service test proves the fix
with `orderedQuantity: 100`
([purchase-order.service.test.ts:44](../../../modules/procurement/src/purchase-order.service.test.ts:44)).
Nothing covers the null path.

A temporary probe drove the real service through three cases and was then deleted:

| Ordered | Received | Resulting PO status | |
| --- | --- | --- | --- |
| 100 | 1 | `partially_received` | Wave 0's fix, working |
| **null** | 1 | **`received`** | receiving one item closes the whole order |
| 100 | **null** | **`received`** | an unknown receipt closes the whole order |

So `J3-03` is alive wherever the ordered quantity is unknown, and the subscriber that calls this path
already knows it can be — it logs *"quantity unknown"*
([cross-module-subscriber.ts:1352](../../../apps/api/src/events/cross-module-subscriber.ts:1352)).

**This is the pattern this programme has already refused once.** In `ENG-04` the rule was stated
directly: a missing field must not become a declaration, and UNKNOWN passing is still a pass. Here an
absent ordered quantity does not produce "I cannot tell whether this order is complete" — it produces
**"this order is complete"**, which is the answer that stops chasing an outstanding delivery.

The register is right that `BUY-05` is WRONG_BEHAVIOR. The Wave 0 report is right that the defect it
fixed was fixed. Both statements are true about different halves of the same expression.

### Finding 5 — the material-approval gate keys on a supplier *name*

`ENG-04` closed with the material gate restored to Procurement's owned rule: a PO may not be issued
while its supplier has a standing refusal on the same project. The call is
([purchase-order.service.ts:221](../../../modules/procurement/src/purchase-order.service.ts:221)):

```ts
if (status === 'issued' && this.qualityGate && existing.projectId && existing.supplierName) {
  const gate = await this.qualityGate.checkMaterialApprovalGate(existing.tenantId, existing.projectId, existing.supplierName);
```

Two things follow, both already predicted by `ENG-04`'s reconciliation and now confirmed in place:

1. **The gate is keyed on supplier identity, not material lineage.** One supplier may offer dozens of
   materials; a refusal on one blocks a PO for any other, and an approval on one does not clear the
   one that matters. This is the "supplier is identity, not material lineage" finding, carried here
   deliberately.
2. **The key is `supplierName`, a free-text string**, and the gate does not run at all when it is
   empty — an unnamed supplier issues ungated.

Exact MAR-to-purchased-material applicability was explicitly deferred to Wave 4 and cannot be built
until there is a purchased material to point at. That is the same absence as Finding 2.

### What this means for sequencing

Everything in the gate's first two clauses and eleven of the twelve SUP rows depends on one decision
that has not been made: **what a purchasable material IS in this system.** Until an item exists, a
requisition has nothing to requisition, a quote has nothing to price per unit, a PO has nothing to
carry forward without retyping, a GRN has nothing to partially receive, and a MAR has nothing to be
about.

That decision is architectural, it is foundational to the whole wave, and `ENG-04` established that I
should not make it inside a slice. Four questions need answers before any schema is written, and they
are put to the programme owner rather than assumed:

1. **Is the canonical material identity a catalogue record, or a line's own description?** A
   catalogue (`material_id` → make, model, spec, unit) makes MAR-to-PO lineage exact and makes
   "installed against WHAT" answerable at Wave 5. Free-text lines are far cheaper and would ship this
   wave faster, but they reproduce the `supplierName` problem one level down and would make the Wave 5
   installation gate unbuildable.
2. **Where does the line live first — requisition, RFQ, or both?** `BUY-01` asks for requisition
   lines; `SUP-01`–`SUP-12` ask for quote lines against a common item so suppliers are comparable. The
   cheapest correct answer is one item identity authored on the requisition and referenced by every
   quote line, so comparison is per item rather than per supplier's own list.
3. **Which authority owns currency?** `SUP-06` asks for normalization, which needs a rate, a rate
   date and an owner. Tendering already holds money rules behind
   `tendering.internal-pricing.access`; whether procurement reuses that authority or is given its own
   is a decision, not an implementation detail.
4. **Do the existing flat `value` columns stay?** A PO that has both a scalar `value` and lines will
   drift the moment one is edited without the other. Either `value` becomes derived from the lines, or
   the lines are decoration. Programme rule 3 forbids copying business truth into a convenient
   duplicate field, which points at derived — but it touches the cost ledger, spend analytics and
   commitment/exposure, so it is not a free change.

### Proposed sequence — for decision, not yet started

1. **The item.** Canonical material identity plus requisition lines: quantity, unit, specification,
   need-by date, work package and cost code. Closes `BUY-01` and gap record `J3-05`, and gives every
   later slice something to point at. Fixes the hardcoded `$` in the same screen.
2. **Partial receipt first, before the comparison.** `BUY-05` is a live defect on a gate clause, it
   is small, and it is independent of the comparison work. An unknown ordered quantity must stop
   producing "complete" — it must produce a refusal or an explicit unknown, never a silent closure.
3. **Quote lines and normalized comparison.** `SUP-01`–`SUP-12` against the common item, with
   currency owned by a named authority. Closes `F-04`.
4. **Approve the comparison, and carry the selection into a PO without retyping.** `SUP-13`,
   `SUP-14` — the gate's first two clauses.
5. **Receive, issue and return against the line.** `BUY-06`, `BUY-07` — the gate's last two clauses.

Five slices. `BUY-04` is re-verified rather than rebuilt, and `EST-07`/`EST-11`/`EST-12`/`EST-13` are
reconciled against the SUP work rather than being built twice — the estimation rows and the
procurement rows describe the same comparison from two ends, and Wave 3 already showed what happens
when two registers own one fact.

**Nothing is promoted by this iteration, and no schema decision has been taken.**

## Iteration 2 — an unknown quantity is not a completion (containment only)

The four architectural decisions are settled by the programme owner and recorded below,
after this iteration. This iteration implements one of them and nothing else: the narrow guard that stops a
missing quantity from declaring a purchase order complete while the line foundation is built.

**No new receipt model. `BUY-05` is not promoted and remains WRONG_BEHAVIOR.**

### What changed

One expression in `reconcileReceipt`
([purchase-order.service.ts](../../../modules/procurement/src/purchase-order.service.ts)). It used to
fall through to `received` whenever it could not conclude anything:

```ts
const status = ordered !== null && ordered > 0 && received !== null && received < ordered
  ? 'partially_received'
  : 'received';
```

Completion is a **conclusion**, and it needs both sides of the comparison. Where either side is
unknown, the order now stays exactly where it is, says so in the log, and writes **no event** — an
indeterminate reconciliation must not put a receipt into the log that the cost and exposure readers
would then treat as settled.

One judgment call is flagged rather than buried: the guard also holds `ordered <= 0`, which is
slightly wider than the literal instruction. An order recorded as zero quantity with goods received
against it contradicts itself, and a conclusion drawn from contradictory numbers is not better than
one drawn from missing ones. If that is wider than intended, it is one clause to remove.

### The operational consequence, stated plainly

The current purchase-order screen captures no ordered quantity — that is the same absence `J3-05`
records for requisitions. So for orders raised through the UI today, **the automatic transition to
`received` stops happening.** They stay at `issued` until the line work gives them quantities.

That is the trade, and it is the right way round: an order that reads outstanding overstates exposure
and keeps somebody chasing it; an order that falsely reads received understates exposure and stops
them. `closed` remains reachable as a governed status; `received` deliberately is not.

### A passing test was asserting the defect

This must be visible rather than folded into a green run. `chains.e2e-spec.ts` contained:

> *"P2P chain: PO issued → GRN receipt → PO auto-transitions to received"*

It created a PO with **no ordered quantity**, posted a GRN with **no received quantity**, and
asserted the order became `received`. It passed — verified at baseline by stashing this change and
re-running: 5 passed, 1 failed, and the P2P test was among the passing.

So the guard broke it, correctly. The test was not proving the chain in its own title; it was proving
that an unquantified receipt completes an order, which is the defect. It is now two tests:

- the original name, made true — the PO carries `orderedQuantity: 10`, the GRN carries
  `receivedQuantity: 10`, and the order reaches `received` through the real reactor;
- a new one — a receipt against an unquantified order does **not** complete it, and the order still
  reads `issued` after the reactor has had the same time the passing case gets.

`chains.e2e-spec.ts` remains in the pre-existing failing set for its unrelated deal-chain failure,
unchanged. It went from 6 tests (1 failing) to 7 tests (the same 1 failing).

### Regression evidence at this checkpoint

| Gate | Result |
| --- | --- |
| `pnpm typecheck` | **51/51 tasks successful** |
| `pnpm build` | **27/27 tasks successful** |
| `pnpm test` | **51/51 tasks successful** |
| API unit + all fitness gates | **541 passed**, 4 skipped |
| `purchase-order.service.test.ts` | **13 passed** — 9 existing, 4 new |
| API e2e | **59 files passed, 12 failed (71)** — the identical pre-existing set, not grown |

The four new unit tests pin: an unknown ordered quantity leaves the order alone; an unknown received
quantity leaves it alone; a contradictory zero order leaves it alone; **no event is appended in any
of those cases**; and both quantities known still concludes normally.

### Carried

The subscriber's log line claimed a reconciliation had happened even when none had. Saying
"reconciled" there would put the claim back into the log that the guard just took out of the data, so
it now reports the order was left where it is and why.

## Settled decisions — the Wave 4 spine

Taken by the programme owner after iteration 1, and binding on every slice in this wave.

### 1. Material identity is a canonical record, separated from its commercial snapshot

A stable `material_id` points at a material/product authority. PR, RFQ and PO lines keep the
description, spec, make/model and UOM **by value** at the stage where commercial history needs them —
so editing the catalogue tomorrow cannot rewrite what an old purchase order meant.

The same rule ENG-05 already proved for conveyances, one noun over: `TransmittalItem` snapshots
number, title and revision at conveyance time precisely so the register moving on does not rewrite
what was sent.

The identity must remain valid across the whole chain:

> Material → MAR applicability → PR line → RFQ quote line → selected line → PO line → GRN line →
> stock → site issue → installation

**The spine rule:** material identity does not depend on storage location, supplier, MAR or project.
Each of those points *at* the material and adds its own facts. That is what makes Wave 5's hardest
question answerable — *is the material installed actually the material and model that was approved,
purchased and received?*

A new UUID called "material" with no real authority behind it is not acceptable. Iteration 1 found
four existing item identities that this must reconcile rather than join:
`aura_inventory_stock_items` (whose `code` is unique per tenant, and which migration 0304 already
declares the authority for a part), the handover spares reference into it, the untyped
`aura_site_material_consumption.item_id`, and `ElvDevice`'s make/model on an installed instance.

### 2. Lines originate at the requisition — with a legitimate direct path

Two lawful routes, and the direct one is not a loophole:

| Route | Chain |
| --- | --- |
| **Sourced** | PR Line → RFQ → Quote Line → Selection → PO Line |
| **Direct** | Material Master → Direct PO Line |

A direct PO line still carries canonical `material_id`, quantity and UOM, its commercial snapshot and
project context, and records its provenance as **DIRECT**. Existing governance for direct purchase —
approval or justification, if any — is preserved; this wave invents no new policy.

**The epistemic rule, which is the exact inverse of the `BUY-05` defect:**

> `source_pr_line_id = NULL` does not mean unknown lineage. Where `source_type = DIRECT`, it is
> *explicit* lineage. A PO line claiming SOURCED without a source chain is refused.

`BUY-05` read an absent quantity as a positive conclusion. Here absence is only meaningful because a
discriminator declares what it means, and the combination that would be an unfounded claim is
refused. Same data shape, opposite epistemics.

**A consequence to settle before the schema:** legacy PR and PO rows carry neither lines nor a
`source_type`, so they are neither DIRECT nor SOURCED. By the same rule they must not be silently
labelled DIRECT — that would be inferring a declaration from missing data, which is what this rule
exists to prevent. ENG-05's precedent applies: a conveyance with no named recipients kept the
previous behaviour, because refusing them all would rewrite the past.

### 3. Procurement owns transaction currency; normalization belongs to Finance/organization

Not Tendering — its commercial authority is for estimate, offer and award, and must not be turned
into a general FX service.

A procurement quote carries its **transaction currency and original monetary values**. Comparison
uses **normalized amount, base currency, FX rate, rate date/as-of and rate provenance**. The
supplier's original quotation is never replaced by its normalized form.

The discovery this required is done, and **nothing needs inventing**:

| Need | Already exists |
| --- | --- |
| FX rate authority | `aura_exchange_rates` — kernel migration 0031, unique `(tenant_id, from_currency, to_currency, effective_date)` |
| Conversion | `convertMoney` in `@aura/shared` |
| Precedent consumers | Finance customer invoice currency (0089), AP invoice currency (0096), FX revaluation on booked-vs-current rate |
| Provenance column shape | **migration 0274** — `source_amount, source_currency, exchange_rate, rate_date, rate_source, base_amount, base_currency` |

Migration 0274 is a 1:1 template for what this decision asks, and it already carries the matching
invariant in its own comment: *"NULL provenance denotes legacy/unknown evidence and is never
backfilled from a mutable source."*

### 4. The flat `value` becomes a derived compatibility projection

Not an independent business truth, and not deleted. After lines exist, a header value is the derived
aggregate of its authoritative lines, and the line-based path does not permit writing it
independently. Rule 3 — no copying business truth into a convenient duplicate field — and no two
totals that can disagree.

A consumer inventory comes first: cost ledger, exposure, analytics, UI, events, tests. Then a safe
compatibility migration. No big-bang deletion.

**One constraint the decision does not name, and which binds it:** the event log is append-only and
already carries header `value` in `po.created` and `po.issued` payloads, which feed the cost ledger.
Past events cannot be rewritten, so "derived" can only mean derived going forward, with historical
events untouched and legacy rows that carry a value and no lines still valid.

### Sequence

1. **Material & Line Authority Foundation** — the spine. Not merged with `BUY-01` as one block.
2. **`BUY-05` receipt semantics**, rebuilt once on PO lines in their final shape. The containment in
   iteration 2 holds the defect closed in the meantime.
3. Quote lines and normalized comparison — `SUP-01`–`SUP-12`, closing `F-04`.
4. Approve the comparison and carry the selection into a PO — `SUP-13`, `SUP-14`.
5. Receive, issue and return against the line — `BUY-06`, `BUY-07`.

**Award remains quotation-level in this wave.** `SUP-14` is frozen as *"buyer selects full
quotation"*, so one RFQ collects multiple supplier quotations, the buyer selects one complete
governed quotation/version, and its selected lines become PO lines. Comparison is still per item —
every line is compared — but the award decision is not split across suppliers. A split award is a
separate capability if the business wants it, and it will not be introduced quietly inside `SUP-14`.

**Promotion is not tied to slice order.** `BUY-01` is judged against its own frozen acceptance proof:
if slice 1 delivers line-based requisition UI, browser proof, permissions and save/reload and every
clause is met, it is promoted in slice 1. If a receipt or handoff clause genuinely remains open, it
stays PARTIAL. No row is held back to fit a presumed sequence.

## Iteration 3 — Slice 1: material identity, and a requisition that says what it needs

The spine. A material master separated from stock position, and requisition lines that cite it.
Nothing downstream of this wave can be built without it: every one of `SUP-01`–`SUP-12` is a fact
*about an item*, and there were no items.

### Where the master lives, and why no new module

The dependency graph was checked before anything was written, because the decision said to revisit
the architecture only if it forced the question. It does not:

- `@aura/inventory` depends on **`@aura/core` and `@aura/shared` only** — nothing procurement-side.
- So `procurement → inventory` is a clean one-way edge, and no fifth module is needed.

The master is therefore `aura_inventory_materials` (migration 0333), inside the authority that
migration 0304 already declared: *"the authority for a part is Inventory."* What is separated is the
confusion inside one row — `aura_inventory_stock_items` carried `code`, `name`, `unit`, **and**
`warehouse` and `quantity_on_hand`, so identity and position were the same record. A material that
had never been stocked had nowhere to exist, which is precisely what a requisition needs to name.

Migration 0334 gives a stock item a nullable `material_id`. **Not backfilled**: every existing
position predates the master, and matching them by code would be a guess written into a reference
column, indistinguishable afterwards from a fact somebody established. NULL means *"predates the
master, nobody has said"* — not *"no material"*.

### The rules that make the identity worth having

| Rule | Why it is not mere strictness |
| --- | --- |
| `code` is **immutable** | It is the identity people type off a shelf label, and the key every existing reference resolved on. Re-pointing it rewrites what they meant. |
| `uom` is **immutable** | The unit is what a quantity MEANS. Change `m` to `roll` and every on-hand balance and open demand is reinterpreted without anyone editing a number. |
| name / spec / make / model are **freely editable** | Because every citing document keeps its OWN copy. Correcting the catalogue today cannot change what an order meant last year. |
| `obsolete` blocks NEW demand only | Retirement is a statement about what may be ordered next, never a claim that the past did not happen. |

**Identity by reference, description by value.** A line carries `material_id` forever *and* copies the
code, name, specification, make, model and unit at authoring time. The reference answers *"is the
thing installed the thing that was approved and bought"*; the copy answers *"what did we think we
were ordering, when we ordered it"*. A reference alone lets a catalogue edit rewrite history; a copy
alone is the free text this wave exists to remove.

This is the same mechanism `ENG-05` already proved for conveyances — `TransmittalItem` snapshots
number, title and revision at conveyance time — applied to a different noun.

### An unpriced line does not quietly buy a weaker approval

The sharpest rule in the slice, and it comes straight out of iteration 2's containment.

A requisition's value decides **who may approve it** — `approvalMatrix.resolve(…, { value })`. So a
line with no estimate makes the total smaller, and a smaller total needs a less senior approver.
Letting an absent number stand in for a real one would buy a weaker approval with missing data:
the same defect shape as an absent quantity declaring an order complete, one table over.

So `requisitionTotal` reports `value: null` while **any** line is unpriced — not zero, and not the
partial sum presented as a total. The partial figure is still returned as `pricedSubtotal`, because a
half-written draft is legitimately useful, but it is never the requisition's value. A draft may be as
incomplete as its author likes; a requisition **asking somebody to approve it** may not.

The header value follows decision 4: derived where lines exist, and the authored figure where they do
not. A requisition raised before lines existed keeps its header value, because that is what somebody
actually stated and refusing to read it would invalidate history rather than improve it.

### The `$` was contradicting an authority that already existed

`J3-05` records the hardcoded `'$' + n`. The discovery is that `aura_companies.base_currency` has
existed since migration 0135, `NOT NULL DEFAULT 'AED'`, and is already exposed through
`CompaniesService`. The screen was not merely unlabelled — it was labelling AED figures as dollars.
The currency is now resolved server-side and threaded through every figure and every input label.

### Found while building it

- **A field left out of a DTO is silently stripped, not refused.** The global `ValidationPipe` runs
  with `whitelist: true`, so omitting `code` and `uom` from the material edit DTO — which looked like
  the stronger statement about immutability — meant a caller asking to re-code a material got a
  cheerful `200` and no change. They are now **declared in order to be refused**. Caught by the
  Auth-ON e2e asserting a 400, not by review.
- **The error-taxonomy fitness gate** caught a refusal message that would have escaped as a 500;
  reworded to match the taxonomy rather than widening the classifier.
- **A Buyer cannot submit their own requisition under Auth-ON.** `PATCH
  /procurement/purchase-requests/:id/status` derives `procurement.purchase-request.status`, an action
  word no shipped procurement role grants — the Buyer holds `procurement.*.create/read/update`.
  Pre-existing, unrelated to lines, and NOT repaired inside this slice; the e2e submits as admin and
  says why. **This blocks the `BUY-01` receipt clause** (see below).
- **The `PROJECT_CODING` port needs the node KIND.** Without it a WBS id offered as a cost code would
  be accepted purely for belonging to the right project, and the line would carry a work package in
  the field a cost code is read from. Proven refused.
- **Nest DI**: binding the port in `GatesModule` failed the container until `ProjectsModule` was
  imported there. Safe — `ProjectsModule` imports only `CoreModule` and consumes the gate tokens
  through the `@Global` registry rather than by importing back, so the edge is one-way.

### What was proven

**Domain — 39 tests.** Material identity, immutability of code and unit, retirement semantics,
reference resolution by id and code, snapshot completeness; line quantity and cost rules, the freeze
at submission, per-line money rounding, derived-vs-authored value, and renumbering.

**Service — 23 tests.** A line cannot name a material outside the catalogue; an obsolete material is
refused on new demand; the unit comes from the master and cannot be typed; cross-project and
wrong-kind coding refused; **an absent coding authority REFUSES rather than passes**; the freeze;
and the governing value in all three states.

**API, Auth-ON with JWT — 14 tests.** Storekeeper authors the catalogue and the Buyer is refused
`403`; a duplicate code is refused naming what holds it; code and unit changes refused `400`;
a line copies the whole description; the unit comes from the material; an unresolvable material
leaves the requisition empty; an obsolete material is refused `409` while the line that already cites
it stays readable; **correcting the catalogue does not rewrite what the requisition meant**; a
foreign cost code refused; the derived value; no value while unpriced; save, edit, remove, renumber
and reload; the freeze at submission (`409` on add, edit and remove); unauthenticated `401`.

**Browser, Auth-ON.** The panel shows materials in their own units (`12 nr`, `250 m`), money as
`AED`, and — the one that matters — an unpriced line leaves the requisition showing
`AED 4,500.00 so far` with *"1 of 2 lines are not priced — this requisition has no value yet"* and a
refusal naming line 2. Pricing it settles the figure to `AED 6,400.00`. A zero quantity is refused in
the domain's own words. Survives a reload.

**Persistence.** Both new tables: RLS **ENABLED and FORCED with a policy**, and `aura_app` grants
verified against the live database.

### Regression at this checkpoint

| Gate | Result |
| --- | --- |
| `pnpm typecheck` | **51/51 tasks** |
| `pnpm build` | **27/27 tasks** |
| `pnpm test` | **51/51 tasks** |
| API unit + all fitness gates | **541 passed**, 4 skipped |
| API e2e | **60 files passed, 12 failed (72)** — the identical pre-existing set; the passing count rose by this slice's spec |
| Browser (this spec + the five Wave 3 specs + the three touching this screen) | **19 passed**, 1 skipped |
| `pnpm lint` | **0 errors**, 683 warnings — unchanged |
| Migration policy | **335 files**, sequential, `@DOWN` present |

### Reconciliation — and no promotion

`BUY-01`'s frozen acceptance proof asks for five things: *representative Buyer / Storekeeper
execution in the canonical Procurement / Inventory context; save/reload; applicable permission
denials; actual output; and next-role receipt.*

| Clause | State |
| --- | :---: |
| Representative Buyer and Storekeeper, canonical context | **proved** |
| Save / reload | **proved** |
| Applicable permission denials | **proved** |
| Actual output — the derived requisition total, a *calculation* under the frozen definition | **proved** |
| **Next-role receipt** | **NOT proved** |

The receipt clause is genuinely open, and it is open for a concrete reason rather than for want of
effort: the requisition's next role is its approver, and **a Buyer cannot currently submit a
requisition under Auth-ON at all** — the permission-derivation gap recorded above. Proving a handoff
through a path the owning role cannot walk would be proving something else.

**So `BUY-01` is NOT proposed for COMPLETE, and `J3-05` is not proposed for closure** — its
acceptance proof is the same sentence. Both are proposed to move `UNVERIFIED → PARTIAL`, which is
what the evidence supports: substantial governed behaviour, proven Auth-ON and in the browser, with
one named clause outstanding. The decision is the programme owner's.
