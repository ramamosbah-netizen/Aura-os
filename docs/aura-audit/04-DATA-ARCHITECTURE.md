# 04 — Data Architecture

## Scale (measured over `infrastructure/migrations`)

| Metric | Rev 1 | **Rev 2 (`1a14a036`)** |
|---|--:|--:|
| Distinct tables | 198 | **218** |
| Migrations (sequential, gap-free, no dup numbers) | 220 (→ `0220`) | **228** (→ `0228`) |
| Indexes (`CREATE [UNIQUE] INDEX`) | 331 | **358** |
| Explicit `FOREIGN KEY` / `REFERENCES` | **54** | **62** |
| RLS policy statements (`CREATE POLICY`) | ~~128 "RLS-touching migrations"~~ *(mismeasured — see `README.md`)* | **148** |
| Migrations mentioning `deleted_at`/soft-delete | 3 | *not re-measured* |
| Destructive statements (`DROP/TRUNCATE`) present in | 83 files (mostly `DROP POLICY IF EXISTS` / idempotent guards — see below) | *not re-measured* |

> **Rev 2 (2026-08-12).** The +8 migrations (`0221`–`0228`) add idempotency records, ELV devices, compliance core, and the five delivery-half workflow schemas (`0224`–`0228`). The +20 tables are largely **child records keyed to a parent aggregate** — drawing revisions/submissions/reviews, NCR verifications, document revisions, transmittal items, the five site daily-report line-item types, commissioning test items and punch items. The +8 FKs sit mostly on those parent-child edges.

## Migration discipline — `VERIFIED_IMPLEMENTED`

- **Sequential & gap-free** (`0001`…`0220`), enforced in CI by `scripts/migration-policy-check.mjs` and required `@DOWN` sections on new files.
- **No duplicate numbers** at this commit (a prior `0078` duplication noted in project history is resolved).
- **Kernel-first ordering:** `0001_kernel_events`, `0002_kernel_documents`, `0003_kernel_workflows`, `0004_kernel_webhooks`, then module tables.
- **RLS delivered incrementally** and hardened in `0163_enforce_rls_tenant_isolation.sql` + `0164_rls_activation_closure.sql` (least-privilege `aura_app` role, NOSUPERUSER/NOBYPASSRLS).

## Entity catalogue (spine — representative)

| Entity | Owning module | Tenant key | Lifecycle |
|---|---|---|---|
| Account / Lead / Opportunity / Quotation | crm | `tenant_id` | pipeline → won/lost |
| Tender / Estimate / Bid | tendering | `tenant_id` | draft → submitted → awarded/lost |
| Contract / IPC / Bond / Clause | contracts | `tenant_id` | draft → signed → completed |
| Project / WBS / Variation | projects | `tenant_id` | created → executing → completed |
| PurchaseOrder / GRN / Supplier | procurement/inventory | `tenant_id` | committed → received → matched |
| Invoice / Payment / Journal / Budget | finance | `tenant_id` (+`company_id`) | draft → approved → paid |
| Asset / WorkOrder (AMC) | assets/amc | `tenant_id` | active → disposed / open → completed |
| `aura_events` (outbox) | core | `tenant_id` | appended → processed / dead-lettered |

Every business table carries `tenant_id` (the RLS predicate `tenant_id = current_tenant_id()`), and finance additionally uses `company_id` for multi-company (`app.current_company_id`).

## Relationship & integrity analysis

- **`PARTIALLY_IMPLEMENTED` — referential integrity.** Only **62 explicit FK constraints** (Rev 1: 54) exist across **218** tables. The dominant integrity model is **application-enforced references** (service-layer lookups + tenant guards), not database FKs. This is a deliberate trade-off in the modular-monolith (modules must not FK across ownership boundaries — ADR discipline), but it means **orphan rows are possible** if a service path is bypassed or a cascade is missed. *Rev 2: the ratio is essentially flat (0.27 → 0.28 FKs/table) — the new workflow tables did not change the integrity model, they extended it.*
- **Indexing — healthy.** **358** indexes (Rev 1: 331); hot lookup/tenant columns are broadly indexed. Not exhaustively verified per-query, but the ratio (**1.64** indexes/table) is reasonable and steady.
- **Soft-delete — sparse.** Only 3 migrations use `deleted_at`. Most modules hard-delete or use status enums. Auditability is provided instead by the **event stream** (append-only `aura_events`), which is a stronger audit substrate than soft-delete but does not by itself prevent physical row loss.
- **Constraints:** `CHECK`/`NOT NULL`/`UNIQUE` are used (e.g. unique reference numbers, enforced by the numbering engine + unique indexes). Not exhaustively catalogued here.

## Multi-tenancy in the data layer

Traced Frontend → API → service → repository → DB in `08`. At the DB tier: RLS policies (`tenant_id = current_tenant_id()`) + the `TenantScopedPool` GUC binding provide **defense in depth** (app guard + RLS). Fail-closed: no bound tenant ⇒ GUC `''` ⇒ NULL ⇒ zero rows.

## Findings

- **Strength:** migration governance is genuinely enterprise-grade (CI-enforced sequencing, @DOWN, restore drill).
- **P1 gap:** thin FK coverage — recommend an orphan-scan catalog run in CI (project history references an "orphan-scan catalog"; verify it covers all spine parents) and selectively add FKs where ownership is intra-module.
- **P2 gap:** soft-delete/retention policy is inconsistent; define a data-lifecycle policy per entity class.

**Database maturity score: 84/100.**
