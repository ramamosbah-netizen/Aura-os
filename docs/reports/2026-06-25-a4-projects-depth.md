<!-- AURA OS — Step A4 Report: Projects Depth -->
# Step A4 — Projects Depth

**Date:** 2026-06-25  
**Status:** ✅ Complete  
**Build:** 12/12 tasks successful, 0 errors  
**Tests:** 8/8 tests passed in Projects module (all 20 workspace tests passing)

---

## What was done

### 1. Work Breakdown Structure (WBS) Nodes

Built the nested hierarchy for project delivery and tracking:

- **WBS Node Domain Entity (`modules/projects/src/domain/wbs.ts`)**
  - Defines `WbsNode` with nested structure: `id`, `tenantId`, `projectId`, `parentId` (hierarchy links), `code` (e.g. `"1.1.2"`), `title`, `plannedValue`, `earnedValue`, `actualCost`, `progress` percentage, and `status`.
- **Durable Store Options**
  - Created `InMemoryWbsStore` and `PostgresWbsStore` supporting project/parent filtering.
- **Hierarchical rollup Logic**
  - Implemented recursive `rollup(parentId)` in `WbsService`. When any leaf task changes (Planned Value, Progress/Earned Value, or Actual Spend), it recalculates the parent's metrics recursively up the tree to the root nodes.

### 2. Earned Value Management (EVM)

Added the metrics module to calculate cost/schedule performance index (CPI/SPI):

- **Planned Value (PV)**: Baseline budget.
- **Earned Value (EV)**: `plannedValue * (progress / 100)`.
- **Actual Cost (AC)**: Logged supplier expenditures.
- **Cost Performance Index (CPI)**: `EV / AC` (ratio > 1 is under-budget / favorable).
- **Schedule Performance Index (SPI)**: `EV / PV` (ratio > 1 is ahead of schedule / favorable).

### 3. Budget Depletion & Event Hook

Wired the actual costs rollup:
- Extended the `finance.invoice.paid` event payload to carry the associated `wbsNodeId`.
- Updated `CrossModuleSubscriber` to capture this event and trigger `wbsService.recordActualSpend(wbsNodeId, amount)`, automatically updating task metrics and rolling them up.

### 4. Controller Extensions & API Endpoints

Extended the controller prefix `/api/projects` with:

- `POST /api/projects/wbs` — Add WBS task node.
- `GET /api/projects/wbs` — Retrieve WBS nodes (filterable by project and parent).
- `GET /api/projects/wbs/:id` — View single WBS node details.
- `PATCH /api/projects/wbs/:id/progress` — Record percent complete and status changes.
- `GET /api/projects/projects/:id/evm` — Get real-time project EVM totals.

### 5. DB Migration

Added `infrastructure/migrations/0016_projects_wbs.sql` to initialize `public.aura_projects_wbs_nodes` table.

---

## Verification Results

Tests run against `@aura/projects`:
- `WBS Node Initialization`:
  - ✓ Trim validation and defaults
- `Recursive Hierarchy rollup`:
  - ✓ Parent Node aggregates child `plannedValue`
  - ✓ Parent Node aggregates progress changes dynamically (e.g., 20% on Parent when Child 1 is 50% done)
  - ✓ Parent Node aggregates `actualCost` when Child spend is recorded
- `EVM Performance Indexes`:
  - ✓ CPI and SPI calculate correctly for under/over performance
  - ✓ Division by zero defaults to 1.0 gracefully
