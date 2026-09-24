# Pre-award sourcing requisition — invariants found, and the smallest design

**Date:** 2026-09-24 · **Status:** design for approval. **Nothing in this document is implemented.**
**Decision it implements:** option A, frozen by the programme owner — reuse RFQ, supplier
quotation, technical evaluation and commercial comparison through a governed pre-award sourcing
requisition tied to the tender, never an operational purchase requisition.

---

## 1. Can this live inside today's purchase requisition as-is? No.

The owner's condition was: if `projectId` is mandatory, or if a requisition's status automatically
reserves budget or creates a commitment, do not put a `null` in and work around it — come back with
a design. Measured against the code and the live database:

| Invariant | What was found | Where |
|---|---|---|
| `project_id` required? | **No.** Nullable in the table; `create` takes it as optional | `aura_procurement_purchase_requests`; `procurement.controller.ts` `POST purchase-requests` |
| Status constrained? | **No CHECK at all** on `status`, and no column saying what a requisition is FOR | same table |
| Budget reserved? | **No.** Nothing on requisition, RFQ or recommendation reserves or checks budget | `purchase-request.service.ts`, `rfq.service.ts`, `sourcing-recommendation.service.ts` |
| Does a status create a commitment? | **YES.** Approving a requisition **automatically creates a draft purchase order** and carries the requisition's lines onto it | `purchase-request.service.ts` `changeStatus`, the `if (status === 'approved')` block |
| What does a PO set in motion? | `procurement.po.created` posts **committed cost** to the cost ledger and **ordered quantity** to the quantity ledger | `cross-module-subscriber.ts` ~1140 and ~1202 |
| Would a null project stop that? | Only **by accident**: both subscribers skip when the order has no project. The draft PO itself still exists, numbered, one act from being issued | same |
| Every door that creates a PO | Four, and all go through `PurchaseOrderService.create` / `.raise`: requisition approval, sourcing award, framework call-off, and `POST purchase-orders` | `purchase-request.service.ts:179`, `sourcing-award.service.ts:274`, `framework-agreement.service.ts:96`, `procurement.controller.ts:119` |
| Which of those can name a requisition? | Only approval and award carry `prId` on the header. The direct route and the framework call-off accept **no** requisition reference | checked in each |
| **An alternate write path** | **PO LINES carry the lineage.** `POST` on purchase-order lines accepts `sourceType: 'sourced'`, `sourcePrLineId` and `sourceQuoteLineId` from the request body. So a buyer holding `procurement.po.update` could open an ordinary direct PO — no `prId` at all — and attach a line naming a pricing requisition's line and a pricing quotation's line. **A header-only guard would never see it.** | `purchase-order-lines.controller.ts` (the `Post()` DTO, lines 22–24) |
| Stock without a PO? | **Impossible** — a goods-receipt line requires `po_line_id NOT NULL` | `aura_inventory_goods_receipt_lines` |
| RFQ needs an approved requisition? | **No** — `prId` is optional and its status is never checked | `POST rfqs` |
| Can a requisition's project change later? | **No** route exists for it — only `PATCH purchase-requests/:id/status` | `procurement.controller.ts` |
| Requisition lines | `material_id NOT NULL` (a bare uuid with a snapshot code and name, no foreign key), `quantity > 0`, `uom` required; **no link to a tender or BOQ item** | `aura_procurement_purchase_request_lines` |

So "a requisition with no project that nobody approves" would work in a demo and fail the first time
somebody pressed Approve: that press drafts a purchase order against a pricing exercise, and only the
absence of a project keeps it out of the ledgers. That is the bypass the owner ruled out.

**Three further findings that shape the authority design:**

- **Nobody holds the technical-evaluation authority by name.** `engineering.technical-evaluation.decide` is reachable only through the `engineering.*` wildcard on `r-technical-manager` — the SEC-01 shape.
- **Only the storekeeper can create a material master record**, and only by wildcard: the create route declares nothing, so it derives `inventory.material.create`, reached through `inventory.*` on `r-store`.
- **The estimator cannot read the material master at all.** `r-estimator` holds no `inventory` permission, so it could not even look up the material a BOQ item should map to.

And BID-01, confirmed: `aura_tendering_estimate_sources` records `rfq_id + quote_id`, a `supplier_name`
and a `sourced_unit_cost` — the legacy whole-quote header, with no revision, no line, no material and
no technical verdict.

---

## 2. The design — one migration, one choke point, no new engine

### 2.1 Schema (one migration)

**`aura_procurement_purchase_requests`**

```sql
purpose                  text NOT NULL DEFAULT 'operational'
                         CHECK (purpose IN ('operational', 'tender_pricing')),
source_tender_id         uuid,
source_basis_revision_id uuid,   -- the take-off revision the tender's BOQ was projected from

-- A pricing requisition names its tender and its BOQ basis, and has NO project.
CHECK (purpose = 'operational'
       OR (source_tender_id IS NOT NULL AND source_basis_revision_id IS NOT NULL AND project_id IS NULL)),
-- An operational requisition carries no tender reference, so the two can never be confused.
CHECK (purpose = 'tender_pricing' OR (source_tender_id IS NULL AND source_basis_revision_id IS NULL))
```

Plus a `BEFORE UPDATE` trigger refusing any change to `purpose`, `source_tender_id` or
`source_basis_revision_id`. A pricing requisition **never becomes** an operational one — not through
the service, not through a raw store write, not through SQL.

Every existing row defaults to `operational`, so nothing live changes.

**`aura_procurement_purchase_request_lines`**

```sql
source_boq_item_id  uuid,          -- the BOQ item this supply line prices
material_mapped_by  text,          -- WHO confirmed "this BOQ item is this material"
material_mapped_at  timestamptz
```

For a pricing requisition all three are required on every line. That is enforced in the service,
which knows the requisition's purpose, and backed by a trigger. The BOQ item must belong to the
requisition's own tender, **and to its `source_basis_revision_id`** — so a later re-projected BOQ
cannot silently re-point a line.

**`aura_tendering_estimate_sources`** — closing BID-01 on this path

```sql
quotation_revision_id  uuid,     -- the governed, immutable revision priced from
quotation_line_id      uuid,     -- the line that priced this material
pr_line_id             uuid,     -- the requirement it answered
material_id            uuid,
currency               text,     -- the supplier's own
technical_verdict      text,     -- snapshot of the verdict at the moment of sourcing
comparison_date        date,     -- the basis the normalised figure was read on
-- rfq_id / quote_id become NULLABLE, and exactly one lineage must be present:
CHECK ((quote_id IS NOT NULL) <> (quotation_line_id IS NOT NULL))
```

Old rows keep their legacy lineage and stay readable. New sourcing is governed-line only: the legacy
route is refused for any tender that has a pricing requisition.

### 2.2 The hard boundary — enforced at the service, proved at the door

| What must never happen | Enforced where | How it is proved |
|---|---|---|
| A pricing requisition is submitted or approved | Domain rule in `changeStatus`: a `tender_pricing` requisition has **no approval lifecycle** — it is `draft` until it is `closed` | `PATCH purchase-requests/:id/status` → 409 for both |
| A purchase order is raised from it, by any door | **Two choke points, because the lineage lives in two places.** (a) `PurchaseOrderService.create` / `.raise` refuse an order whose `prId` resolves to a pricing requisition — this covers approval and award. (b) The PO **line** service refuses any line whose `sourcePrLineId` belongs to a pricing requisition, or whose `sourceQuoteLineId` sits on an RFQ raised against one — this covers the line door that a header check can never see | Every door driven directly: approval (refused above); an award attempt; **an ordinary direct PO with a `sourced` line naming a pricing requisition line and a pricing quotation line**; and the PATCH that edits an existing line to point at one |
| A recommendation is made on its RFQ | Guard at recommendation **creation**. The pricing exercise stops at comparison; a recommendation exists to authorise an award | `POST rfqs/:id/recommendation` → 409 |
| Committed cost, ordered quantity or stock is posted | Follows from "no PO", and no longer depends on the project being null | Ledger and goods-receipt tables read back empty for the tender |
| It quietly becomes operational | Immutable `purpose` — domain plus trigger; no conversion route exists | A raw `UPDATE … SET purpose = 'operational'` refused by PostgreSQL |

Both PO choke points sit in the purchase-order and purchase-order-line services, which the award
**calls** but does not own, so **SUP-14's code is not touched**. The recommendation guard is the one line inside SUP-13. It adds a
boundary, not behaviour, but it is inside a frozen capability and needs your explicit yes.

### 2.3 Authority

| Act | Who | Permission | Change needed |
|---|---|---|---|
| Create the pricing requisition from BOQ items | Estimator | `procurement.tender-sourcing.create` | **new name**, on `r-estimator` |
| Confirm "BOQ item X is material Y" | Estimator | same act, recorded as `material_mapped_by/at` | the estimator also needs `inventory.material.read` to look materials up |
| Create a missing material | Material-master owner — **not** the estimator | the existing route | unchanged. A line whose material does not exist cannot be sourced until it does, and that limit is stated rather than worked around |
| Raise the RFQ, capture the three offers | Buyer | `procurement.rfq.create` / `.quotes` | none |
| Technical verdict per line | Technical Manager | `engineering.technical-evaluation.decide` | **name it** on `r-technical-manager` (today reached by wildcard only — SEC-01, fixed inside the slice that exposes it) |
| Read the commercial comparison | Estimator, Commercial Manager | read | none |
| Source an estimate component from a governed line | Estimator | `tendering.estimate.update` + `internal-pricing.access` | none |

The maker/checker split holds: the estimator states the demand and chooses the price basis, the buyer
solicits, the technical manager judges compliance, and the commercial manager approves the offer. No
role is widened beyond one read and one new, narrowly named act.

### 2.4 "Three quotations" must be real — the one decision still open

Today VENDOR_QUOTE ×3 is satisfied by three typed references, which is exactly "three files to
please a checklist". Two ways to close that:

- **(i) Derived — recommended.** For a tender-sourced offer, VENDOR_QUOTE is not attached at all. It is **computed**: the number of **distinct suppliers** with an effective governed revision on the tender's pricing RFQ **that carries at least one technically-assessed line mapped to this tender's BOQ**. It cannot be typed, so it cannot be faked, and it moves when the evidence moves.
- **(ii) Attached but validated.** Keep attaching, but only a governed revision id is accepted, and it is checked at attach time: it must belong to this tender's sourcing, come from a supplier not already counted, and have assessed lines.

(i) is smaller and stronger. It does change one checklist type from attached to derived, so it is
your call.

---

## 3. What will be proved once approved

Under shipped roles, against migrated PostgreSQL with auth on, in the browser where a person acts:

1. **The boundary, at every door** — as tabled in 2.2, including the raw SQL update.
2. **The real path** — estimator builds the pricing requisition from BOQ items with confirmed mappings; buyer raises the RFQ; **three suppliers** quote governed revisions line by line; technical manager gives a verdict per line; the commercial comparison normalises them; the estimator sources the component from one governed line, and the build-up shows supplier, revision, verdict and comparison basis.
3. **Evidence is earned** — VENDOR_QUOTE reaches 3 only because three distinct suppliers genuinely quoted assessed lines; two leaves it at 2 and the waiver path proven in `b7f02266` still applies.
4. **The rest of the journey on that evidence** — independent approval, frozen basis, final proposal download compared byte-for-byte, submission read back.
5. **EST-11, EST-12 and EST-13 assessed one by one** against their frozen DoD and handoffs — not promoted because the path exists.

## 4. What this design does not do

- It does not convert anything after a win. Operational procurement for a won tender starts with a **new** operational requisition — a mobilisation act — which may cite the tender for lineage but is a separate record.
- It does not re-price, rank or recommend. The estimator chooses a basis on the tender side; procurement's recommendation and award are never entered.
- It does not change `baseline.total`, Contract Value, or anything in VAT-BASIS-01.
