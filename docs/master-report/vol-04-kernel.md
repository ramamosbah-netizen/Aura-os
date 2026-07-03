# Volume 4 — Kernel Documentation

[← Master index](README.md)

The kernel (`core/` + contracts in `shared/`) is everything a business module is *not allowed*
to build for itself. Modules consume kernel services through DI; the kernel never imports a
module. This volume documents each kernel capability: what it does, its contract, its storage,
and its maturity.

---

## 1. Identity

**Files:** `core/src/identity/{auth.service, access.service, org.service, permissions.guard, permissions.decorator}.ts` · `shared/src/identity/{jwt, jwks, org, access}.ts`

- **Authentication** (`auth.service`): credential check → JWT issue; verification middleware in
  `apps/api/src/main.ts`. Enforcement is env-gated: `AUTH_REQUIRED=true` + `AUTH_JWT_SECRET`
  rejects anonymous requests (401) except health/auth routes; without it the platform runs open
  (dev mode). JWKS support in shared for asymmetric keys.
- **Org model** (`org.service`, `shared/identity/org`): tenant → companies → users; the
  multi-company dimension exists on business rows as `company_id`.
- **Session state:** stateless JWT; no refresh-token rotation yet [Gap — Volume 7].

## 2. RBAC

**Files:** `core/src/identity/access.service.ts` (+ `shared/src/identity/access.ts` evaluation)

Roles are named permission bundles registered with the access service; users hold grants.
`can(userId, target)` evaluates grants → roles → permissions. Route-level enforcement via
`@Permissions('key')` + `PermissionsGuard` (metadata + guard tested). Current honest state:
the engine and guard are production-shaped, but **controllers are not yet annotated with
fine-grained keys** — service-level access checks carry authorization today. Annotating the
551 handlers with a permission taxonomy is a scoped task in Volume 23.

## 3. ABAC

The evaluation engine supports attribute conditions on grants (resource/tenant/company scoping)
— `evaluateAccess(grants, roles, target)` accepts a target descriptor with attributes, so
"PM can approve POs only in own project and below AED 50k" is expressible. Attribute sources
wired today: tenant, company, record ownership. Policy authoring UI [Gap — Volume 15].

## 4. Workflow Engine

**Files:** `core/src/workflow/{workflow.service, workflow-store, saga-orchestrator.service, saga-store}.ts` · `shared/src/workflow/{workflow, saga}.ts`

- **Definitions:** typed state machines (states, transitions, guards) declared as data;
  instances persisted (`postgres-workflow-store`, migration 0003) with current state + history.
- **Saga orchestrator:** multi-step, compensating transaction coordinator with persisted saga
  state (`postgres-saga-store`) — used for cross-module sequences that must roll back
  (orchestrator tested in `saga-orchestrator.service.test.ts`).
- **Approval matrix** (`core/src/builder/approval-matrix.service.ts`): threshold-based approver
  routing (value bands → roles), consumed by Procurement PO approvals.
- Full catalog of shipped workflows: Volume 11.

## 5. DMS (Document Management)

**Files:** `core/src/dms/{dms.service, document-store, document-storage, local-document-storage, supabase-document-storage}.ts` · `shared/src/dms/document.ts`

Two-port design: **document-store** (metadata: id, tenant, entity link, filename, mime,
version) and **document-storage** (binary: local disk / Supabase storage adapters). Upload
endpoints exist (`apps/api/src/documents`, tender document upload). Templates
(`apps/api/src/templates`, migration 0018) provide document generation sources; 9 print pages
render commercial documents. Retention policies + full-text extraction [Gap].

## 6. Event Bus

**Files:** `core/src/events/{event-bus, event-store, outbox-relay, tx, pg-pool}.ts` · `shared/src/events/{event, catalog}.ts`

The platform spine (diagrammed in Volume 2 §7):

1. `TX_RUNNER` wraps service writes; `eventStore.append()` writes the event **in the same
   transaction** (outbox).
2. `outbox-relay` polls unpublished events with `FOR UPDATE SKIP LOCKED` (horizontally safe),
   marks published, pushes onto the in-process `EventBus`.
3. Subscribers: cross-module reactors, projections, webhook dispatcher, notifications.
4. Failures land in a **dead-letter table** (migration 0013) for replay.
5. `/events` page exposes the stream; 71 event types in the typed catalog.

## 7. Audit

**Files:** `core/src/audit/audit.service.ts` (+ migration 0029)

Immutable audit trail: actor, tenant, action, entity, before/after payloads, timestamp;
append-only. Surfaced on record pages ("Account update" entries) and `/admin/audit`.

## 8. Numbering

**Files:** `core/src/numbering/numbering.service.ts` (+ migration 0028, tested)

Deterministic document numbering per tenant/series (PO-2026-0001 style): atomic sequence
claim, prefix/format config, gap-controlled. Used by spine documents.

## 9. Notification

**Files:** `core/src/notifications/{notification.service, notification-store}.ts` (+ migration 0114)

In-app notifications with read state; `/notifications` page + universal inbox aggregation.
Event-driven creation (e.g. fleet registration-expiry scanner). **Delivery channels (email/SMS/
push) are not wired** [Gap — the notification store is channel-ready].

## 10. AI Provider

**Files:** `shared/src/ai/ai-provider.ts` (port) · `core/src/ai/{ai.service, claude-provider, local-provider, embedder}.ts`

The single LLM seam: `AiProvider.complete(req)` / `embed(text)`. Claude provider (Messages
API, model default `claude-opus-4-8`, sampling-locked model guard) + deterministic local
fallback provider (keeps every AI feature functional with no API key — degraded but working).
`embedder` provides lexical embeddings for the vector store. Full AI platform: Volume 6.

## 11. Settings

**Files:** `core/src/config/feature-flag.service.ts`

Feature flags (per-tenant capable). Honest state: a general settings service (tenant settings,
parameter registry, admin UI) is **[Gap]** — tracked as the Administration Center foundation
(Volume 15). Environment configuration is documented in Volume 19.

## 12. Metadata

**Files:** `shared/src/forms/*` (form schemas — Volume 5) · `core/src/builder/entity-registry.service.ts`

Metadata surfaces today: **forms** (complete engine), **entities** (registry service holding
entity descriptors), **saved views** (§18), **navigation** (single `nav.ts`). The full
metadata platform charter — entities/fields/layouts/views/menus/dashboards as configurable
metadata — is Volume 14.

## 13. Builder

**Files:** `core/src/builder/{entity-registry, form-registry, workflow-orchestrator, approval-matrix}.service.ts` (+ `apps/api/src/builder`, 9 endpoints)

The no-code kernel: registries for entities, forms, and workflow orchestration exposed over
API. This is the server side onto which the form designer (Volume 5 §10) and admin center
(Volume 15) will mount.

## 14. Scheduler

**Files:** `core/src/jobs/background-job.service.ts` · `core/src/time/calendar.service.ts`

In-process background jobs (interval/cron-style) — used for webhook retry, PPM advance,
expiry scans. Calendar service supplies working-day math. **Durable distributed queue
[Gap]** (single-process semantics today) — Volume 19 scaling item.

## 15. Integration

**Files:** `core/src/integration/{webhook.service, webhook-dispatcher, webhook-retry-worker, webhook-store, connector.service, sdk-generator.service}.ts`

Outbound webhooks: per-event subscriptions, signed deliveries, retry with backoff (worker +
migration 0012), dead-letter. Connector registry for named external systems. **SDK generator**
emits typed API clients. CSV import/export in `shared/src/integration/csv.ts`. Full treatment:
Volume 17.

## 16. Search

**Files:** `apps/api/src/search` (+ 12-type SearchService) · `/search` page

Global search across 12 record types with type-ahead; feeds the command palette. Backed by
service-level queries (no external search infra needed at current scale); vector search exists
separately in Intelligence.

## 17. Command Palette

**Files:** `apps/web/components` (palette) + single `nav.ts` source

⌘K palette: navigation (from `nav.ts`, same source as sidebar), record search (via §16), and
**palette verbs** for common actions. Inline verb execution tied to the workflow engine is the
recorded W7 follow-up [Planned].

## 18. Workspace

**Files:** `/` (My Work), `core/src/views/saved-view.service.ts` (+ migration 0115), recent
items + breadcrumbs + record tabs (`apps/web/lib/{recent-items, tabs}.ts`)

The user's home layer: My Work page, saved views (persisted filter/column sets per user),
recent items, record tabs (localStorage, cap 8, auto-open on visit), breadcrumbs — the
`RecordChrome` quartet delivered in the product-experience waves (report
`2026-07-02-product-experience-gap-verification.md`).

## 19. Universal Inbox

**Files:** `apps/api/src/inbox` (host aggregator) · `/inbox` page

One queue of everything awaiting the user: **12 pending kinds** aggregated across modules
(approvals, GRN inspections, leave requests, IRs, PTWs, …) with deep links to the owning
record. This is the "what do I do next" surface; SLA/aging decoration [Planned].

---

## Kernel maturity scorecard

| Capability | State | Storage | Tests | Gap to enterprise bar |
|---|---|---|---|---|
| Event bus + outbox | ✅ production-shaped | pg + mem | ✅ (tx, relay) | LISTEN/NOTIFY latency; replay tooling UI |
| Workflow + saga | ✅ | pg + mem | ✅ | authoring UI (Vol 15) |
| Identity/RBAC/ABAC | ✅ engine | mem (roles) → pg [Gap] | ✅ guard | enforcement-on-by-default; permission taxonomy |
| DMS | ✅ | pg + local/Supabase | ✅ (storage) | retention, OCR/full-text |
| Audit | ✅ immutable | pg | ✅ | export/retention policy |
| Numbering | ✅ | pg | ✅ | per-module format admin UI |
| Notifications | ✅ in-app | pg | ✅ | email/SMS/push channels |
| AI provider | ✅ dual provider | — | ✅ | streaming; token budgeting |
| Commands/idempotency/locks | ✅ | pg | ✅ | uniform adoption across all modules |
| Projections/OLAP | ✅ | pg | ✅ | scheduled exports; BI handoff |
| Integration (webhooks/SDK) | ✅ | pg | ✅ | inbound connectors; OpenAPI |
| Jobs/calendar | ◐ in-proc | — | ✅ | durable queue |
| Feature flags | ◐ | mem | — | tenant settings service |
| Builder registries | ◐ | pg | ✅ | designer UIs on top |

---

*Next: [Volume 5 — Enterprise Form Platform](vol-05-form-platform.md)*
