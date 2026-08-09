# Implementation Plan — Phase 3: Platform Polish & Automation Gaps

Close the next batch of 6 remaining gaps from the master platform gap report. These are medium-priority polish and automation items that improve daily UX, data integrity, and cross-module journey completeness.

## Completed Phases (Reference)

| Phase | Items Closed | Status |
|---|---|---|
| Phase 1 | Account seeder, busy indicators, deep-link, quotation expiry, contract ceiling, PWA | ✅ |
| Phase 2A | DB-backed idempotency, IndexedDB queue, offline sync engine, topbar indicator, daily-report integration | ✅ |

---

## Proposed Changes

### Gap 1: Sidebar Collapse State Persistence

> [!NOTE]
> Currently toggling the sidebar (`Ctrl+B`) updates React state only. Refreshing the page resets to expanded. This is a quick UX win.

#### [MODIFY] [app-shell.tsx](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/web/components/app-shell.tsx)
- Initialize `collapsed` state from `localStorage.getItem('aura:sidebar-collapsed')`.
- On toggle, persist to `localStorage.setItem('aura:sidebar-collapsed', ...)`.
- Guard with `typeof window !== 'undefined'` for SSR safety.

---

### Gap 2: Activity Scoping Beyond CRM

> [!NOTE]
> `ActivityRelatedType` currently supports `'account' | 'contact' | 'opportunity' | 'lead' | 'quotation'`. Extend to include `'tender' | 'contract' | 'project'` so that activities (calls, emails, meetings) can be logged against downstream deal-chain entities.

#### [MODIFY] [activity.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/modules/crm/src/domain/activity.ts)
- Extend `ActivityRelatedType` union to add `'tender' | 'contract' | 'project'`.

#### [MODIFY] Activity UI Picker (if applicable)
- Update any `<select>` or picker that enumerates related types to include the new options.

---

### Gap 3: Field Form Image Compression Before Upload

> [!IMPORTANT]
> Mobile site photos from camera captures are 3–8 MB each. Client-side canvas compression to ≤800KB/1200px max dimension significantly reduces upload time on poor field networks and storage costs.

#### [MODIFY] [file-attachment-zone.tsx](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/web/components/ui/file-attachment-zone.tsx)
- Add `compressImage(file: File, maxDimension = 1200, quality = 0.75): Promise<File>` utility.
- Before adding to `attachments` state, detect `file.type.startsWith('image/')` and run through the canvas compressor.
- Preserve original filename with `.jpg` extension swap.
- Skip compression for non-image files (PDFs, docs).

---

### Gap 4: PO Line-Item Field-Level Diff Audit Logging

> [!NOTE]
> Quotations, Contracts, and Invoices capture exact before→after diffs in `aura_audit_log`, but PO line-item edits only log aggregate order total changes.

#### [MODIFY] [purchase-order.service.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/modules/procurement/src/purchase-order.service.ts)
- In the `update` method, compute a per-field diff of each line item (`description`, `quantity`, `unitPrice`, `total`) before persisting.
- Emit `po.lineItem.updated` audit events with `{ field, before, after }` payloads matching the existing `aura_audit_log` schema.

---

### Gap 5: Handover Completion → Automatic AMC Contract Creation

> [!IMPORTANT]
> When a project handover package is signed off, the warranty clock starts, but the transition to an AMC is manual today. This automates it via the existing cross-module event subscriber.

#### [MODIFY] [cross-module-subscriber.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/api/src/events/cross-module-subscriber.ts)
- Subscribe to `project.handover.completed` event.
- Auto-create a draft AMC contract via `AmcService.createFromHandover(projectId, warrantyStartDate, warrantyDuration)`:
  - Copy `clientAccountId`, `projectName`, `siteAddress` from the project.
  - Set `amcStartDate = warrantyEndDate + 1 day`.
  - Set `status = 'draft'` for PM review before activation.

#### [MODIFY] [amc.service.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/modules/amc/src/amc.service.ts) (or equivalent)
- Add `createFromHandover(projectId, warrantyStart, warrantyDuration)` method.

---

### Gap 6: Site Survey Intake → Automatic Opportunity Creation

> [!NOTE]
> Pre-sales site surveys are handled outside the automated intake pipeline today. This adds a dedicated survey form that auto-populates an Opportunity upon submission.

#### [NEW] [survey.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/modules/site/src/domain/survey.ts)
- Domain model: `SiteSurvey { id, accountId, contactName, siteAddress, scopeNotes, estimatedValue, surveyDate, photos, status }`.
- Factory function `makeSiteSurvey(input)` with validation.

#### [MODIFY] [cross-module-subscriber.ts](file:///c:/Users/Jeet_intech/Desktop/aura-os/apps/api/src/events/cross-module-subscriber.ts)
- Subscribe to `site.survey.completed` event.
- Auto-create an Opportunity via `OpportunityService.create({ accountId, title: 'Survey — {siteAddress}', estimatedValue, source: 'site-survey' })`.

---

## Open Questions

> [!IMPORTANT]
> **Image compression quality target:** The plan proposes `quality = 0.75` and `maxDimension = 1200px`. Should we use a more aggressive setting for very poor connectivity sites (e.g., `quality = 0.5`, `maxDimension = 800px`)?

> [!NOTE]
> **AMC auto-creation scope:** Should the auto-drafted AMC inherit the original contract's pricing/terms, or should it start with blank pricing rows for the PM to fill in?

---

## Verification Plan

### Automated Tests
- `pnpm typecheck` — all 47 packages must pass.
- `pnpm test` — all 46 packages must pass.
- Add unit tests for:
  - `compressImage` utility (verify output size < input size for a mock canvas).
  - `createFromHandover` AMC factory (verify draft AMC fields copied from project).
  - PO line-item diff audit event emission.

### Manual Verification
- Toggle sidebar, refresh page → sidebar state persists.
- Log an activity against a `tender` or `contract` entity → verify it appears in the entity's timeline.
- Upload a 5MB camera photo → verify compressed file ≤ 800KB before API upload.
