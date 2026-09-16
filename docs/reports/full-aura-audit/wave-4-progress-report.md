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

## Iteration 4 — Slice 1b: the derived value is the one that governs

Slice 1 derived the requisition's value and proved it read correctly. **It did not make anything obey
it**, and that is a defect this slice introduced rather than inherited: before lines existed the
header was the only figure and was at least self-consistent; afterwards there were two, and every
governing path still read the stale one. Programme rule 3 — two totals that can disagree — broken by
the change that was supposed to honour it.

Three places read the header, and each one mattered differently.

| Where | What it did | Why it mattered |
| --- | --- | --- |
| Submission | `changeStatus` never consulted the lines | The completeness rule was **reported** by the summary endpoint and enforced nowhere, so an unpriced requisition could still be sent for a decision |
| The approval matrix | resolved on `existing.value` | A line-based requisition keeps a header of 0 while its lines say 6,400, so **no threshold rule matched and no approver was required at all** |
| The auto-drafted PO | inherited `updated.value` | An approved requisition drafted a PO at the wrong amount, which then commits that amount to the cost ledger |

The middle one is the sharpest: it is the same defect as the unpriced-line rule arriving through a
different door — a smaller number buying a weaker approval. Closing one while leaving the other open
would have been closing the door and leaving the window.

### What changed

- **`readyToSubmit` is enforced** on `submitted` *and* on `approved`, because a draft can be
  approved directly and that is precisely the path where a missing estimate would decide who the
  approver is.
- **The approval matrix resolves on the governing value.**
- **The persisted header follows the lines**, so no downstream reader — the event log, the cost
  ledger, My Work, spend analytics — is handed a figure the lines contradict. While any line is
  unpriced the header goes to 0, which is what a NOT NULL column can say for *"nothing established
  yet"*; that is safe only because such a requisition cannot be submitted or approved, and the panel
  says in words why there is no value.
- **The PO is drafted from the governing value.**

### Two authority findings, both corrections rather than new policy

**A Buyer could not submit their own requisition.** Two layers, and both had to move:

- the route derives `procurement.purchase-request.status`, an action word no shipped procurement
  role grants — now explicit `@Permissions('procurement.pr.update')`;
- and `changeStatus` asserted `procurement.pr.approve` for **every** status change, so a requisition
  could only be SENT for approval by somebody who could already approve it. The maker and the
  checker were the same person by construction. The permission now depends on which decision is
  being made: `approve` for `approved` and `rejected`, `update` for the rest.

This widens submission from approval-holders to update-holders, which is stated plainly rather than
buried: it is not a policy somebody chose, it is a bug that made maker/checker unreachable, and the
Buyer role already holds `procurement.*.update`.

**A submitted requisition disappeared from the approvals inbox.** The inbox listed purchase requests
on `status === 'draft'` — the one state that means *still being written* — so an approver was shown
requisitions nobody had finished, and a requisition that actually asked for a decision vanished at
the moment it asked. Both of its neighbours in that same list already use the asking state: a
quotation appears on `internal_review`, a purchase order on `pending_approval`. It now appears on
`submitted`.

**The transition consequence, stated:** requisitions sitting in `draft` today will no longer show as
approvals until somebody submits them — which is now possible, and is the correct workflow. Before
this slice submission was effectively unreachable, which is why listing drafts was the only route
that worked.

### Found while building it

- **The readiness refusal escaped as a 500.** *"every line needs an estimated cost…"* matched nothing
  in the HTTP taxonomy (`needs a\b` does not match `needs an`), so the first real enforcement of the
  rule answered with an internal error. Reworded to *"requires"*.
- **And the error-taxonomy fitness gate did not catch it**, because the gate reads throw-statement
  literals — this reason is composed in a domain function and thrown somewhere else entirely. A
  refusal built in one file and raised in another is invisible to it. Recorded as a gap in the gate,
  not repaired here.
- **The gate then flagged a comment.** The note explaining the above contained a literal
  `throw new Error(…)` form, which the scanner read as a real throw. Reworded — and it confirms
  exactly how the gate decides what to look at.

### What was proven

**15 new service tests**, on top of slice 1's 62:

- an unpriced requisition is refused submission AND approval, naming the line;
- a legacy requisition with no lines is untouched by either rule;
- the matrix resolves on **6,400**, not on the header's 0, and the authorised approver passes on that
  same figure, while a requisition with no lines still resolves on its authored header;
- the persisted header tracks the lines up, down and through a removal, and drops a stale authored
  figure to 0 rather than leaving it;
- the PO is drafted at 4,500 rather than 0;
- somebody holding only `update` can submit and is refused both the approval and the rejection.

**Three new Auth-ON API tests** — the Buyer submits their own requisition and is still refused the
decision; an incomplete requisition is **refused** rather than merely reported incomplete, and stays
a draft so its author can finish it; and the **next-role receipt**: the requisition is absent from
the approvals inbox before submission, present after it as `Purchase Request / Approve` carrying
**6,400 — the figure its lines establish** — and approving it drafts the PO at that same value.

**Browser, Auth-ON.** The requisition row's own Value column reads `AED 6,400` after a reload:
one requisition, one total, with the panel beneath it showing the lines that add up to it.

### Regression at this checkpoint

The verification database was lost mid-slice (the container came back with an empty volume) and was
rebuilt from zero: **335 migrations applied from nothing**, marker re-set, `aura_app` re-activated.
That carried an independent proof worth keeping — **RLS fitness reports 267 tenant-scoped tables,
every one ENABLED, FORCED and policied**, up from 265, the two new tables included and verified on a
from-zero database rather than asserted by the migrations that wrote them.

| Gate | Result |
| --- | --- |
| `pnpm typecheck` | **51/51 tasks** |
| `pnpm test` | **51/51 tasks** |
| API unit + all fitness gates | **541 passed**, 4 skipped |
| API e2e | **60 files passed, 12 failed (72)** — the identical pre-existing set; passing tests rose 429 → 432 |
| Browser, Auth-ON | **19 passed**, 1 skipped — this spec plus the five Wave 3 specs and the three touching this screen |
| `pnpm lint` | **0 errors**, 683 warnings — unchanged |
| Migration policy | **335 files**, sequential, `@DOWN` present |
| RLS, live, from zero | **267 tenant-scoped tables · enabled 267 · forced 267 · with-policy 267**; isolation verified under a non-bypass role, 15 assertions |

### Reconciliation — `BUY-01` and `J3-05`

`BUY-01`'s frozen acceptance proof: *representative Buyer / Storekeeper execution in the canonical
Procurement / Inventory context; save/reload; applicable permission denials; actual output; and
next-role receipt.*

| Clause | State |
| --- | :---: |
| Representative Buyer and Storekeeper, canonical context | **proved** |
| Save / reload | **proved** |
| Applicable permission denials | **proved** |
| Actual output — the derived requisition total, a *calculation* under the frozen definition | **proved** |
| Next-role receipt — reaches an approver's inbox carrying the value its lines establish | **proved** |

All five clauses are now met, Auth-ON and in the browser.

**Proposed: `BUY-01` UNVERIFIED → COMPLETE, and gap record `J3-05` OPEN → CLOSED / VERIFIED**, whose
recorded defect — *material lines, quantity, unit, spec, date, CBS, and the `$` label* — is closed
item by item. The decision is the programme owner's.

Nothing else is proposed. `BUY-02`, `BUY-03`, `BUY-07` and the twelve `SUP` rows remain untouched,
and the wave's exit gate is unchanged.

### Applied

The programme owner accepted both. **`BUY-01` is COMPLETE** and **gap record `J3-05` is
CLOSED / VERIFIED.** The register moves to **18 of 180 COMPLETE** and 48 UNVERIFIED; three of the
forty-six gap records are now closed. Nothing else moved: no other classification changed, and the
wave’s exit gate is untouched — `BUY-01` is one of the sixteen pinned proofs, so fifteen remain.

## Iteration 5 — Slice 2: a purchase order buys materials, and says how it came to buy them

An order was a header with one scalar value and, since 0212, one optional BOQ quantity. So *"what
did we order"* had no answer, and everything downstream of it — receiving part of a delivery,
issuing some of it to site, proving the material installed is the one approved — had no subject.
Migration 0336 gives the order its lines.

### Lineage: the rule that makes the same NULL mean two different things

Two lawful routes, and the direct one is not a loophole:

| Route | Chain |
| --- | --- |
| **SOURCED** | PR line → RFQ → supplier quote line → selection → PO line |
| **DIRECT** | material master → PO line, with no competitive sourcing |

`source_type` states which, **explicitly**, and that is the whole point:

- `source_pr_line_id IS NULL` on a **direct** line is *explicit lineage* — somebody decided to buy
  this without sourcing it, and the discriminator records that decision rather than leaving it to be
  inferred from a missing column;
- the same NULL on a line **claiming** to have been sourced is an unfounded claim, and it is
  **refused**. "Competitively sourced" is exactly the assertion nobody should be able to make by
  leaving a field empty.

Absence is meaningful only because something explicitly declares what it means — the inverse of the
defect this wave opened with, where an absent quantity declared an order complete.

`direct` is the **default** when a caller says nothing, because it is the honest one: a line nobody
has sourced has not been sourced. `sourced` is never inferred; it has to be claimed, and claiming it
costs a chain. `source_quote_line_id` is declared and unused — selection arrives in a later slice, so
until it exists `sourced` cannot be satisfied and is therefore refused. It is a reservation with a
rule already attached, not a field waiting to be filled in by hand.

**The third state — legacy/unknown — is carried by the ABSENCE OF LINES**, not by a line. Every order
raised before this migration has a header value and no lines: it stays valid, keeps behaving as it
did, and is never read as evidence that it was sourced or that it was direct, because it predates the
authority that could have said either. It is not selectable at the DTO, refused by name at the
domain, and excluded by a CHECK constraint — because it is not a choice anybody makes, it is what
history looks like from here. `provenanceOf` reports `mixed` where an order carries both kinds,
rather than collapsing to whichever line came first: *"some of this was competitively sourced"* is a
different fact from *"all of it was"*.

### The first real handoff in the chain

An approved requisition's lines now travel onto the order it drafts, **without retyping**. The
material identity, the description as the requisitioner saw it, the quantity, the unit and the
coding all move, and each order line records the requisition line it answers. Retyping them would
put a second, unchecked description of the same material into the system — which is what this wave
exists to stop.

The lineage is **DIRECT**, said plainly: the order was raised straight from a requisition with no RFQ
and no selection. Calling it sourced because a requisition exists would be the same false claim the
domain refuses — a requisition is demand, not sourcing.

Both sides derive their total the same way, so the requisition and the order agree on 6,400 without
anybody reconciling them. The carry is idempotent: a requisition line already on the order is
skipped, so a redelivered approval does not order the same material twice.

### One order, one total

The persisted header follows the lines, exactly as the requisition's does. Unlike a requisition
there is no incomplete state to represent — a line without a price cannot be created at all, since
an order for an unknown amount is not a draft in progress — so an order with lines always has a
whole figure. An order with no lines keeps the figure somebody authored.

Money is the order's own currency: one order, one supplier, one currency, so it sits on the header
(`currency`, nullable and **not** backfilled — a historical order was never told what currency it
was in, and writing one in now would invent a commercial fact rather than record one). Normalisation
across currencies belongs to the comparison slice, where quotations in different currencies actually
meet.

### Found while building it

- **Five helper names collided in the module barrel.** `renumber`, `nextLineNo`, `governingValue`,
  `mayEditLines` and `MaterialLineSnapshot` exist on both the requisition and the order side, and
  re-exporting both broke the build. The order-side ones are renamed rather than the barrel narrowed,
  so a reader always knows which document a helper is about.
- **A cited requisition line is resolved, not trusted.** A lineage nobody checks is not a lineage; it
  is a note that looks like one. A citation of a line that does not exist is refused 404.

### What was proven

**26 domain tests.** Quantity and price rules (zero price accepted — a free issue is a real
commercial fact; negative refused as a credit); the sourced-needs-a-chain refusal in both its halves;
`legacy` refused by name; provenance including `mixed`; per-line rounding before the sum; the freeze;
ordered quantity per material — the figure a receipt will be measured against.

**18 service tests.** The catalogue refusal; direct as the default; the sourced refusal through the
service; a citation of a non-existent requisition line refused; cross-project coding refused; the
header tracking the lines up, down and through a removal; `legacy` for a lineless order; the freeze
after issue; and the whole carry — every line travelling with its own unit, each recording the
demand it answers, provenance `direct`, both totals agreeing, idempotent on replay, and the
requisition-side read answering *"was this demand ever bought?"*.

**9 Auth-ON API tests, JWT on.** A line bought in the material's own unit with its description
copied; the derived value overriding a header authored at 999,999; a legacy order reading its own
value; **a sourced claim with no chain refused 400 and nothing written**; `legacy` refused at the
DTO; a citation of a missing requisition line refused 404; **the full handoff** — requisition lines
authored, submitted by the Buyer, approved by the manager, and the drafted order carrying both lines
with identity, description, unit, quantity, the demand each answers, provenance `direct` and a total
of 6,400 matching the requisition; the freeze after issue (409 on add, edit and delete);
unauthenticated 401.

**Persistence.** `aura_procurement_purchase_order_lines`: RLS **ENABLED and FORCED with a policy**,
`aura_app` granted, and `aura_procurement_purchase_orders.currency` present — all verified against
the live database.

### Regression at this checkpoint

| Gate | Result |
| --- | --- |
| `pnpm typecheck` | **51/51 tasks** |
| `pnpm build` | **27/27 tasks** |
| `pnpm test` | **51/51 tasks** |
| API unit + all fitness gates | **541 passed**, 4 skipped |
| API e2e | **61 files passed, 12 failed (73)** — the identical pre-existing set; passing tests rose 432 → 441 |
| Migration policy | **336 files**, sequential, `@DOWN` present |

### No promotion

Nothing is proposed. This slice builds the subject that `BUY-05` (partial receipt), `BUY-06` (stock
issue and return) and `BUY-07` (material delivery to work package) all need, and none of them is
closable until receipt semantics are rebuilt on these lines — the next slice. `SUP-14` is untouched:
carrying a requisition's lines onto an order is not selecting a supplier quotation, and this slice
deliberately does not let anything claim it was.

Two things are carried forward from here rather than silently absorbed:

- **no UI yet for order lines.** The API and the domain are proven; the buyer's screen still shows an
  order as a header. That is the same shape `BUY-01` was in after slice 1, and it is stated rather
  than left to be discovered at reconciliation time.
- **the drafted order's unit price is the requisition's ESTIMATE**, because that is the only figure
  anybody has stated at that point. A buyer edits it to the agreed price while the order is a draft.
  Where that agreed price should come from — a supplier quotation — is exactly what the comparison
  slice delivers.

## Iteration 6 — Two constraints pinned, then BUY-05 as per-line receiving authority

### The two constraints, encoded rather than remembered

**PR lineage is not sourcing lineage.** Carrying a requisition line onto an order produces a DIRECT
line, and it must never later become `sourced` because a requisition exists. `sourced` becomes true
only where a governed quotation selection made it true — and that selection will CREATE the line
rather than relabel one. There is deliberately no mutator: `LINEAGE_IS_FIXED` states the rule, a test
asserts that no exported function can set a lineage (so adding one fails and sends whoever wrote it
to the rule), and editing a line rebuilds it from its own lineage verbatim.

**An estimate and an agreed price are not the same number.** Slice 2 put the requisition's estimated
unit cost into the order line's `unitPrice` — correct, and a trap: two kinds of figure in one column
with nothing saying which. Migration 0337 adds `unit_price_basis`:

| Basis | What it is | Who set it |
| --- | --- | --- |
| `estimate` | a provisional commercial snapshot, binding on nobody | the requisitioner, before any supplier was asked |
| `agreed` | what the supplier will actually be paid | a buyer placing the order — or, on the sourced route, the selected quotation's own lineage |

Carried lines are `estimate`. A buyer adding a line to an order is placing an order at that price, so
it is `agreed`. Editing the **price** settles it; editing anything else leaves a carried estimate
provisional, because changing a quantity is not agreeing a rate. Existing rows are **not backfilled**
— a line written before the column existed was never told which kind it holds, and `NULL` means
unknown rather than agreed. `linesCarryingAnEstimate` deliberately does not count unknown as
provisional.

### BUY-05 — per-line receiving authority, not patched status logic

The register records the defect in a sentence: *"partial receipt marks full order received."*
Iteration 2 contained it — an unknown quantity stopped declaring completion — but could not produce
the true answer, because the order had one scalar quantity and no items, so *"99 still outstanding"*
had nothing to be outstanding **on**.

**An order is a set of positions, not a percentage.** An order for twelve cameras and 250 metres of
cable is not fractionally received: each line is settled or still owed, and the order is finished
only when every one of them is settled. An order-level figure would say "most of it" and leave nobody
able to tell which material to chase.

Migration 0338 gives the delivery note its lines. `po_line_id` is **required** — a receipt against
nothing settles nothing, and landing on a position somebody can close is the entire point.

**Accepted and rejected are separate columns, and only one of them is progress.** A rejected quantity
arrived, was inspected and was sent back: real, worth recording against the supplier, and *not*
progress, because the material is still owed. Counting it would close an order that still owes goods
— the same false completion in a politer form. A rejection costs a reason, because one nobody
explained cannot be acted on.

`receiptStatus` returns **null** — leave the order alone — in two different situations, and both are
absences that must not conclude anything: an order with no lines has no positions to measure, and an
order where nothing has been accepted has not changed.

**The reconciliation moved off the note's creation.** A goods receipt note is created before anybody
has written what is on it, so nothing about delivery can be concluded at that moment; the first
attempt reconciled there and correctly found nothing. The order now reconciles on
`inventory.grn_line.recorded`, when a line actually lands. Orders with no lines keep the scalar path
and its iteration-2 guard.

The module seam is the existing one: **Inventory says what arrived, Procurement decides what it
means for the order.**

### Found while building it

- **A constructor parameter inserted in the MIDDLE rebound every later one.** Added after
  `goodsReceipts` in the cross-module reactor, which its own suite builds positionally — 25 tests
  failed at once. Moved to the end, which is the rule this report has recorded twice before and which
  I broke anyway.
- **Then the same parameter silently injected nothing.** `@Optional() private readonly x: X | null`
  emits `Object` in `design:paramtypes`, so Nest bound nothing and the reconciliation never ran —
  **the exact defect `PLN-04` paid for once on a milestone receipt.** Fixed with an explicit
  `@Inject(PurchaseOrderLineService)`. Caught by the Auth-ON e2e, not by review; the unit suite was
  green throughout, because in-memory construction passes the dependency positionally.
- **A build-time stale `dist`.** The API compiled against Inventory's previously emitted types and
  could not see a method that existed in source.

### What was proven

**14 receipt-domain tests** — BUY-05's exact case (`receive 1 of 100 → 99 outstanding, not
received`), completion only on the last arrival, a second line still owed blocking the order, a
wholly rejected delivery counting as nothing, a part-rejected one counting only its accepted part,
`null` for a lineless order and for nothing-accepted, an unknown line id treated as nothing rather
than everything, over-delivery recorded rather than refused and never producing a negative debt, and
exposure as the money still owed at the price it was ordered at.

**5 new domain + 3 new service tests** for the two constraints above.

**9 Auth-ON API tests, JWT on.** Receive 1 of 100 → `partially_received`, never `received`; the
remaining 99 on a second note → `received`, cumulative across notes; every camera received while the
cable is still owed → still `partially_received`, and `received` only once the cable arrives; a
wholly rejected delivery leaves the order at `issued`; a part-rejected one counts only the accepted
part; a rejection with no reason refused; a receipt line recording nothing arriving refused; a
receipt line naming no order line refused; a legacy order with no lines left exactly where it is;
unauthenticated 401.

**Persistence.** `aura_inventory_goods_receipt_lines` RLS **ENABLED and FORCED with a policy**, and
`unit_price_basis` present — both verified against the live database.

### Regression at this checkpoint

| Gate | Result |
| --- | --- |
| `pnpm typecheck` | **51/51 tasks** |
| `pnpm build` | **27/27 tasks** |
| `pnpm test` | **51/51 tasks** |
| API unit + all fitness gates | **541 passed**, 4 skipped |
| API e2e | **62 files passed, 12 failed (74)** — the identical pre-existing set; passing tests rose 441 → 450 |
| Migration policy | **338 files**, sequential, `@DOWN` present |

### Reconciliation — `BUY-05`

Its frozen acceptance proof: *"Receive 1 of 100, retain 99 outstanding and correct management
exposure."*

| Clause | State |
| --- | :---: |
| Receive 1 of 100 | **proved**, Auth-ON |
| Retain 99 outstanding | **proved** — per line, cumulative across notes, and reported in words |
| Correct management exposure | **proved at the API and in the event payload** — outstanding quantity and outstanding value per line, at the price ordered |

The gap record behind it, `J3-03`, reads *"receiving 1 of 100 turns the PO to received, with no
accurate expression of the remainder"*. Both halves are now false.

**Not proposed for COMPLETE, and the reason is specific.** The frozen DoD wants UI and browser proof,
and there is still **no screen for order lines or receipt lines** — a storekeeper cannot do any of
this outside the API. That is the same shape slice 2 left behind and it is stated rather than
discovered at reconciliation: the capability is governed and proven to the API layer, and its
browser layer is not built.

`BUY-05` is proposed **WRONG_BEHAVIOR → PARTIAL**: the recorded wrong behaviour is gone and proven
gone, with one named DoD layer outstanding. `BUY-06` (stock issue and return) and `BUY-07` (material
delivery to work package) are untouched.
