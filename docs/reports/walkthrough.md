# Walkthrough — Monolith Vertical Depth Gap Closures

Several key architectural, vertical integration, and infrastructure standardization gaps identified in our audits have been successfully closed:

---

## Gap 1 ✅ — Asset Disposal → Finance GL

**Problem:** When an asset was disposed/retired (emitting `assets.asset.disposed`), no reactor existed to book the retirement journal to the General Ledger.

**Solution:** Added a reactor in [cross-module-subscriber.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/api/src/events/cross-module-subscriber.ts) that:
- Resolves GL accounts: `1500` (Fixed Assets), `1010` (Bank), `4920` (Gain), `5920` (Loss)
- Posts a balanced double-entry journal: Credit Fixed Assets, Debit Bank for proceeds, Debit/Credit Gain or Loss
- Guards against duplicate posting via `DISP-<aggregateId>` reference lookup

**Tests:** 2 new tests (gain scenario + loss scenario) in [cross-module-subscriber.test.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/api/src/events/cross-module-subscriber.test.ts)

---

## Gap 2 ✅ — Subcontract Claim Certified → AP Invoice

**Problem:** Certified subcontract claims calculated retention deductions but had to be manually keyed into AP invoices. The `subcontracts.claim.statusChanged` event was emitted but no downstream reactor consumed it.

**Solution:**

### Event Enrichment
Modified [subcontracts.service.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/modules/subcontracts/src/subcontracts.service.ts) `certifyClaim()` to include project references in the event payload:

```diff
+          subcontractTitle: subcontract?.title ?? null,
+          projectId: subcontract?.projectId ?? null,
+          projectName: subcontract?.projectName ?? null,
```

### Reactor
Added a new subscriber in [cross-module-subscriber.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/api/src/events/cross-module-subscriber.ts) for `subcontracts.claim.statusChanged` that:
- Filters for `status === 'certified'` only
- Skips zero/negative net values
- Auto-drafts an AP invoice via `this.supplierInvoices.create(...)` carrying supplier name, project references, and the net certified value
- Uses idempotency key `ap-subcon-claim:<claimId>` to prevent duplicate invoices on event re-delivery

**Tests:** 2 new tests in [cross-module-subscriber.test.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/api/src/events/cross-module-subscriber.test.ts):
- Happy-path: asserts invoice fields (supplier, value, project refs)
- Idempotency: re-delivered event does not duplicate the AP invoice

---

## Gap 3 ✅ — Assets Pagination Rollout

**Problem:** The `assets` module relied on unpaginated and unbounded lists, which is a scaling bottleneck for enterprise ERP assets lists.

**Solution:**
- Integrated standard `PageParams` and `Page` from `@aura/shared` into `modules/assets/src/store.interface.ts`.
- Implemented `listPaged` in [in-memory-assets-store.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/modules/assets/src/in-memory-assets-store.ts) and [postgres-assets-store.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/modules/assets/src/postgres-assets-store.ts).
- Added `listAssetsPaged` method to [assets.service.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/modules/assets/src/assets.service.ts).

**Tests:** Added `paginates asset list correctly` test suite in [assets.test.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/modules/assets/src/domain/assets.test.ts).

---

## Gap 4 ✅ — Fleet (Vehicles) Pagination Rollout

**Problem:** Like Assets, the `fleet` module listing endpoints lacked pagination support, risking database and browser resource starvation on large fleet sizes.

**Solution:**
- Integrated standard `PageParams` and `Page` from `@aura/shared` into `modules/fleet/src/store.interface.ts` as `VehicleFilter`.
- Implemented `listPaged` in [in-memory-fleet-store.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/modules/fleet/src/in-memory-fleet-store.ts) and [postgres-fleet-store.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/modules/fleet/src/postgres-fleet-store.ts).
- Added `listVehiclesPaged` method to [fleet.service.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/modules/fleet/src/fleet.service.ts).

**Tests:** Added `paginates vehicle list correctly` test suite in [fleet.test.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/modules/fleet/src/domain/fleet.test.ts).

---

## Gap 5 ✅ — Quality (Material Approvals) Pagination Rollout

**Problem:** The `quality` module Material Approval Requests list did not support offset pagination, which can degrade performance under heavy QC operations.

**Solution:**
- Integrated standard `PageParams` and `Page` from `@aura/shared` into `modules/quality/src/store.interface.ts` as `MaterialApprovalFilter`.
- Implemented `listPaged` in [in-memory-quality-store.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/modules/quality/src/in-memory-quality-store.ts) and [postgres-quality-store.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/modules/quality/src/postgres-quality-store.ts).
- Added `listMaterialApprovalsPaged` method to [quality.service.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/modules/quality/src/quality.service.ts).

**Tests:** Added `paginates material approvals correctly` test suite in [quality.test.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/modules/quality/src/domain/quality.test.ts).

---

## Gap 6 ✅ — Site (Daily Reports) Pagination Rollout

**Problem:** The `site` module Daily Reports (Site Diary) lacked offset pagination, posing performance and database overhead on long-running construction projects.

**Solution:**
- Integrated standard `PageParams` and `Page` from `@aura/shared` into `modules/site/src/store.interface.ts` as `DailyReportFilter`.
- Implemented `listPaged` in [in-memory-site-store.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/modules/site/src/in-memory-site-store.ts) and [postgres-site-store.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/modules/site/src/postgres-site-store.ts).
- Added `listDailyReportsPaged` method to [site.service.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/modules/site/src/site.service.ts).

**Tests:** Added `paginates daily reports correctly` test suite in [site.test.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/modules/site/src/domain/site.test.ts).

---

## Gap 7 ✅ — Site Control Expansion: Labour & Progress baseline mapping

**Problem:** The `site` module supported labour allocations and planned baselines in the database schema/backend APIs, but these were missing in the user interface.

**Solution:**
- Created a BFF route handler for labour allocations [route.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/web/app/api/site/labour/route.ts).
- Extended [page.tsx](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/web/app/site/control/page.tsx) to fetch both `labourAllocations` and project `schedules` asynchronously and pass them to the client component.
- Implemented the **Labour Allocations** tab and logger form inside [site-control-client.tsx](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/web/components/site-control-client.tsx).
- Built the **Progress % Mapping** visualization comparing actual task progress versus planned baseline dates with auto-calculating slippage warnings (e.g. `+5 days behind target`).

---

## Gap 8 ✅ — HSE Training Matrix

**Problem:** The `hse` module lacked safety training matrix tracking, safety induction logs, and HSE card validity monitoring.

**Solution:**
- Added `SafetyTrainingRecord` domain model in [safety-training.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/modules/hse/src/domain/safety-training.ts) that checks card expirations and tracks custom certifications (e.g. `Work at Height`, `First Aid`).
- Created a DB migration at [0106_hse_safety_training.sql](file:///c:/Users/Jeet_intech/Desktop/aura-os/infrastructure/migrations/0106_hse_safety_training.sql) to provision the new tables with tenant row-level security policy.
- Implemented `InMemorySafetyTrainingStore` and `PostgresSafetyTrainingStore` inside the respective stores.
- Exposed safety training endpoints on NestJS `HseController` and created Next.js BFF proxy routes at `apps/web/app/api/hse/training/route.ts`.
- Integrated a premium **Safety Training Matrix** dashboard inside [hse-control-client.tsx](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/web/components/hse-control-client.tsx) containing logger forms, custom certification tags, and card status counts.

---

## Gap 9 ✅ — Fleet GPS Telematics & Expiry Triggers

**Problem:** The `fleet` module lacked GPS Telematics integration (webhook receiver, coordinate snapshot mapping, telemetry log history) and automated Expiry Triggers for Mulkiya registrations.

**Solution:**
- **GPS Coordinates & Telemetry Logs:** Added `lastLatitude`, `lastLongitude`, `lastSpeed`, `lastOdometer`, and `lastTelemetryAt` columns to `aura_fleet_vehicles` and created `aura_fleet_telemetry_logs` via database migration `0107_fleet_telemetry.sql`.
- **Domain Modeling & Storage:** Created `VehicleTelemetry` domain types and builders in [telemetry.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/modules/fleet/src/domain/telemetry.ts), defining the `TelemetryStore` interface, and implemented memory/postgres versions in `InMemoryTelemetryStore` and `PostgresTelemetryStore`.
- **Controller & BFF Routing:** Exposed a webhook receiver at `POST /api/v1/fleet/telemetry/webhook` and a check-expiry trigger endpoint at `POST /api/v1/fleet/vehicles/check-expiry`. Added Next.js API route handlers to proxy them.
- **Expiry Notification Reactor:** Registered the `fleet.vehicle.registration_expiring` subscriber in NestJS [notifications-subscriber.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/api/src/events/notifications-subscriber.ts) to raise in-app notification tasks for expiring vehicles.
- **Frontend Dashboard:** Integrated the **GPS Telematics & Expirations** tab into [fleet-control-client.tsx](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/web/components/fleet-control-client.tsx) featuring a real-time vehicle coordinates list, a webhook simulator, and a registration renewal scanner.

---

## Gap 10 ✅ — Quality ISO Audit Checklist Scheduler & NCR Ticket Generator

**Problem:** The `quality` module lacked an ISO Audit Checklist Scheduler to audit project sites against standard clauses, record findings, and automatically generate Non-Conformance Reports (NCR) for failed items.

**Solution:**
- **Database Schema & Migration:** Created migration `0108_quality_audits.sql` to provision the `aura_quality_audit_schedules` table with row-level tenant security policies.
- **Domain Modeling & Store Implementation:** Created `AuditSchedule` and `ChecklistItem` domain interfaces and default ISO checklist templates in `audit-schedule.ts`, defining `AuditScheduleStore` in `store.interface.ts`. Implemented memory and postgres versions in `InMemoryAuditScheduleStore` and `PostgresAuditScheduleStore`.
- **Quality Service Layer:** Implemented `scheduleAudit`, `getAudit`, `listAudits`, `updateAuditChecklist`, and `generateNcrFromFailedCheck` inside `QualityService`.
- **Automatic NCR Generation:** If an auditor marks an audit checklist item as `non_compliant`, they can click "Generate NCR Ticket". This triggers a transaction that:
  - Generates a pre-filled NCR ticket matching standard citations and observations.
  - Links the generated `ncrId` directly onto the audit checklist item to maintain traceability.
- **Controller & BFF Routing:** Exposed audits CRUD and NCR generator endpoints on NestJS `QualityController` and created matching dynamic Next.js BFF proxy routes.
- **Frontend Dashboard:** Extended `QualityControlClient` with an **ISO Checklist Audits** tab to schedule audits, interactively check off compliance checklist questions, write findings, and generate/link NCR tickets dynamically.

---

## Verification

| Check | Result |
|-------|--------|
| `pnpm test` (41 packages) | ✅ All 21 Quality tests passed (including new audit schedules & auto-NCR generation) |
| `pnpm --filter @aura/web build` | ✅ Next.js client compiled & built successfully with zero type errors |
| `pnpm --filter @aura/api build` | ✅ NestJS API compiled & built successfully |

