# Report — T1.6: Inventory module (Goods Receipts v1) — second operate-side module

**Date:** 2026-06-25 · **Repo:** `Desktop/aura-os` (local, branch `main`) · **Increment:** the operate side extends — **Inventory / Goods Receipts**, receiving against Procurement's POs. Confirms the template generalizes across the operate axis, not just the deal chain.

> A GRN records goods received against an **issued PO**. It references the PO by id + title snapshot and carries the supplier + project snapshots down from it — the operate chain (project → PO → GRN), still join-free.

---

## What was built

**`modules/inventory` — the `@aura/inventory` package:** framework-free `GoodsReceipt` domain (references `poId`+`poTitle`; carries `supplierName`, `projectId`+`projectName`); store port + Postgres/in-memory (filters tenant/status/po/project); `GoodsReceiptService` (owns data, access seam `assert('inventory.grn.create')`, emits `inventory.grn.created` with po + project + supplier in the payload). 4 vitest tests.

**API** (`apps/api`): `InventoryController` (`POST/GET /api/inventory/grns`, list filters `?status`/`?poId`/`?projectId`). Wired into `AppModule`. Migration `0010_inventory_grns.sql` (`aura_inventory_grns`, indexed tenant/status/po/project, RLS).

**Web** (`apps/web`): **Goods receipts** added to the **Operate** nav group → `/inventory/grns` page + BFF route (forwards the auth header) + `components/grn-create.tsx`. The page fetches GRNs **and issued POs in parallel** (`/api/procurement/purchase-orders?status=issued`); the form's dropdown is those issued POs, and picking one inherits its supplier + project + value.

**Access:** `AuthSeeder`'s `dealChainAdmin` role now includes `inventory.*`, so the signed-in admin can record GRNs under lockdown.

## Verified

- `pnpm build` → **11/11**. Web routes now include `/inventory/grns` + `/api/inventory/grns`.
- `pnpm test` → **90/90** (86 + **4 new inventory**).
- `pnpm db:migrate` → applied **`0010`** (skipped 0001–0009).
- **Live, operate chain**: project `Ops Probe Project` → **issued** PO `Switchgear PO` (Globex MEP, in the `?status=issued` feed carrying project + supplier) → GRN `Switchgear received` raised against it, inheriting supplier + project + value → persisted → `inventory.grn.created` with `payload.po {id,title}` + `payload.project {id,name}` + supplier. **project→PO→GRN id-consistency check passed.** `[Procurement] PO created` → `[Inventory] GRN created` → relayed.

## Decisions

- **The operate axis is now a chain too.** Procurement (PO) → Inventory (GRN) mirrors the deal-chain pattern: each step references its predecessor + carries the through-line (project) down by snapshot. A spine consumer can trace project → PO → GRN from event payloads alone.
- **Compose via the issued-PO feed.** The GRN form sources options from the Procurement API filtered to `status=issued` — the same status-filtered composition the deal chain uses (won tenders, active contracts).
- **Template held a sixth time** — clone, swap the domain fields, wire. The procurement clone (operate-side) generalized to inventory with zero new patterns.

## Next

- **Finance** — invoices against POs / contracts (the money layer; completes the core operate loop: spend → receive → pay).
- **Web Supabase login** — the one remaining auth piece (the API already accepts Supabase JWKS tokens).
- Deepen **Intelligence** (operate-side metrics on the spine) or **kernel hardening** (relay/webhook retry + backoff + dead-letter, atomic event-in-tx).
