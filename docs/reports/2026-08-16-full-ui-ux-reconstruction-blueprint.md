# AURA OS — Full UI/UX Reconstruction Blueprint

**Date:** 2026-08-16  
**Repository baseline:** `798566fed246a5f38ce44ad1171d0bdef33350bc` plus the current uncommitted Projects/Operations reference-slice improvements  
**Scope:** complete frontend information architecture, navigation, page patterns, responsive behavior, accessibility, state handling, permissions, context, related records, Record 360, AI experience, migration, and verification.  
**Decision status:** approved technical direction for phased implementation; not an instruction to mass-rewrite all pages.

## 1. Executive decision

AURA OS already has enough functional breadth. The reconstruction must connect and standardize the current product, not create another business module or replace working domain logic.

The approved direction is:

1. Preserve the modular backend, APIs, state machines, authorization, RLS, and event-driven business spine.
2. Reorganize the frontend into **AURA Home plus ten business Suites**, without treating Suites as new backend boundaries.
3. Make **Project 360 / Project Command Center** the unified delivery context for Engineering, Site, Quality, HSE, Materials, Progress, Commissioning, Handover, and Assets.
4. Treat the ELV/System/Device layer as identity, schedule, and lifecycle linkage—not as a second ERP inside AURA OS.
5. Consolidate the UI around a small set of shared page contracts: Home, Suite Home, Register, Record 360, governed workflow, Admin, and Print.
6. Require truthful loading, empty, forbidden, unreachable, server-error, and degraded states.
7. Migrate in verified slices. Existing routes remain valid until redirects, permissions, deep links, and browser journeys are proven.

The governing product rule remains:

> No new business module until the existing project-delivery spine is connected and usable end to end.

## 2. Evidence and reproducibility

This blueprint is based on the current tree, not on the requested IA alone.

Primary evidence:

- [Current full application audit](./2026-08-16-full-app-audit.md)
- [Current frontend surface audit](./2026-08-15-frontend-surface-audit.md)
- [173-page UX scorecard](./2026-08-15-per-page-ux-scorecard.md)
- [Frontend completion gap register](./2026-08-15-frontend-completion-ux-gap-register.md)
- [Business workflow audit](../aura-audit/03-BUSINESS-WORKFLOWS.md)
- [Frontend/UX audit](../aura-audit/06-FRONTEND-UX-AUDIT.md)
- [Security audit](../aura-audit/07-SECURITY-AUDIT.md)
- [Project and delivery audit](../aura-audit/10-PROJECT-ENGINEERING-AUDIT.md)
- [Commissioning, handover, and AMC audit](../aura-audit/11-COMMISSIONING-HANDOVER-AMC.md)
- [Inventory and procurement audit](../aura-audit/12-INVENTORY-PROCUREMENT-AUDIT.md)
- [Admin control-plane audit](../aura-audit/13-ADMIN-CONTROL-PLANE.md)
- [Performance and scalability audit](../aura-audit/16-PERFORMANCE-SCALABILITY.md)
- [AI and agent forensic audit](./2026-08-15-ai-agent-forensic-audit.md)
- [Machine-readable current-tree inventory](./2026-08-16-ui-reconstruction-inventory.json)
- [Every-page migration matrix](./2026-08-16-page-migration-matrix.csv)

The inventory is reproducible with `scripts/ui-reconstruction-inventory.mjs`. Static signals establish presence in source only; they do not establish usability or Page Definition of Done.

## 3. Current-tree baseline

| Metric | Re-measured value |
|---|---:|
| Workspace packages | 27 |
| Business modules | 21 |
| TypeScript/TSX files | 2,157 |
| API controllers | 102 |
| HTTP handler decorators | 937 |
| Next.js pages | **174** current (**173** audited baseline + canonical Project Controls route added in Batch 2) |
| Web TSX files | 486 |
| Shared/component TSX files | 236 |
| SQL migrations | 232 |
| Distinct created tables | 218 |
| Index declarations | 365 |
| RLS policies | 148 |
| Test/spec files | 334 |
| API E2E files | 44 |
| Browser E2E files | 14 |
| ADR documents | 20 |

Current page shapes:

| Page shape | Count |
|---|---:|
| Registers/workspaces | 97 |
| Configuration/admin | 23 |
| Record detail | 23 |
| Home/command center | 15 |
| Print | 14 |
| Authentication | 1 |

The current static pass places 154 pages in “exists but UX weak,” 14 print pages in “retain,” and only 5 in “retain and integrate.” It finds 92 pages with no responsive signal, 89 with no related-link signal, and 11 record-detail routes that still require the shared Record 360 shell. These are triage signals, not accessibility or functional test results.

### Current verification run

| Gate | Result on current working tree |
|---|---|
| Repository typecheck | **PASS** — 51/51 tasks |
| Lint | **PASS with debt** — 0 errors, 729 warnings after the Project 360 ownership slice (ratchet baseline was 732) |
| Unit/module tests | **PASS** — 51/51 tasks; web 51/51 tests |
| API HTTP E2E | **PASS** — 44/44 files, 221/221 tests |
| Focused authenticated Projects/Operations browser journey | **PASS** — Chromium desktop + 390px mobile viewport |
| Production build | **PASS** — 27/27 tasks; 202 Next routes generated |
| Production dependency audit | **FAIL from same-date audit** — 23 advisories; remediation remains a release gate |
| Live production Auth/RLS evidence | **NOT VERIFIED** — requires the deployed environment |

The browser verification used isolated scratch ports and an in-memory authenticated API. It proves the current reference slice, not the entire 174-page reconstruction. The user's existing local development process and environment file were left intact.

## 4. Truth vocabulary

All future reports, navigation, Suite homes, and release notes use these exact states:

| State | Meaning |
|---|---|
| `IMPLEMENTED` | The capability exists, is reachable in the UI, and its required verification chain passes. |
| `PARTIALLY IMPLEMENTED` | A real capability exists, but the journey, depth, UI, or verification is incomplete. |
| `UI MISSING` | The backend/domain capability exists, but no first-class user surface exists. |
| `NOT IMPLEMENTED` | The business capability is absent; a placeholder must not imply otherwise. |
| `NOT VERIFIED` | Source signals exist or the behavior is plausible, but the required evidence has not been produced. |

Every current route in the page matrix is marked `IMPLEMENTED_PAGE_SURFACE` and separately `NOT_VERIFIED_TO_PAGE_DOD`. This prevents “there is a page.tsx” from being reported as “the experience is complete.”

## 5. Current capability assessment by target Suite

| Target area | Current evidence | Status | Principal gap |
|---|---|---|---|
| AURA Home | Root and My Day surfaces exist | `PARTIALLY IMPLEMENTED` | Not yet a role-aware universal work/attention layer |
| Workplace & Collaboration | Workspace, views, inbox, notifications, documents, events | `PARTIALLY IMPLEMENTED` | Meetings/calendar/team collaboration depth must not be overstated |
| Sales & Pre-Award | CRM, tendering, BOQ/estimate, quotations, governed commercial flow | `IMPLEMENTED` with UX debt | Consolidated Suite Home, consistent 360s, win/loss analytics UI |
| Project Delivery | Projects, Engineering, Doc Control, Site, Quality, HSE, Commissioning, Handover | `IMPLEMENTED` with fragmented UX | Unified Project 360 and cross-record context |
| Commercial & Contracts | Contracts, subcontracts, variations/certificates/obligations | `IMPLEMENTED` with partial embedded surfaces | Obligations queue and unified commercial 360 |
| Supply Chain | PR→RFQ→PO, GRN, inventory, serials, bins, transfers | `IMPLEMENTED` with specific gaps | Framework/call-off UI, allocation/valuation proof, field UX |
| Finance | 21 pages and real finance engine | `IMPLEMENTED` | Profit-center UI; money/rounding and report-freshness proof |
| Assets & Service | Assets, AMC, fleet and lifecycle events | `PARTIALLY IMPLEMENTED` | Technician field journey, warranty/PPM depth |
| People & Organization | Broad HR surface | `PARTIALLY IMPLEMENTED` | Org chart UI, WPS/SIF trigger, self-service depth |
| Intelligence & Reporting | Reporting surfaces and governed AI platform | `PARTIALLY IMPLEMENTED` | Most agents lack executable live-data tools |
| Administration & Governance | 24 pages and real enforced control plane | `IMPLEMENTED` with consolidation debt | Outbox/job operations and deeper security posture UI |

### Workplace & Collaboration target capability truth

These capabilities remain in the target architecture even when today’s product does not implement them. A target label is not a claim that the capability exists.

| Target capability | Current status | Evidence / boundary |
|---|---|---|
| My Work | `PARTIALLY IMPLEMENTED` | Workspace and CRM My Day aggregate real work, but there is no universal role-aware work contract yet |
| Tasks | `PARTIALLY IMPLEMENTED` | CRM activities/tasks and approval inbox exist; cross-Suite task ownership is incomplete |
| User calendar | `UI MISSING` | A business-calendar administration engine exists, and dated activities exist, but no first-class personal/team calendar was verified |
| Meetings — agenda | `PARTIALLY IMPLEMENTED` | Meeting/site-visit activity types and agenda grouping exist; no canonical Meeting record exists |
| Meetings — attendees | `NOT IMPLEMENTED` | No general meeting attendee model or journey was found; HSE toolbox-talk attendees are a separate domain record |
| Meetings — MOM | `NOT IMPLEMENTED` | AI meeting-summary drafting is not a governed Minutes of Meeting record |
| Meetings — decisions | `NOT IMPLEMENTED` | No canonical meeting-decision register was verified |
| Meetings — actions | `PARTIALLY IMPLEMENTED` | Follow-up tasks can be activities, but they are not owned by a Meeting/MOM lifecycle |
| Communications — internal | `IMPLEMENTED` | Tenant-scoped team chat and internal mail have real API/UI surfaces |
| Communications — external email integration | `NOT VERIFIED` | SMTP administration UI exists; delivery-provider operation has not been evidenced end to end |
| Communications — WhatsApp integration | `NOT IMPLEMENTED` | WhatsApp appears as an activity vocabulary and an unconfigured admin target; no operational Business API journey exists |
| Documents — files | `IMPLEMENTED` | Versioned DMS stores and downloads real document content |
| Documents — versions | `IMPLEMENTED` | Version creation and version download are implemented |
| Documents — sharing | `IMPLEMENTED` | Share, revoke, shared-with-me, and permission-aware UI/API exist |
| Documents — related records | `PARTIALLY IMPLEMENTED` | Aggregate links exist in selected workflows, but Related Records is not consistently adopted across 360s |
| Notifications | `IMPLEMENTED` | Notification API/UI and unread flows exist |
| Saved Views | `IMPLEMENTED` | Tenant/user saved query views exist; adoption across registers remains incomplete |

### Explicit UI-missing capabilities

- ELV device register, device schedule, and Device 360 lifecycle workspace.
- Procurement framework agreements and call-offs.
- Tender win/loss analytics.
- Finance profit-center reporting.
- Project cashflow forecast, cost ledger, and quantity ledger views.
- HR organization chart and WPS/SIF trigger.
- Dedicated cross-contract obligations, correspondence, quality audits, and subcontract 360 where currently embedded only.

### Explicit not-implemented or not-verified capabilities

- A complete technician field-service journey is not implemented as an end-user experience.
- Full multi-company isolation across browser tabs is not verified.
- WCAG 2.1 AA conformance is not verified.
- Production-scale performance is not measured.
- Autonomous AI operations are not implemented; the safe description is supervised copilot/proposal system.
- Live production Auth + non-bypass RLS + cross-tenant denial remain release-evidence gates.

## 6. Current role and permission model

The backend is authoritative. UI visibility is convenience and clarity, never a substitute for an API denial.

| Standard role | Primary work | Deliberate restriction |
|---|---|---|
| Sales | Leads, opportunities, quotations | Cannot approve quotations |
| Sales Manager | Sales plus approval | Approval still subject to grant value threshold |
| Project Manager | Projects, WBS/CBS, schedule, variations, IPC preparation | Cannot certify their own commercial outcome |
| Site Engineer | Daily reports, labour/plant, installations, inspection requests | QA/QC owns inspection decisions |
| QA/QC | Inspections, NCR, snag, ITP, material approval | Cross-domain areas generally read-only |
| HSE | Incidents, permits, CAPA, toolbox talks, risk assessments | Permit maker-checker and validity gates remain service-enforced |
| Procurement | PR/RFQ/supplier/PO | Approval subject to grant/approval matrix |
| Store/Warehouse | GRN, stock, transfer, serials | May read PO but not approve it |
| Finance | Invoices, payments, GL, budgets, close | Certifies certificates raised by PM |
| Administrator | Tenant platform control | Full access; high-risk actions require explicit confirmation/audit |
| Client | Scoped external read access | Must be account/project scoped, never tenant-wide |

Current frontend navigation uses coarse `suite.*` gates and hides tenant-disabled modules. This is useful, but action-level visibility is not proven across every page. The reconstruction therefore requires a generated route/action permission inventory and permission-sensitive action tests.

Important authorization risk: project-scoped guards can apply the project resource when `projectId` is present in route/body/query. Entity-ID-only routes may remain organization-scoped unless the service resolves the entity back to its project. Record 360 migration must not assume that a UI link proves object-level project authorization.

## 7. Canonical business journeys

The strongest asset is the existing closed event-driven spine:

1. Lead → Opportunity → Tender → BOQ/Estimate → Quotation → Approval → Contract.
2. Tender Award → Contract Signed → Project setup and finance setup.
3. Purchase Request → RFQ → Award → PO → Budget commitment → GRN → three-way match → actual cost.
4. Project → Engineering/Doc Control → Site execution → QA/QC gate → progress → IPC → finance recognition.
5. Commissioning → Handover → AMC → Work Order → Finance billing → Invoice → Payment.
6. Asset disposal → finance disposal.

The reconstruction must expose these as connected journeys through related records, status history, next action, and dependency/gate visibility. It must not duplicate their state machines in frontend-only logic.

### 7.1 Sales & Pre-Award lifecycle contract

Every Sales Suite Home and record journey must make the lifecycle legible without pretending that every step is a separate backend state machine:

`Lead → Opportunity → Site Visit / Meeting → Requirements → Estimate / BOQ → Pricing → Quotation → Revision → Negotiation → Won → Contract → Project`

| Lifecycle step | Current status | Ownership note |
|---|---|---|
| Lead | `IMPLEMENTED` | CRM owns acquisition and qualification |
| Opportunity | `IMPLEMENTED` | CRM owns pipeline and opportunity 360 |
| Site Visit / Meeting | `PARTIALLY IMPLEMENTED` | Activity types exist; canonical Meeting/MOM does not |
| Requirements | `PARTIALLY IMPLEMENTED` | Qualification, tender requirements, and document readiness exist in separate surfaces |
| Estimate / BOQ | `IMPLEMENTED` | Estimation/tendering owns quantities and cost build-up |
| Pricing | `IMPLEMENTED` | Pricing sheets and governed commercial calculations exist |
| Quotation | `IMPLEMENTED` | Quotation lifecycle and approval exist |
| Revision | `IMPLEMENTED` | Quotation/document revisions exist; the Suite journey needs consolidation |
| Negotiation | `IMPLEMENTED` | Negotiation workspace exists |
| Won | `IMPLEMENTED` | Award/conversion events exist |
| Contract | `IMPLEMENTED` | Contracts owns the signed commercial record |
| Project | `IMPLEMENTED` | Project Delivery owns execution after conversion |

### 7.2 Reusable comparison experience

Comparison is a shared UX contract, not a one-off page. Procurement, Tendering, and Commercial must reuse the same experience for aligned options, source/freshness, normalized totals, exclusions/deviations, differences, selection, and approval evidence. Selection or award is always a server-owned action; the UI never invents the winning decision. Existing comparison surfaces are `PARTIALLY IMPLEMENTED` until this common contract and its responsive/keyboard behavior are verified.

## 8. Corrected target information architecture

### 8.1 Universal navigation—not eleven permanent sidebar sections

The persistent primary navigation is intentionally short:

1. **Home** — personal work, attention, recent context.
2. **My Work** — inbox, approvals, tasks, notifications, saved views.
3. **Projects** — project portfolio and Project 360 entry.
4. **Suites** — searchable launcher for the ten Suites.
5. **Reports** — governed reports and intelligence.
6. **Admin** — conditional, permission-aware.

Recent records, favorites, and pinned views are secondary navigation. This avoids reproducing the current long module directory in a different visual style.

### 8.2 Ten business Suites

| Suite | Owns | Does not own |
|---|---|---|
| Workplace & Collaboration | Inbox, notifications, workspace, documents/events, saved views | Pretend meeting/calendar depth that is not implemented |
| Sales & Pre-Award | CRM, estimating, tendering, quotations, bid decisions | Contract delivery controls |
| Project Delivery | Portfolio, Project 360, Engineering, Site, Quality, HSE, Commissioning, Handover visibility | Duplicate domain state machines |
| Commercial & Contracts | Contracts, subcontracts, obligations, variations, certificates, claims | Site execution records |
| Supply Chain | Procurement, suppliers, inventory, logistics | Finance posting ownership |
| Finance | GL, AR/AP, tax, treasury, budgeting, reporting | Project execution ownership |
| Assets & Service | Operational assets, AMC, work orders, fleet, warranty/service | Project-delivery Commissioning/Handover copies |
| People & Organization | HR, org, time/payroll/self-service | Generic platform access administration |
| Intelligence & Reporting | Cross-suite reports, governed AI, data insights | Unsupervised write autonomy |
| Administration & Governance | Identity, access, companies, modules, workflows, audit, platform settings | Daily business operations |

“AURA Home” is the universal layer, not an eleventh Suite.

### 8.3 Why the requested naming was corrected

- **Sales & Marketing → Sales & Pre-Award:** current source proves CRM/tender/estimate/quotation depth; it does not justify presenting a mature marketing platform.
- **Service & Operations → Assets & Service:** “Operations” conflicts with project-delivery operations and the existing `/operations/overview` route. Assets, AMC, work orders, and fleet are the proven capability center.
- **Project & Delivery → Project Delivery:** one concise domain name and a clear Project 360 anchor.

## 9. Global shell contract

The global shell supplies context and navigation, not page-specific business logic.

Required regions:

- Product/tenant brand and current company context.
- Compact primary navigation and Suite launcher.
- Global search/command palette.
- Breadcrumb with stable URL context.
- Project context chip where applicable.
- Permission-aware Create menu driven by allowed actions, not a fixed global list.
- Notifications, offline/sync status, profile, help.
- Optional explicit “Open in new tab”; never force every function into a new tab.

Required behaviors:

- Keyboard access, visible focus, skip link, semantic landmarks, focus return.
- 320px through wide desktop; no hidden critical action at zoom 200%.
- Reduced motion and high-contrast compatibility.
- Deep-link and refresh stability.
- No false active states when route groups overlap.
- A failed secondary shell call degrades locally and does not blank the page.

### Multi-company warning

The current company switch posts to `/api/auth/switch-company` and reloads. Browser tabs share cookies/session state, so two tabs cannot be assumed to retain independent company contexts. Until the server contract supports explicit authorized company context per request/URL or another proven isolation mechanism:

- multi-tab use within one company is supported as a browser behavior;
- simultaneous different-company tab contexts are `NOT VERIFIED` and must not be advertised;
- company changes should warn that other open tabs may refresh or become stale;
- mutation requests must echo and confirm the authoritative company/project context.

## 10. AURA Home contract

AURA Home answers five questions without becoming a card wall:

1. What needs my attention now?
2. What am I allowed to act on?
3. What changed in my projects/accounts?
4. Where did I last work?
5. What can I create or ask AURA to help with?

Sections:

- Prioritized approvals and exceptions.
- Assigned/owned work.
- Project and commercial health exceptions.
- Recent/pinned records and saved views.
- Calendar/notifications only where real data exists.
- Role-aware quick actions.
- AI prompt entry with visible context and scope.

No KPI is displayed without source, freshness, and a path to the underlying records.

## 11. Suite Home contract

Each Suite Home is a working control surface, not a directory of oversized cards.

It contains:

- Suite purpose and current scope.
- Role-aware attention queue.
- Compact health/trend strip with drill-through.
- Function groups and recent records.
- Cross-suite dependencies and blocked work.
- Saved views and reports.
- Explicit capability labels for partial/missing functions.

Suite Home must not aggregate by issuing many unbounded list calls. Dashboard endpoints or measured projections are required where the source volume justifies them.

## 12. Register/table contract

All operational registers converge on `AuraDataTable` or its successor contract.

Required capabilities when relevant:

- Search with clear scope.
- Typed filters, sort, server pagination, total/result feedback.
- URL-addressable query state and shareable views.
- Saved views and default role view.
- Column visibility and density without hiding required identifiers.
- Row selection and bulk actions only when service APIs support atomic/partial outcomes.
- Status, owner, location/project, freshness, and exception cues.
- Row link to Record 360; no row-click-only interaction that blocks text selection or keyboard use.
- Mobile list/card mode with the same data contract.
- Export/print permission and audit behavior.

Every register distinguishes:

- first load;
- refresh in progress;
- no records exist;
- current filters return no results;
- forbidden;
- unauthenticated;
- service unreachable;
- server failure;
- partial/degraded related data.

## 13. Record 360 contract

Record 360 is the primary connectivity pattern.

Required regions:

- Identity: number/name/type/status.
- Context: tenant/company/project/location/system.
- Health and blockers.
- Governed next action and why it is allowed or blocked.
- Key facts/KPIs with freshness.
- Tabs for details, workflow/history, documents/evidence, related records, activity/audit.
- Related records grouped by business relationship.
- Permission-sensitive actions.
- Print/export where justified.

The existing `RecordShell`, `RelatedRecords`, `ActivityTimeline`, health, missing-data, next-action, and workflow-gate primitives are the starting point. They are extended and adopted; a parallel record framework is not created.

## 14. Project Delivery architecture

### 14.1 Ownership

| Domain | Owns |
|---|---|
| Engineering | Drawings, submittals, RFIs/TQs, design revisions |
| Site | Execution, daily reports, labour, plant, installations |
| Quality | Inspections, NCRs, audits, evidence, closeout gates |
| HSE | Permits, incidents, risk assessments, CAPA |
| Commissioning | Test sheets, punch/retest, commissioning state |
| Handover | Acceptance and handover package |
| Assets & Service | Operational asset, warranty, AMC, work order |
| System/Device layer | Stable system/device identity, schedule, lifecycle links |

### 14.2 Unified Project 360

The canonical Project 360 namespace is `/project/[projectId]` (ADR-0019). The delivery command center owns the root, while `/project/[projectId]/controls` composes the existing commercial/project controls inside the same Project Context. `/projects/projects/[id]` remains as a query-preserving compatibility redirect until deprecation telemetry permits removal. It is no longer an independently rendered owner.

| Concern | Canonical owner |
|---|---|
| Project identity, lens, navigation, breadcrumb and future AI context | `/project/[projectId]` shell |
| Delivery pulse | `/project/[projectId]` |
| Commercial/project controls | `/project/[projectId]/controls` |
| Engineering/Site/Quality/HSE/Commissioning/Documents | Their child views and authoritative domain APIs |
| Old project-detail bookmarks | `/projects/projects/[id]` compatibility redirect |

Project 360 contains:

- Overview and health.
- Scope, WBS/CBS, schedule, EVM, cost, quantity, cashflow.
- Engineering and document control.
- Procurement/material availability and site logistics.
- Site execution and progress.
- Quality and HSE gates.
- Commissioning, snags, handover.
- Operational asset/AMC linkage.
- Commercial/contracts/variations/certificates.
- Related records and activity.

The existing `/operations/overview` is treated as a cross-project delivery operations view. Its final placement is reviewed after Project Suite Home and portfolio responsibilities are explicit.

### 14.3 Device lifecycle

The first new vertical UI surface is a Device Register/Schedule/360, not an ELV mini-ERP.

`Device CAM-017` links to:

- System and location.
- BOQ item and WBS/CBS.
- Drawing/submittal/document.
- Material/serial/GRN.
- Installation record.
- Inspection and NCR.
- Test sheet, punch, and commissioning.
- Snags and handover package.
- Operational asset.
- Warranty and AMC/work orders.

Commissioning, handover, inventory, and assets remain owned by their existing modules. Device 360 reads and links their authoritative records; it does not clone them.

## 15. Forms and governed workflow UX

- Forms derive client validation from shared schemas where practical; server validation remains authoritative.
- Status transitions are named business actions, not editable status dropdowns.
- The UI displays prerequisites, segregation-of-duties rules, missing evidence, and approval limits before submission.
- Destructive/irreversible actions require contextual confirmation and show consequences.
- Server conflicts preserve entered data and explain the current authoritative state.
- Long operations use progress, idempotency keys, and resumable/retry-safe behavior where supported.
- Audit history distinguishes actor, time, transition, reason, and evidence.

## 16. Mobile and field UX

Mobile-first is mandatory for Site, Quality, HSE, Commissioning, Inventory, and Assets/Service routes.

Field pattern:

- One primary task per screen.
- Project/location/system/device context always visible.
- 44×44 minimum targets; glove-friendly spacing.
- Camera/evidence capture with upload status and retry.
- Draft/save/resume.
- Offline queue only for workflows that can be safely replayed.
- Explicit pending/synced/conflicted status.
- Server-authoritative conflict handling; never silently overwrite.
- Barcode/QR entry where identity and authorization are proven.

The existing service worker and offline-replay evidence are foundations, not proof of a complete field app. Each offline-enabled mutation needs an idempotency and conflict contract.

## 17. AI experience

AURA AI is contextual, governed, and initially read-only.

Required visible context:

- company/tenant;
- Suite;
- project/record;
- data sources and freshness;
- read/propose/act mode;
- permissions used;
- citations/links to records.

Rollout:

1. Search, summarize, explain, compare, and identify gaps from real authorized records.
2. Draft proposals with structured preview and no mutation.
3. Governed actions only after real tool handlers, schema validation, approval gates, audit, replay safety, and evaluation pass.

The general agent registry does not establish operational capability. Only tools with executable handlers and verified live-data access appear as available actions. Project AI must carry an explicit Project Context rather than infer it from a label or lose it when navigating to a generic `/ai` page.

## 18. Design-system consolidation

Do not introduce a third component family. Consolidate the existing kit and UI primitives into documented contracts:

- Tokens: color roles, type scale, spacing, radius, elevation, focus, motion, status.
- Shell: global, Suite, project, record.
- Navigation: launcher, breadcrumbs, tabs, context switchers.
- Data: table/register, query controls, saved views, pagination, bulk outcomes.
- State: loading, empty, filtered-empty, forbidden, unreachable, error, degraded.
- Record: header, health, gate, related records, activity.
- Forms: field, help/error, sections, sticky actions, confirmation.
- Feedback: toast, inline result, progress, sync/conflict.
- Visualization: accessible table fallback and source/freshness metadata.

No page-specific hard-coded color is accepted when a semantic token exists. Component APIs must support RTL even if Arabic localization ships later.

## 19. Page migration matrix

The regenerated CSV contains one row for each of the 174 current pages with:

- route and source file;
- current route area and target Suite;
- function, purpose, users, permission posture, and context scope;
- page kind;
- detected API/workflow dependencies;
- shared component usage;
- loading/empty/error/forbidden states;
- search/filter/sort/pagination/saved-view signals;
- responsive/accessibility signals;
- related records and Record 360 need;
- mobile priority;
- implementation and verification state;
- UX class, migration decision, and wave.

Decision distribution:

| Decision | Pages |
|---|---:|
| Refactor incrementally | 97 |
| Consolidate in Admin Suite | 23 |
| Refactor to Record 360 | 20 |
| Keep and standardize print | 14 |
| Rebuild Suite/function home | 12 |
| Project-specific merge/rebuild/reference decisions | 5 |
| Aura Home rebuild | 1 |
| Login keep/refine | 1 |

No page is deleted from the migration matrix. “Merge” means preserve its business purpose and links inside the target surface, then deprecate the old route only through a verified redirect plan.

## 20. Migration program and gates

The active execution order is intentionally narrower than the full program:

1. Preserve and verify the current Projects/Operations reference slice.
2. Close shared UI contracts.
3. Reconcile Project 360 ownership and the two project-detail routes.
4. Build the Global Shell.
5. Build AURA Home and My Work.
6. Build the Suite Launcher and Suite Home contract.
7. Build Device Register, then Device Schedule, then Device 360 only from proven relationships.
8. Adopt the contracts across Project Delivery.

Each numbered item has its own implementation, real-data browser, desktop/mobile, keyboard, permission, test, and build gate. Completion of typecheck alone never opens the next item. Production dependency advisories and production Auth/RLS remain release gates in parallel; frontend completion must not be reported as production readiness.

Lint is governed as a ratchet: Batch 1 started from 732 warnings and may not increase that number. New/touched files must be warning-free; the shared-contract slice lowered the count to 731 and the Project 360 ownership slice lowered it to 729. Unrelated warning cleanup is not part of UI reconstruction.

### Phase 0 — Release and baseline gates

- Remediate high-risk dependencies and make High/Critical production findings block CI.
- Prove production Auth, non-bypass RLS, and cross-tenant denial.
- Verify promotion, rollback, backup/restore, secrets, CORS/TLS, uploads, monitoring, alerts, and SLO ownership.
- Freeze new module breadth.

**Exit:** release evidence pack accepted; typecheck/lint/tests/API E2E/browser E2E/build green; exceptions time-boxed.

### Phase 1 — Foundations and Page DoD

- Finalize tokens, responsive breakpoints, focus/motion, state taxonomy.
- Stabilize shared table, Record 360, related records, form/action, and context contracts.
- Add accessibility automation and representative component tests.
- Generate permission and route inventories in CI.

**Exit:** shared primitives meet keyboard, state, responsive, and test requirements.

### Phase 2 — Prove the reference slice

- Finish Projects Dashboard, Project 360, project area register, and cross-project Operations reference slice.
- Validate desktop and mobile on real authenticated data.
- Reconcile `/project/[projectId]` and `/projects/projects/[id]` ownership.

**Exit:** one project can be managed across Engineering/Site/Quality/HSE/Commissioning without losing project context.

### Phase 3 — Global shell, AURA Home, My Work, Suite launcher

- Replace long module-directory navigation with the corrected shell.
- Build role-aware Home and My Work from real APIs.
- Preserve all route deep links.

**Exit:** navigation, permissions, company/project context, keyboard/mobile, and refresh/deep-link tests pass.

### Phase 4 — Device layer

- Device Register/Schedule/360.
- Link to authoritative drawing, material, installation, inspection, test, handover, asset, warranty, and AMC records.

**Exit:** a device lifecycle is traceable end to end without duplicated domain state.

### Phase 5 — Project Delivery completion

- Apply register/360/state/mobile standards across Engineering, Doc Control, Site, Quality, HSE, Commissioning, and Handover.
- Add project cashflow/cost/quantity UI.

**Exit:** target field journeys pass mobile, offline where applicable, accessibility, permission, and browser tests.

### Phase 6 — Major office Suites

- Sales & Pre-Award, Commercial & Contracts, Supply Chain, Finance.
- Add proven UI-missing backend capabilities in these areas.

**Exit:** lead-to-cash and procure-to-pay journeys remain complete through the new IA.

### Phase 7 — Remaining Suites

- Workplace, Assets & Service, People, Intelligence, Admin.
- Consolidate admin without replacing enforced controls.

**Exit:** capability truth labels, role journeys, and operational controls verified.

### Phase 8 — Full route sweep and retirement

- Verify all 174 matrix rows.
- Retire duplicates through redirects and deprecation telemetry.
- Complete visual regression, accessibility, performance, and documentation.

**Exit:** every route is retained, merged, redirected, or intentionally removed with evidence and owner sign-off.

## 21. Page Definition of Done

A page cannot move from `NOT_VERIFIED_TO_PAGE_DOD` until all applicable checks pass:

- Business purpose and owner confirmed.
- API and workflow dependencies traced.
- Permission allow/deny behavior tested.
- Tenant/company/project scope confirmed.
- Loading, empty, filtered-empty, forbidden, unreachable, server-error, and degraded behavior verified.
- Search/filter/sort/pagination work with URL state when applicable.
- Related records and Record 360 links are correct.
- Keyboard, focus, screen-reader semantics, contrast, zoom, and reduced motion pass.
- 320px/mobile and wide desktop pass.
- Mutation success, validation, conflict, retry/idempotency, and audit behavior pass.
- Authenticated browser journey and relevant unit/component tests pass.
- No regression in build, typecheck, API contract, or performance budget.

## 22. Risk register

| Risk | Severity | Control |
|---|---|---|
| Visual reconstruction hides open production gates | Critical | Phase 0 blocks release claims |
| Suite IA accidentally becomes backend rearchitecture | High | Suites are navigation/composition only |
| ELV becomes a duplicate ERP | High | Device layer links authoritative records only |
| Project pages split into competing 360s | High | One ownership decision and migration alias plan |
| Company switch causes cross-tab stale/wrong context | High | Do not claim per-tab company isolation; explicit context confirmation |
| UI hides actions but API scope is broader | High | API remains authoritative; generated permission inventory and denial tests |
| Dashboard fan-out creates performance regressions | High | Measured endpoints/projections; no unbounded list aggregation |
| Offline replay duplicates field mutations | High | Per-command idempotency/conflict contract |
| Component rewrite creates a third design system | Medium | Extend existing primitives; adoption metrics |
| Automatic new tabs harm mobile/accessibility | Medium | Explicit browser-native open-new-tab only |
| AI appears more capable than its tools | High | Capability registry exposes only executable, evaluated tools |
| “Implemented” conflates source with usability | High | Required status vocabulary and Page DoD |

## 23. Self-challenge and corrections

The requested program was directionally correct, but five assumptions needed correction:

1. **Eleven visible product areas are too many for primary navigation.** Correction: six universal anchors plus a searchable Suite launcher.
2. **Marketing maturity was overstated.** Correction: “Sales & Pre-Award” until campaign/marketing capability earns promotion.
3. **“Service & Operations” was ambiguous.** Correction: “Assets & Service”; project operations remains in Project Delivery.
4. **Opening each function in a new tab is not a safe default.** Correction: preserve native links and add an explicit option. Automatic tabs harm mobile, focus management, and user control.
5. **Multi-tab company context was assumed.** Correction: current company switching is session/cookie-oriented and shared across tabs; different-company tab isolation is `NOT VERIFIED`.

Additional challenge: Suite Homes and Record 360s can become decorative dashboards. The control is strict drill-through, freshness metadata, real work queues, and Page DoD—not visual density.

## 24. Immediate implementation batch after approval

The next implementation batch is deliberately narrow:

1. Close any regression in the current Projects/Operations reference slice and verify it.
2. Finalize shared navigation/state/table/Record 360 contracts.
3. Reconcile the two project-detail routes into the target Project 360 ownership plan.
4. Implement the Global Shell behind preserved routes/feature control.
5. Implement AURA Home and My Work only after the Shell gate passes.
6. Implement the Suite Launcher and Suite Home contract.
7. Implement Device Register/Schedule/360 only after the project-delivery links are defined and usable.

This sequence improves the product spine before increasing module count or creating another isolated workspace.

### Batch 2 evidence — Project 360 ownership

- ADR-0019 accepted `/project/[projectId]` as the canonical Project 360 namespace.
- Project controls now render at `/project/[projectId]/controls` inside the same Project Context and system lens.
- `/projects/projects/[id]` remains as a query-preserving compatibility redirect; no route was deleted.
- Internal project-detail links were migrated to the canonical namespace.
- Control tabs use the shared keyboard/ARIA contract; variation and EOT registers use the shared responsive data-table contract.
- Authenticated real-API browser verification passed canonical navigation, redirect, query preservation, refresh, keyboard tabs, Desktop, 390px Mobile, Site register drill-through, and anonymous denial.
- Verification: web typecheck pass; 54/54 web unit tests pass; lint 0 errors/729 warnings; production build 27/27 and 202 generated routes; focused Chromium E2E pass.
- Global Shell and AURA Home were not started in this batch.
