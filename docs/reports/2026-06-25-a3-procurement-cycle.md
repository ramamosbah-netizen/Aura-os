<!-- AURA OS — Step A3 Report: Procurement Full Cycle -->
# Step A3 — Procurement Full Cycle

**Date:** 2026-06-25  
**Status:** ✅ Complete  
**Build:** 12/12 tasks successful, 0 errors  
**Tests:** 17/17 tests passed (all tests in workspace passing)

---

## What was done

### 1. Purchase Request (PR) Lifecycle

Added the upstream procurement step to support organizational spend requests:

- **PR Domain Entity (`modules/procurement/src/domain/purchase-request.ts`)**
  - Defines `PurchaseRequest` structure: `id`, `tenantId`, `title`, `status` (`draft`, `submitted`, `approved`, `rejected`), `value`, and `projectId`/`projectName` reference snapshots.
- **Store Interfaces & Dual Stores**
  - `InMemoryPurchaseRequestStore` and `PostgresPurchaseRequestStore` with fast queries for filtering by project, status, and tenant.
- **Purchase Request Service**
  - Manages creation and status transitions (submitting, approving, rejecting) through the access control seam and emits corresponding spine events (`procurement.pr.*`).

### 2. Automated PO Generation

Upon approval of a Purchase Request:
1. `PurchaseRequestService.changeStatus(id, 'approved')` automatically invokes `PurchaseOrderService.create()`.
2. Seamlessly generates a `PurchaseOrder` in `'draft'` status with matching title, value, project snapshot, and creator details.

### 3. 3-Way Matching Logic

Implemented the validation mechanism to cross-reference:
1. **Purchase Order (PO)**: Ordered value.
2. **Goods Receipt Note (GRN)**: Actually received value.
3. **Supplier Invoice**: Billed value.

Inside `InvoiceService`:
- `checkThreeWayMatch(invoiceId)`:
  - If a PO is associated with the invoice, verify that the Invoice Value does not exceed the PO Value.
  - Verify that the Invoice Value does not exceed the sum of all matching, received GRNs.
- Enforced as a guard before an invoice status is changed to `'approved'`. If the 3-Way match fails, the status transition is rejected with an informative error message.

### 4. Controller Extensions & API Endpoints

Extended NestJS `@Controller('procurement')` to support:

- `POST /api/procurement/purchase-requests` — Create Purchase Request
- `GET /api/procurement/purchase-requests` — List Purchase Requests
- `GET /api/procurement/purchase-requests/:id` — View Purchase Request details
- `PATCH /api/procurement/purchase-requests/:id/status` — Change PR status (e.g. approve/reject)
- `PATCH /api/procurement/purchase-orders/:id/status` — Change PO status (e.g. issue)

### 5. DB Migration

Added `infrastructure/migrations/0015_procurement_pr.sql` to initialize `public.aura_procurement_purchase_requests` table with performance indexes and RLS enabled.

---

## Verification Results

Tests run against `@aura/procurement` and `@aura/finance`:
- `Procurement Full Cycle`:
  - ✓ PR domain model sanity
  - ✓ Auto-generates a draft PO on PR approval
- `3-Way Matching Logic`:
  - ✓ Reconciles correctly when PO value, GRN value, and Invoice value match
  - ✓ Fails if no GRNs exist yet (reconciliation error: exceeds total received GRN value)
  - ✓ Rejects invoice approval if invoice value exceeds PO value even if GRN has surplus items
