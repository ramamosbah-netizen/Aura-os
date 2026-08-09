# Task List — AURA OS Master Platform Gap Remediation

- `[x]` **Task 1: Account Seeding Idempotency & Deduplication Script**
  - `[x]` Modify `apps/api/scripts/seed-demo.mjs` to fetch existing customer accounts before posting
  - `[x]` Create `scripts/dedupe-accounts.mjs` with `--dry-run` and live merge CLI options
- `[x]` **Task 2: Money-Cycle Loading States & IPC Deep-Link**
  - `[x]` Add pending loading states (`disabled={busy}`, `aria-busy={busy}`, `Saving…`) to `opportunity-360-client.tsx`
  - `[x]` Deep-link IPC certificates directly to `/finance/customer-invoices?id=${invoiceId}`
- `[x]` **Task 3: Commercial Engine & Finance Business Rules**
  - `[x]` Auto-populate `validUntil` (+30 days) on quotation auto-drafts in `quotation.service.ts`
  - `[x]` Add manual Customer Invoice valuation cap validation in `invoice.service.ts`
  - `[x]` Add `validateContractCeiling` enforcing cumulative contract invoice ceiling in `customer-invoice.ts` and `CustomerInvoiceService.create`
- `[x]` **Task 4: UX Shell & PWA Offline Capabilities**
  - `[x]` Create `apps/web/public/manifest.json` for Web App Manifest
  - `[x]` Create `apps/web/public/sw.js` for baseline Service Worker offline caching
  - `[x]` Update `apps/web/components/app-shell.tsx` to register Service Worker, add `+ Create` dropdown, and add dynamic unread notification bell icon badge
- `[x]` **Task 5: Full Automated Verification (Phase 1)**
  - `[x]` Run `pnpm typecheck` (47/47 tasks successful, 0 errors)
  - `[x]` Run `pnpm test` (46/46 tasks successful, 0 errors)

## Phase 2A — Centralized Offline Field Engine
- `[x]` **Offline Engine & DB-Backed Idempotent Sync Queue**
  - `[x]` Create migration `0078_idempotency_records.sql` and DB-backed `IdempotencyService` with transactional atomicity
  - `[x]` Create `apps/web/lib/offline-store.ts` for IndexedDB `aura_offline_db` operations
  - `[x]` Create `apps/web/lib/offline-sync.ts` for `fetchWithOfflineFallback` with 409 code distinction and exponential backoff
  - `[x]` Create `apps/web/components/ui/offline-sync-indicator.tsx` and mount into `AppShell` header
  - `[x]` Integrate `daily-report-client.tsx` with offline storage fallback (Daily Reports + Labour Returns)

## Phase 3 — Data Integrity & Field Polish
- `[x]` **PO Line-Item Field-Level Diff Audit Logging**
  - `[x]` Compute per-field diff (title, reference, supplierId, supplierName) in `purchase-order.service.ts`
  - `[x]` Emit per-field audit entries into `aura_audit_log` via `AuditService`
- `[x]` **Activity Scoping Beyond CRM**
  - `[x]` `ActivityRelatedType` in `activity.ts` includes `'tender' | 'contract' | 'project'`
- `[x]` **Handover → AMC Draft Auto-Creation**
  - `[x]` Implement `AmcService.createFromHandover()` in `modules/amc/src/amc.service.ts`
  - `[x]` Wire `projects.project.completed` in `cross-module-subscriber.ts` to trigger `AmcService.createFromHandover`
- `[x]` **Adaptive Image Compression Before Upload**
  - `[x]` Implement `getAdaptiveCompressParams()` and `compressImage()` canvas utility in `file-attachment-zone.tsx`
  - `[x]` Adaptively compress images (1200px/0.75 for 4G, 1000px/0.65 for 3G, 800px/0.55 for offline)
- `[x]` **Site Survey Domain + Survey → Opportunity Automation**
  - `[x]` Create `modules/site/src/domain/survey.ts` with `clientEntityId` and `operationId`
  - `[x]` Export survey from `modules/site/src/index.ts` and add `createSurvey` to `SiteService`
  - `[x]` Wire `site.survey.completed` in `cross-module-subscriber.ts` to auto-create Opportunity with `source = 'site-survey'`
- `[x]` **Sidebar Collapse State Persistence**
  - `[x]` Hydrate and persist `sidebarHidden` state to `localStorage('aura:sidebar-collapsed')` in `app-shell.tsx`

## Phase 4 — AI Swarm Bus & Advanced Workflows
- `[x]` **AI Agent Swarm Event Bus**
  - `[x]` Add topic pub/sub broadcasting (`subscribeSwarm`, `publishSwarmSignal`) to `AgentCollaborationService` in `intelligence/src/agent-collaboration.service.ts`
- `[x]` **Asynchronous Vector RAG Ingestion Queue**
  - `[x]` Add background queueing (`enqueueAsyncIngestion`, `getIngestionJobStatus`) to `DocumentIngestionService` in `intelligence/src/document-ingestion.service.ts`
- `[x]` **WBS Cost Variance Rollup Engine**
  - `[x]` Implement `rollupCostVariances(projectId)` in `modules/projects/src/wbs.service.ts`
- `[x]` **Full Verification Pass**
  - `[x]` `pnpm typecheck` (47/47 tasks successful, 0 errors)
  - `[x]` `pnpm test` (46/46 tasks successful, 0 errors)
