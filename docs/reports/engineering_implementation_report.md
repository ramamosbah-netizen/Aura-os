# Aura OS: Engineering Module Implementation Report

This report summarizes the design, database schemas, event-spine contracts, backend service layer, and frontend client views implemented for the **Engineering (Technical Control & Compliance)** module (`@aura/engineering`).

## 1. Database Migrations (`0020_engineering.sql`)

We created a schema-per-module design pattern inside Postgres, mapping drawings, RFIs, and technical/material submittals, and configured Row-Level Security (RLS) policies:

*   **`aura_engineering_drawings`**:
    *   `id`, `tenant_id`, `company_id`, `code` (unique per project/rev), `title`, `revision`, `status` (`draft`, `pending_approval`, `approved`, `rejected`), `project_id`, `project_name`, `owner_id`, `created_by`.
*   **`aura_engineering_rfis`**:
    *   `id`, `tenant_id`, `company_id`, `code` (unique per project), `title`, `question`, `answer`, `status` (`open`, `answered`, `closed`), `project_id`, `project_name`, `assigned_to`, `owner_id`, `created_by`.
*   **`aura_engineering_submittals`**:
    *   `id`, `tenant_id`, `company_id`, `code` (unique per project), `title`, `submittal_type` (`material`, `technical`, `sample`, `drawing`), `status` (`draft`, `submitted`, `approved`, `rejected`), `project_id`, `project_name`, `owner_id`, `created_by`.

## 2. Event Spine Contracts

Registered the following events inside the shared event catalog (`shared/src/events/catalog.ts`):
*   `engineering.drawing.created`
*   `engineering.drawing.revised`
*   `engineering.rfi.raised`
*   `engineering.rfi.answered`
*   `engineering.submittal.created`
*   `engineering.submittal.status_changed`

## 3. Bounded Context Package (`@aura/engineering`)

Implemented the `@aura/engineering` package under `modules/engineering/` matching the template architecture:
*   **Domain Models**: Defines entity interfaces and helper constructor factories (`makeDrawing`, `makeRfi`, `makeSubmittal`).
*   **Store Interfaces**: `DrawingStore`, `RfiStore`, and `SubmittalStore` with transaction handles (`TxHandle`) to support atomic operations.
*   **Implementations**:
    *   **In-Memory**: `InMemoryDrawingStore`, `InMemoryRfiStore`, `InMemorySubmittalStore` for development/testing.
    *   **Postgres**: `PostgresDrawingStore`, `PostgresRfiStore`, `PostgresSubmittalStore` using direct `PoolClient` queries.
*   **Service Layer**: `EngineeringService` coordinates operations, validates access permissions, applies status changes, and appends outbox events atomically via `TxRunner`.
*   **Module Registration**: `EngineeringModule` injects appropriate database stores based on the active `PG_POOL`.

## 4. Host API & BFF Proxy Wiring

*   **API Router**: Implemented `EngineeringController` (`apps/api/src/engineering/engineering.controller.ts`) routing HTTP requests to the `EngineeringService`.
*   **AppModule Integration**: Registered the controller and module in `AppModule`.
*   **BFF Proxy Routing**: Implemented Next.js BFF route handlers under `apps/web/app/api/engineering/` translating client fetch requests to the NestJS API server.
*   **Frontend Dashboard**: Implemented `apps/web/app/engineering/page.tsx` and `apps/web/components/engineering-client.tsx` creating a stunning, dark-themed responsive workspace with tabs for shop drawings, RFIs, and submittals.

## 5. Verification & Test Suite

All workspace tests compile and execute cleanly:
```bash
$ turbo run test
✓ @aura/engineering:test (passed)
✓ @aura/api:test (passed)
✓ @aura/shared:test (passed)
...
Tasks:    24 successful, 24 total
Time:    28.982s
```
