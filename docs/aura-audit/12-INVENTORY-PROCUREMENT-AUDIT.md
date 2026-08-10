# 12 — Inventory & Procurement Audit

## Procurement — `VERIFIED_IMPLEMENTED` (solid)

Domain (`modules/procurement/src`): `purchase-request`, `rfq`, `supplier`, `purchase-order`, `framework-agreement` — each with service + Postgres store. 4 controllers, 9 web pages, 7 tests.

**P2P chain traced:**
```
Purchase Request ─▶ RFQ ─▶ (rfq.awarded → cross-module:1248) ─▶ Purchase Order
Purchase Order (po.created) ─▶ budget commitment (finance) + PO match port
Framework Agreements ─▶ call-off POs
```
Reactors `procurement.po.created/updated` and `procurement.rfq.awarded` are wired to finance commitments (`03`, `09`).

## Inventory — `VERIFIED_IMPLEMENTED` (solid)

Domain (`modules/inventory/src`): `stock`, `serial`, `goods-receipt` (GRN), `storage-location`, `transfer` — service + Postgres store each. 5 controllers, 8 pages, 8 tests.

**Goods-receipt → match → cost:**
```
inventory.grn.created ─▶ 3-way match (PO · GRN · invoice) ─▶ finance actual cost (cross-module:618/714)
```

**Capabilities present:** stock levels, **serial tracking** (`serial.service.ts`), **storage locations / bins** (`storage-location`), **transfers** between locations, goods receipt.

## Capability matrix

| Capability | Status | Evidence |
|---|---|---|
| Purchase requisition → approval | `VERIFIED_IMPLEMENTED` | `purchase-request.service.ts` |
| RFQ → vendor → award | `VERIFIED_IMPLEMENTED` | `rfq.service.ts`, reactor 1248 |
| Purchase order + framework agreements | `VERIFIED_IMPLEMENTED` | `purchase-order`, `framework-agreement` |
| Goods receipt (GRN) | `VERIFIED_IMPLEMENTED` | `goods-receipt.service.ts` |
| 3-way match | `VERIFIED_IMPLEMENTED` | reactors 618/714 → finance |
| Serial tracking | `VERIFIED_IMPLEMENTED` | `serial.service.ts` |
| Batch/lot tracking | `NOT VERIFIED` / likely `MISSING` | no `batch`/`lot` store found |
| Warehouse / bin | `VERIFIED_IMPLEMENTED` (basic) | `storage-location` |
| Stock transfers | `VERIFIED_IMPLEMENTED` | `transfer.service.ts` |
| Reservations / allocations | `NOT VERIFIED` | no reservation store found |
| Inventory valuation (FIFO/WA) | `NOT VERIFIED` | valuation method not confirmed in stock domain |
| Stock adjustments + audit | `PARTIALLY_IMPLEMENTED` | movements via events; adjustment UI unverified |

## Findings

- Procurement + inventory form a **genuine P2P + stock core** with real 3-way match into finance — one of the better-integrated back-half areas.
- **Gaps:** batch/lot tracking, reservations, and a defined valuation method (FIFO/weighted-average) are **not verified**; for an inventory-carrying contractor these are material before go-live.
- Inventory integrity risk: with only 54 DB-level FKs (`04`), stock movement consistency rests on service logic + events; recommend an inventory reconciliation/consistency check job.

**Scores:** Procurement 72 · Inventory 71.
