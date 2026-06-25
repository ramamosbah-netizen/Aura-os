# Report — T1.5: Procurement module (Purchase Orders v1)

**Date:** 2026-06-25 · **Repo:** `Desktop/aura-os` (local, branch `main`) · **Increment:** the first **operate-side** business module — the module template generalizing beyond the deal chain.

---

## What was built

**`modules/procurement` — `@aura/procurement`** (cloned from the deal-chain template):
- `domain/purchase-order.ts` — framework-free `PurchaseOrder` model (status `draft|issued|received|closed`, value, a **supplier name**, and a reference to a **Project** by id + name snapshot) + `makePurchaseOrder` + `PROCUREMENT_EVENT`. 4 vitest tests.
- store port + `Postgres`/`InMemory` impls (picked from `DATABASE_URL`); `PurchaseOrderService` — owns `aura_procurement_purchase_orders`, goes through the access seam (`procurement.po.create`), emits `procurement.po.created` on the spine; `ProcurementModule` imports `CoreModule`.

**API**: `ProcurementController` (`POST/GET /api/procurement/purchase-orders`), wired into `AppModule`. Migration `0009`. The auth seeder's admin role now also grants `procurement.*` (so `u-admin` can raise POs when auth is on).

**Web**: an **Operate** nav group → `/procurement/purchase-orders` page (list + a create form with a **project dropdown** fed from the Projects API, a supplier field, and value) + `components/po-create.tsx` + a BFF route that **forwards the session token** (`...(await authHeader())`) — consistent with the now-enforced auth.

## Verified

- `pnpm build` → **10/10**; `pnpm test` → **86** (procurement +4). `pnpm db:migrate` → applied `0009`.
- **Live, full vertical**: linked a PO to a real project ("Metro Depot ELV Rollout"), created via the web form → BFF → Nest → `PurchaseOrderService` → persisted (supplier "Hikvision MEA", project snapshot, value 480000); API list count=1; web page renders it under **Operate › Purchase orders**; `procurement.po.created` flowed through the outbox (`[Procurement] PO created` → `▶ procurement.po.created` → `Relayed`).

## Decisions

- **Operate-side, same template** — owns `aura_procurement_*`, references a Project by **id + snapshot** (no cross-module join; the web dropdown composes via the Projects API).
- **Supplier is a name for now** — there's no Suppliers module yet; a future Suppliers module turns `supplierName` into an id+snapshot like the project link.
- **BFF forwards identity** — every new write route carries the session token, so Procurement is enforced the moment auth is on.

## Next

Remaining T1: **Inventory** (MEP stores: receive against POs — `procurement.po.*` → `inventory.*`) · **Finance** (WIP/invoicing). PO status transitions (issue/receive/close) are a natural fit for the kernel **Workflow engine** — a follow-up. Then T2 (control/compliance: HSE, Quality, Document Control).
