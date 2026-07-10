# Volume 15 — Administration Center

[← Master index](README.md)

**Honest status: ~25% built, in design (health score 3.2).** This volume documents every admin
page and setting that exists today, then specifies the full center — every page, every setting,
every parameter — as the build contract.

> **Update 2026-07-04 (branch `feat/command-center`, commit `2bbe72b`):** the first real
> Administration surface shipped — **Workspace Access** at `/admin/workspace`. Admins assign users
> to roles and configure, per role, exactly which workspace functions each person sees (Command
> Center panels, quick actions, command perspectives, nav suites). See §1a below.

---

## 1. What exists today

**Phase 1 CLOSED 2026-07-08 (gap register #12)** — the `/admin` hub (live-count KPI strip,
tiles grouped Governance / Configuration / Integration / Observability) plus seven config
screens on shared professional chrome (`admin-chrome.tsx`), every store PG-backed.

**Phase 1.5 "professional pass" + phase 2 start — same day (evening):** the config screens
were rebuilt matrix-first with easy controls (shared kit: `admin-ui.tsx` Toggle/MatrixCell/Pill
+ `.adm-*` classes): Roles & Access is now a **permission matrix** (roles × modules, ALL-wildcard
column, fine-grained keys as removable chips) plus a **user-grants matrix** (workspace directory ×
roles, click-to-grant) with per-user **MFA reset**; the approval matrix is a **value-band grid**
(inline From/Up-to, approver role chips from live roles, required-count, ↑↓ ordering, catch-all
row); feature flags are **toggle switches**; numbering is an **inline-editable grid with a live
next-number preview**; webhooks get pause/resume toggles + delivery status pills. Phase 2 opened
with two spec sections shipped: **Organization** (§2.1) and **Platform Health** (§2.10).

| Surface | Path / mechanism | State |
|---|---|---|
| **Admin hub** | `/admin` — KPI strip + grouped function tiles (`admin-nav.ts` registry) | ✅ 2026-07-08 |
| **Organization** (phase 2, §2.1) | `/admin/organization` — guided tenant profile (legal identity, finance defaults, locale) over the settings service **+ companies master grid** | ✅ 2026-07-08 |
| **Companies** (phase 2, §2.1) | `CompaniesService` (PG migration `0135_companies`) + `admin/companies` CRUD; the **app-shell company switcher now reads this registry** (hardcoded list is only the dev fallback) | ✅ 2026-07-08 |
| **Business calendar** (phase 2, §2.1) | `/admin/calendar` — weekend-day toggle matrix (Sun–Sat), standard hours, public holidays, Ramadan-hour adjustments; kernel `CalendarService` grew full CRUD over the 0030 tables + `admin/calendar` API | ✅ 2026-07-08 |
| **Platform health** (phase 2, §2.10) | `/admin/health` — dead letters, webhook delivery health, recent spine activity, KPI strip | ✅ 2026-07-08 |
| **Notification routing** (phase 2, §2.8) | `/admin/notifications` — channel toggles, per-user recipient grid, tenant fallback (persisted as `notify.*` settings **the dispatcher reads on every send**, env fallback); transport status + event wirings read-only | ✅ 2026-07-09 |
| **Data administration** (phase 2, §2.9) | `/admin/data` — idempotent demo-company seed (`DemoSeeder.runIfEmpty` + `admin/platform/seed-demo`), CSV export hub (audit, AR/AP aging, invoices), chart-of-accounts CSV import. **Data-lifecycle surface (2026-07-09, gap #25 made admin-visible)**: orphan-scan report over the shared reference catalog (`infrastructure/orphan-references.json`), retention window editor (`lifecycle.archiveMonths` setting), archiver dry-run/execute with eligibility + already-archived counts (`admin/platform/data-lifecycle` + `archive-run`, audited on execute). First live run found 5 real orphans in the dev tenant | ✅ 2026-07-09 |
| **AI administration** (phase 2, §2.7) | `/admin/ai` — provider seam status (claude/local, key presence only), **guardrail rule toggles** (default pack now registers at boot: content-safety keywords, PII mask, token cap — `AiGuardrailsService.setEnabled`), autonomy queue KPI; deep IEC work stays on `/admin/intelligence`. **Durable + audited since later 2026-07-09**: toggles write-through to `aura_ai_guardrails` + hydrate on boot (restart-verified); admin config changes (settings/forms/roles/grants/guardrails) now write audit entries visible at /admin/audit. Remaining ..2.7 depth: prompt-pack overrides, usage/cost meters | ✅ 2026-07-09 |
| **Form Designer P1** (§2.4) | `/admin/forms` — per-form field grid: rename labels, edit placeholders/hints, flip required, hide fields. Sparse per-tenant patches (`aura_form_overrides`, migration 0136) merged by shared `applyFormOverrides` in **both** the renderer (FormDrawer resolves `/forms/:id/overrides` before the engine inits) **and** `assertFormValid` (all 3 call sites) — designed = rendered = enforced; hiding defuses required. Verified: override → 400 with the custom label → reset → 201. Remaining §2.4 depth: add/reorder fields, layout & rules editing, versioned publish | ✅ 2026-07-09 (P1) |
| **Users** (depth wave, §2.2) | `/admin/users` — the users registry (`aura_users`, migration **0137**, kernel `UsersService` w/ hydrate-on-boot): register/invite, inline edit (name/email/company), **deactivate enforced at login (401) and on every guarded request (403)** even with a valid token; merged with the workspace directory (one-click register for assigned ids); self-deactivation blocked; audited | ✅ 2026-07-10 |
| **Security posture** (depth wave, §2.2) | `/admin/security` — auth mode (JWKS/HS256/off), anonymous-request + dev-token/dev-password posture, lockout numbers, **MFA enrolments** (active/pending, `MfaService.listEnrolments`), SSO wiring + Entra group→role map, PII-crypto staging/rotation. Env-bound values read-only by design (runbook pointers) | ✅ 2026-07-10 |
| **Workflow registry** (depth wave, §2.3) | `/admin/workflows` — every registered definition (`WorkflowStore.listDefinitions`, tenant shadows global) w/ version, scope, state/transition counts, live open/completed instances. Designer stays P3 (Vol 11 §11) | ✅ 2026-07-10 |
| **Workspace access** | `/admin/workspace` + `apps/api/src/workspace` (PG migration 0127) | ✅ |
| **Roles & access** | `/admin/access` — **permission matrix + grants matrix + MFA reset**, PG-backed (migration 0133, write-through + hydrate) | ✅ 2026-07-08 |
| **Org settings (raw)** | `/admin/settings` — key/value editor w/ namespace groups + quick-add (PG migration 0132) | ✅ 2026-07-08 |
| **Feature flags** | `/admin/feature-flags` — toggle switches over `feature-flag.service` (PG) | ✅ 2026-07-08 |
| **Approval matrix** | `/admin/approval-matrix` — value-band grid editor (PG migration 0085) | ✅ 2026-07-08 |
| **Document numbering** | `/admin/numbering` — inline-edit grid + live next-number preview | ✅ 2026-07-08 |
| **Connectors** | `/admin/connectors` — external-system registry (PG) | ✅ 2026-07-08 |
| **Webhooks** | `/admin/webhooks` — pause/resume toggles + delivery status pills (PG) | ✅ 2026-07-08 |
| Audit viewer | `/admin/audit` (+ filter-aware CSV export) | ✅ |
| Intelligence admin | `/admin/intelligence` (calibrations, autonomy proposals) | ✅ |
| Template management | `/admin/templates` + `apps/api/src/templates` | ✅ |
| Builder API | `apps/api/src/builder` (entity/form registries) — approval matrix now has UI | ◐ |
| Saved views | `/views` | ✅ |
| Event stream | `/events` (+dead-letter data) | ✅ |
| Demo seeder | `DEMO_SEED=true` | ✅ |
| **Per-event notification rules** (depth wave, §2.8) | on `/admin/notifications` — event × channel **rules matrix** (Default / in-app-only / per-channel), saved as `notify.rule.<event>` settings; `NotificationService.record` consults the rule on every dispatch (subscriber passes the source event) | ✅ 2026-07-10 |
| Remaining spec sections (form designer §2.4 remainder, §2.5 API keys/service accounts, §2.7 depth: prompt packs / cost meters, §2.8 digest schedules, list-view/dashboard/menu designers) | — | phase 2+ [Planned] |

## 1a. Workspace Access (shipped 2026-07-04)

The first working Administration Center module: an admin configures each user's workspace, and
every user sees only what their role allows.

- **Model (framework-free, unit-tested — `shared/src/workspace/`):** 8 roles
  (admin/executive/finance/procurement/projects/operations/hr/viewer) and a catalog of 25
  toggleable **functions** across four categories (Command Center panels, quick actions, command
  perspectives, navigation suites). `WorkspaceConfig` maps users→roles and roles→allowed
  functions; pure `resolveRole` / `visibleFunctionIds` / `resolveWorkspaceMe` are shared by API
  and web so both filter identically. 6 unit tests.
- **API (`apps/api/src/workspace/`):** `WorkspaceConfigService` over a **store abstraction**
  (`workspace-config-store.ts`): in-memory without `DATABASE_URL`, Postgres (JSONB per tenant,
  migration `0127_workspace_config.sql`) with it. `GET/PUT /workspace/config`, `GET /workspace/me`
  (the caller's effective role + functions), `GET /workspace/users`.
- **Admin UI (`/admin/workspace`):** role cards (user + function counts), per-role function
  toggles grouped by category with a live "what this role sees" preview, member management, a full
  user directory with role dropdowns, and Preview→. Non-admins get an access-required panel.
- **Enforcement:** the Command Center reads `/workspace/me` and shows only the allowed panels,
  quick actions and CEO/CFO/PM perspectives; an admin **"View workspace as [role]"** switch
  previews any role's exact workspace. The **sidebar** is gated too: nav groups map to `suite.*`
  functions (`GROUP_SUITE` in `nav.ts`), filtered server-side in the layout — verified live:
  `u-finance` sees Workspace/Deal chain/Operate only, no Administrator link; admin sees all.
  Falls back to full access if the workspace API is down.
- **Identity-driven:** `/workspace/me` resolves the user from the JWT `sub` (`actorId`), so
  logging in as `u-finance`/`u-ceo`/… yields that identity's role; unauthenticated dev default
  is `u-admin`.
- **Note:** this is the UI/experience access layer; the kernel RBAC grants (Vol 7) gate the
  API — both PG-backed now (0127 applied; roles/grants via 0133). Remaining: per-user (not
  just per-role) overrides. References:
  `docs/reports/2026-07-04-role-based-workspace-admin.md`,
  `docs/reports/2026-07-04-workspace-persistence-identity-nav.md`.

## 2. The Administration Center specification (build contract)

Structure: `/admin` shell with grouped sections. Every page below lists its settings/parameters.

### 2.1 Organization
- **Tenant profile:** name, legal name, TRN, logo, base currency, fiscal-year start, timezone,
  date/number formats.
- **Companies:** CRUD (multi-company), per-company codes, default cost/profit centres.
- **Business calendar:** working days, holidays (kernel calendar service exists — needs UI).

### 2.2 Users & Access
- Users: invite/deactivate, company assignment.
- **Roles:** CRUD over permission taxonomy (`<module>.<entity>.<verb>`); grants per user;
  ABAC conditions (project/company/value scoping). Engine exists; storage → DB + UI required.
- Sessions/MFA/SSO policies (after Vol 7 items land).

### 2.3 Platform behavior
- **Numbering:** per-series prefix/format/next (service exists — UI: series table + preview).
- **Approval matrices:** value bands → roles per document type (service exists — UI editor).
- **Workflow definitions:** list, versions, enable per tenant [after workflow designer].
- **Feature flags:** toggle registry with per-tenant scope.
- **Settings service** [Gap — prerequisite]: typed key-value with schema, tenant scope,
  audit on change. This unblocks most pages here.

### 2.4 Forms & metadata (Volume 5 §10 / Volume 14)
- Form designer (fields/layout/rules/formulas/validation/permissions, versioned publish).
- List-view designer; dashboard/widget designer; menu editor.
- Plugin registry viewer (which field kinds/validators/functions are installed).

### 2.5 Integration
- Webhook subscriptions: CRUD, secret rotation, delivery log + retry/dead-letter inspector
  (data exists — UI needed).
- Connectors: registry + credentials (vaulted — Vol 7 §10 dependency).
- API keys/service accounts [Gap].

### 2.6 Documents
- Template editor (exists, extend), numbering per document, retention policies [Gap],
  storage config (local/Supabase adapter choice).

### 2.7 AI administration
- Provider + model selection, key management (vaulted), guardrail toggles, autonomy scope,
  prompt-pack overrides [Planned per Vol 6 §2], usage/cost meters.

### 2.8 Notifications
- Channel config (email/SMS provider) [after channels ship], per-event routing rules,
  digest schedules.

### 2.9 Data administration
- Import/export (CSV port exists — UI wizard), demo-data reset, archival policies (Vol 8 §8),
  orphan-scan reports.

### 2.10 Observability (ops-facing)
- Health dashboard (event-relay lag, dead-letter count, job status, webhook failures) —
  all queryable today, needs the page.

## 3. Sequencing

1. Settings service (kernel) → 2. Admin shell + Users/Roles UI → 3. Numbering + approval
matrix + webhook UIs (backends done — cheap wins) → 4. Form designer → 5. AI + notification
admin → 6. remainder. Rationale: each step exposes already-built kernel capability; the shell
pays for itself immediately.

---

*Next: [Volume 16 — Reporting Platform](vol-16-reporting.md)*
