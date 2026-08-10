# 13 — Admin Control Plane (`/admin`)

The Admin Center is a **genuine control plane**, not a settings afterthought: **13 admin controllers** and **24 admin web pages**.

## Admin controllers (`apps/api/src/admin`)

`access-admin`, `approval-matrix-admin`, `calendar-admin`, `companies-admin`, `connectors-admin`, `data-lifecycle`, `feature-flags-admin`, `forms-admin`, `numbering-admin`, `platform-admin`, `service-accounts-admin`, `settings-admin`, `users-admin`.

## Admin pages (24) — coverage map

| Concern | Page | Status |
|---|---|---|
| Users registry (+ enforced deactivation) | `admin/users` | `VERIFIED_IMPLEMENTED` — deactivation enforced in `PermissionsGuard` |
| Access / RBAC | `admin/access` | `VERIFIED_IMPLEMENTED` (mechanism) |
| Companies / org | `admin/organization`, companies-admin | `VERIFIED_IMPLEMENTED` — multi-company |
| Approval matrix | `admin/approval-matrix` | `VERIFIED_IMPLEMENTED` — `ApprovalMatrixService` |
| Feature flags | `admin/feature-flags` | `VERIFIED_IMPLEMENTED` — `FeatureFlagService` |
| Module manager | `admin/modules`, `module-settings` | `VERIFIED_IMPLEMENTED` — guard enforces per-tenant enable/disable |
| Forms designer | `admin/forms` | `VERIFIED_IMPLEMENTED` — metadata form engine |
| Numbering | `admin/numbering` | `VERIFIED_IMPLEMENTED` — numbering engine |
| Workflows | `admin/workflows` | `PARTIALLY_IMPLEMENTED` — `WorkflowOrchestratorService` |
| Connectors / webhooks | `admin/connectors`, `admin/webhooks` | `PARTIALLY_IMPLEMENTED` — `ConnectorService`, webhook kernel table |
| Data lifecycle | `admin/data` | `PARTIALLY_IMPLEMENTED` — `data-lifecycle.controller` (archiver/retention) |
| Security posture | `admin/security` | `IMPLEMENTED_BUT_UNVERIFIED` — surfaces posture; depth unchecked |
| Audit log | `admin/audit` | `IMPLEMENTED_BUT_UNVERIFIED` — audit service exists |
| Health | `admin/health` | `VERIFIED_IMPLEMENTED` — health/migration gate |
| Notifications rules | `admin/notifications` | `PARTIALLY_IMPLEMENTED` — per-event notify rules |
| Service accounts | (service-accounts-admin) | `VERIFIED_IMPLEMENTED` |
| Calendar / settings / templates / AI / intelligence / workspace | resp. pages | mixed |

## Assessment

- **Is `/admin` truly a control plane?** **Yes.** It governs identity, access, org/company, module enablement, approval matrices, feature flags, forms, numbering, connectors, data lifecycle, and health — the substantive levers of a tenant. The Module Manager is enforced in the request path (not just cosmetic).
- **Gaps:** operational tooling for the **event/outbox** (inspect/replay dead-letter), **jobs/queues** observability, and **security posture** depth are thin. There is no verified UI to replay poisoned events or inspect the outbox backlog beyond metrics.

**Admin control-plane score: 74/100.**
