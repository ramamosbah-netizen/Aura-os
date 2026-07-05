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

| Surface | Path / mechanism | State |
|---|---|---|
| **Workspace access** | `/admin/workspace` + `apps/api/src/workspace` | ✅ **new** |
| Audit viewer | `/admin/audit` | ✅ |
| Intelligence admin | `/admin/intelligence` (calibrations, autonomy proposals) | ✅ |
| Template management | `/admin/templates` + `apps/api/src/templates` | ✅ |
| Builder API | `apps/api/src/builder` (entity/form registries, approval matrix) — **no UI yet** | ◐ |
| Feature flags | `feature-flag.service` — **no UI** | ◐ |
| Saved views | `/views` | ✅ |
| Event stream | `/events` (+dead-letter data) | ✅ |
| Demo seeder | `DEMO_SEED=true` | ✅ |
| Everything else below | — | ❌ [Planned] |

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
- **Note:** this is the UI/experience access layer; the kernel RBAC grants (Vol 7) still gate the
  API. Remaining: run migration 0127 against a real DB (store is wired, exercised in-memory);
  per-user (not just per-role) overrides. References:
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
