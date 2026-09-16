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
