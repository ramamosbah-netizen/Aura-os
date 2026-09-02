# Security, Data Integrity and Audit

## Authentication and authorization

The repository contains an application-level permissions guard, tenant context, development/admin seed controls, rate limiting, CORS resolution, request caps and fail-closed production posture checks. Local authenticated browser evidence exists for the dev session. Production/staging verifier configuration (`AUTH_JWKS_URL`/secret, `AUTH_REQUIRED`) is operational state and is not proven here.

## RLS and tenant isolation

Read-only local catalog evidence: 237 of 248 public tables have RLS enabled, 232 have FORCE RLS, and 240 policies are present. Gate B/C2 disposable evidence proved the relevant project/quantity/cost tables under a non-superuser/non-BYPASSRLS role. This does not establish that every staging/production connection uses `aura_app`/NOBYPASSRLS or that every environment has the same applied migration state.

**P0:** production/staging RLS posture and role identity remain unverified.

## Data authority boundaries

| Fact | Canonical authority | Audit result |
|---|---|---|
| Frozen handover/source | immutable project snapshot and frozen source items | PASS |
| Delivery mapping | DeliveryItemMap with tenant/project/item bindings | PASS |
| SOLD/EXECUTED/CERTIFIED/BILLED | distinct ledger semantics and governed writers | PASS |
| Actual Cost | Cost Ledger; CBS/WBS are projections | PASS |
| BAC/EV | approved opening baseline + B5 progress | PASS |
| PV/SV/SPI/EAC family | unavailable/not implemented without time-phased authority | PASS; monitor reader drift |
| Original vs Current | append/governed correction and baseline identities | PASS for tested scope |

## Integrity risks

- Current migrations contain 275 files and strong RLS coverage, but many logical relationships remain application-enforced rather than explicit relational constraints. An orphan scan is recommended.
- Invalid UUID input reached a CBS path in prior local logs (`29164`), indicating a validation/error taxonomy gap rather than a tenancy bypass. Treat as P2 until current API fitness closes it.
- Upload MIME/size/AV/signed URL enforcement is not fully verified.
- Corrective/reversal semantics are governed for closed Gate B/C slices, but feature-specific future corrections must not be generalized without a contract.

## Audit/event provenance

Transactional outbox, correlation IDs, audit services and domain events exist. Successful spine operations have event/audit evidence in Gate A/B/C reports. A full operator-facing dead-letter/replay and reconciliation workflow is not proven; best-effort subscribers can swallow failures, so this is a P1 operational gap.

## Table-level RLS classification (local catalog)

The catalog query returned 11 tables with RLS disabled and 16 tables without FORCE RLS. The 16 FORCE exceptions include the 11 disabled tables; they are listed once with both flags.

| Table | RLS | FORCE | Ownership classification | Expected policy | Risk / disposition |
|---|---|---|---|---|---|
| `aura_access_roles` | no | no | global role definitions | no tenant predicate required | acceptable system reference; monitor |
| `aura_access_grants` | no | no | access graph keyed by user/role/scope | tenant scope is indirect | P2 integrity review; app guard is authority |
| `aura_environment` | no | no | single environment marker | global/system | acceptable |
| `aura_events` | no | no | tenant-bearing outbox/event store | system relay uses controlled connection | P1 operational/RLS evidence required; not proven vulnerability |
| `aura_migrations` | no | no | migration ledger | global/system | acceptable |
| `aura_projects_eot_delay_links` | no | no | link table, tenant inherited through EOT/delay parents | parent ownership/FKs | P2; cross-tenant linkage relies on parent/service checks |
| `aura_service_accounts` | no | no | tenant-owned machine identities | tenant RLS expected in app role | P1 release evidence; migration comments document system lookup exception |
| `aura_users` | no | no | tenant-owned user registry | tenant RLS expected in app role | P1 release evidence; auth bootstrap exception is documented |
| `aura_vector_store` | no | no | tenant-owned AI embeddings | guardrailed service boundary | P1 security evidence; no direct exposure proven |
| `aura_webhook_deliveries` | no | no | delivery attempts linked to subscription/event | system dispatcher | P2 operational isolation review |
| `aura_webhook_subscriptions` | no | no | tenant-owned integration config | tenant RLS expected in app role | P1 release evidence; system worker exception |
| `aura_calendar_adjustments` | yes | no | global calendar configuration | RLS enabled, FORCE not required by current policy | acceptable if service-owned; verify role posture |
| `aura_calendar_holidays` | yes | no | global holiday reference | RLS enabled, FORCE not required | acceptable reference |
| `aura_feature_flags` | yes | no | platform configuration | global policy (`using true`) | acceptable system config |
| `aura_finance_journal_lines` | yes | no | financial rows scoped through journal/account | parent/service authorization | P2; FORCE requirement should be explicit if exposed directly |
| `aura_projection_status` | yes | no | global projection health marker | global policy | acceptable system state |

These classifications distinguish missing release evidence from a proven production vulnerability. No catalog mutation was performed.

## Concrete integrity checks

Read-only orphan scans on local PostgreSQL returned zero for WBS→Project, CBS→Project, Quantity Ledger→Project, Cost Ledger→Project, Installation→Project, IPC→Project, PO/GRN→Project, and DeliveryItemMap→WBS/CBS. The scan also exposed a schema-quality issue: several ledger/installation `project_id` columns are text while `aura_projects_projects.id` is UUID, so joins require casts and database FKs cannot enforce those relations. This reclassifies the broad historical “thin FKs” statement as a concrete **P2 data-integrity/technical-debt risk**, not evidence of current orphaned rows.
