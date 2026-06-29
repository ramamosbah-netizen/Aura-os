# Phase 8 Sprint 3 Implementation Report — Structured Data Ingestion

This report documents the implementation of the **Structured Data Ingestion** milestones (Weeks 5-6) under Phase 8, introducing server-side Excel BOQ parsing, automated cost recalculation rollup to CBS nodes, and dynamic multi-tier Row-Level Security (RLS) scopes.

---

## 1. Accomplished Actions

### A. Server-Side Excel BOQ Parser
- Added a new multipart file upload endpoint `@Post(':id/boq/upload')` in `TenderingController` (`apps/api/src/tendering/tendering.controller.ts`) using NestJS `@UseInterceptors(FileInterceptor('file'))`.
- Leveraged the `xlsx` library to read raw sheet buffers, parse rows, and automatically detect column indexes for required fields: `Item Code` (code/item/no.), `Description` (desc/particular/title), `Unit`, `Quantity` (qty/quant), `Rate` (rate/price), and optional `BIM IFC GUID`.
- Formatted extracted lines and delegated to `TenderService.importBOQItems` for atomic persistence and bid recalculation.

### B. Cost Recalculation Engine (Project CBS Integration)
- Added the `syncFromBoq` method to `CbsService` (`modules/projects/src/cbs.service.ts`), which takes imported flat BOQ items and maps them directly to project `CbsNode` budget limits.
- Built a hierarchy solver that sorts items by `itemCode` depth (dot-notation splitting) to create parent nodes first, automatically resolved and linked `parentId` relations dynamically, and updated budget totals.
- Registered a subscription handler in `CrossModuleSubscriber` (`apps/api/src/events/cross-module-subscriber.ts`) for `tendering.tender.updated` events. When a tender's BOQ is modified or uploaded, the subscriber locates downstream contracts and active projects, executing `syncFromBoq()` to propagate estimated budgets to project Cost Breakdown Structures.

### C. Dynamic Hierarchical RLS Policies
- Designed and applied SQL migration `0049_dynamic_hierarchical_rls.sql` establishing dynamic isolation policies for projects and sub-resources (CBS, WBS, Delays, EOTs).
- Introduced `branch_id` scoping to project records.
- Configured dynamic session helper functions `public.current_branch_id()` and `public.current_project_id()` querying active transaction variables or extracting claims from request JWT context.
- Implemented RLS rules validating authorization boundaries recursively through `tenant_id` → `company_id` → `branch_id` → `project_id`.

### D. Web UI Integration
- Upgraded the Next.js BFF endpoint `apps/web/app/api/tendering/tenders/[id]/boq/upload/route.ts` to accept multi-part file payloads and forward them with authenticating headers to NestJS.
- Enhanced the `TenderDetail` component modal (`apps/web/components/tender-detail.tsx`), introducing a file dropzone/selector to trigger Excel uploads with loading spinner tracking.

---

## 2. Verification & Verification Status

- **Database Migrations:** Executed `pnpm db:migrate` successfully, applying `0047_projects_cbs.sql`, `0048_finance_tax_engine.sql`, and `0049_dynamic_hierarchical_rls.sql` to the active database.
- **Unit Testing:** Created `modules/projects/src/cbs-sync.test.ts` validating `syncFromBoq` hierarchy parsing, child-parent references, and budget amounts. Ran `pnpm --filter @aura/projects test` with 14/14 tests passing.
- **Compilation Check:** Ran NestJS (`pnpm --filter @aura/api build`) and Next.js (`pnpm --filter @aura/web build`) builds, finishing successfully without warnings.
