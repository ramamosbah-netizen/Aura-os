# Volume 15 — Administration Center

[← Master index](README.md)

**Honest status: ~20% built, in design (health score 3.0).** This volume documents every admin
page and setting that exists today, then specifies the full center — every page, every setting,
every parameter — as the build contract.

---

## 1. What exists today

| Surface | Path / mechanism | State |
|---|---|---|
| Audit viewer | `/admin/audit` | ✅ |
| Intelligence admin | `/admin/intelligence` (calibrations, autonomy proposals) | ✅ |
| Template management | `/admin/templates` + `apps/api/src/templates` | ✅ |
| Builder API | `apps/api/src/builder` (entity/form registries, approval matrix) — **no UI yet** | ◐ |
| Feature flags | `feature-flag.service` — **no UI** | ◐ |
| Saved views | `/views` | ✅ |
| Event stream | `/events` (+dead-letter data) | ✅ |
| Demo seeder | `DEMO_SEED=true` | ✅ |
| Everything else below | — | ❌ [Planned] |

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
