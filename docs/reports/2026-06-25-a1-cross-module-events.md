<!-- AURA OS — Step A1 Report: Cross-Module Event Wiring -->
# Step A1 — Cross-Module Event Wiring

**Date:** 2026-06-25  
**Status:** ✅ Complete  
**Build:** 12/12 tasks successful, 0 errors  

---

## What was done

### 1. Event Catalog Expansion (12 → 46 event types)

Expanded `shared/src/events/catalog.ts` from 12 basic event types to 46 comprehensive
lifecycle events covering all 7 T1 modules + future modules:

| Module | Events Added |
|---|---|
| **CRM** | `account.created`, `account.updated`, `account.status_changed` |
| **Tendering** | `tender.registered`, `tender.updated`, `tender.submitted`, **`tender.awarded`**, `tender.lost`, `bid.decided` |
| **Contracts** | `contract.created`, `contract.updated`, **`contract.signed`**, `contract.completed` |
| **Projects** | `project.created`, `project.updated`, `project.started`, `project.completed`, `cost.committed`, `cost.actual`, `budget.overrun` |
| **Procurement** | `po.created`, `po.updated`, **`po.approved`**, `po.issued`, `po.closed`, `grn.received` |
| **Inventory** | `grn.created`, `grn.updated`, `grn.inspected`, **`grn.accepted`**, `stock.low` |
| **Finance** | `invoice.created`, `invoice.updated`, `invoice.approved`, **`invoice.paid`**, `payment.recorded`, `journal.posted` |
| **Subcontracts** | `subcontract.created`, `ipc.certified`, `retention.released` |

### 2. Module Domain Event Constants Expanded

Every module's domain `*_EVENT` constant was expanded to include full lifecycle events:
- `CRM_EVENT`: +2 events (updated, status_changed)
- `TENDER_EVENT`: +4 events (updated, submitted, **awarded**, lost)
- `CONTRACT_EVENT`: +3 events (updated, **signed**, completed)
- `PROJECT_EVENT`: +6 events (updated, started, completed, costCommitted, costActual, budgetOverrun)
- `PROCUREMENT_EVENT`: +4 events (updated, **approved**, issued, closed)
- `INVENTORY_EVENT`: +4 events (updated, inspected, **accepted**, stockLow)
- `FINANCE_EVENT`: +5 events (updated, **approved**, **paid**, paymentRecorded, journalPosted)

### 3. Update & Status Transition Capabilities

Added `update()` and `changeStatus()` methods to:

**Store interfaces** (+ in-memory + Postgres implementations):
- `TenderStore.update()` — all 3 files
- `ContractStore.update()` — all 3 files

**Services**:
- `TenderService.update()` — patch mutable fields
- `TenderService.changeStatus()` — status transitions with specific event types
- `ContractService.changeStatus()` — same pattern

### 4. Cross-Module Event Subscriber (the reactor)

Created `apps/api/src/events/cross-module-subscriber.ts` — the architectural centerpiece:

```
┌───────────────────────┐     ┌──────────────────────┐     ┌───────────────────┐
│ tender.awarded        │ ──► │ auto-create Contract │ ──► │ contract.signed   │
│ (tender won)          │     │ (draft)              │     │ auto-create       │
└───────────────────────┘     └──────────────────────┘     │ Project (planned) │
                                                           └───────────────────┘

procurement.po.created   ──► log committed cost against project
inventory.grn.accepted   ──► suggest AP invoice
finance.invoice.paid     ──► log actual cost against project
```

### 5. API Endpoints for Status Transitions

Added PATCH endpoints:
- `PATCH /api/tendering/tenders/:id/status` → `{ "status": "won" }` triggers deal chain
- `PATCH /api/contracts/contracts/:id/status` → `{ "status": "active" }` = signed

### 6. Wired into AppModule

`CrossModuleSubscriber` registered as a provider in `AppModule`, subscribing to events
on module init.

---

## Files changed

| File | Action | Description |
|---|---|---|
| `shared/src/events/catalog.ts` | Modified | 12 → 46 event types |
| `modules/crm/src/domain/account.ts` | Modified | +2 event types |
| `modules/tendering/src/domain/tender.ts` | Modified | +4 event types |
| `modules/tendering/src/tender-store.ts` | Modified | +update() |
| `modules/tendering/src/in-memory-tender-store.ts` | Modified | +update() |
| `modules/tendering/src/postgres-tender-store.ts` | Modified | +update() |
| `modules/tendering/src/tender.service.ts` | Modified | +update(), +changeStatus() |
| `modules/contracts/src/domain/contract.ts` | Modified | +3 event types |
| `modules/contracts/src/contract-store.ts` | Modified | +update() |
| `modules/contracts/src/in-memory-contract-store.ts` | Modified | +update() |
| `modules/contracts/src/postgres-contract-store.ts` | Modified | +update() |
| `modules/contracts/src/contract.service.ts` | Modified | +changeStatus() |
| `modules/projects/src/domain/project.ts` | Modified | +6 event types |
| `modules/procurement/src/domain/purchase-order.ts` | Modified | +4 event types |
| `modules/inventory/src/domain/goods-receipt.ts` | Modified | +4 event types |
| `modules/finance/src/domain/invoice.ts` | Modified | +5 event types |
| `apps/api/src/events/cross-module-subscriber.ts` | **New** | Deal chain reactor |
| `apps/api/src/tendering/tendering.controller.ts` | Modified | +PATCH status |
| `apps/api/src/contracts/contracts.controller.ts` | Modified | +PATCH status |
| `apps/api/src/app.module.ts` | Modified | Wire CrossModuleSubscriber |

---

## How to test the deal chain

```bash
# 1. Start the API
pnpm --filter @aura/api start:dev

# 2. Create a tender
curl -X POST http://localhost:4000/api/tendering/tenders \
  -H "Content-Type: application/json" \
  -d '{"title": "MEP Fit-Out Tower B", "value": 5000000}'

# 3. Mark it as won → auto-creates a Contract
curl -X PATCH http://localhost:4000/api/tendering/tenders/<tender-id>/status \
  -H "Content-Type: application/json" \
  -d '{"status": "won"}'

# 4. Sign the auto-created contract → auto-creates a Project
curl -X PATCH http://localhost:4000/api/contracts/contracts/<contract-id>/status \
  -H "Content-Type: application/json" \
  -d '{"status": "active"}'

# 5. Verify the chain in the console logs:
# ⚡ tender.awarded → auto-created Contract "Contract for MEP Fit-Out Tower B"
# ⚡ contract.signed → auto-created Project "Project: Contract for MEP Fit-Out Tower B"
```
