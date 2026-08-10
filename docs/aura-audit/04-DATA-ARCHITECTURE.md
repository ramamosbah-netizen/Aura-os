# 04 — Data Architecture

## Scale (measured over `infrastructure/migrations`)

| Metric | Value |
|---|--:|
| Distinct tables | 198 |
| Migrations (sequential, gap-free, no dup numbers) | 220 (→ `0220`) |
| Indexes (`CREATE [UNIQUE] INDEX`) | 331 |
| Explicit `FOREIGN KEY` / `REFERENCES` | **54** |
| RLS-touching migrations | 128 |
| Migrations mentioning `deleted_at`/soft-delete | 3 |
| Destructive statements (`DROP/TRUNCATE`) present in | 83 files (mostly `DROP POLICY IF EXISTS` / idempotent guards — see below) |

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

- **`PARTIALLY_IMPLEMENTED` — referential integrity.** Only **54 explicit FK constraints** exist across 198 tables. The dominant integrity model is **application-enforced references** (service-layer lookups + tenant guards), not database FKs. This is a deliberate trade-off in the modular-monolith (modules must not FK across ownership boundaries — ADR discipline), but it means **orphan rows are possible** if a service path is bypassed or a cascade is missed.
- **Indexing — healthy.** 331 indexes; hot lookup/tenant columns are broadly indexed. Not exhaustively verified per-query, but the ratio (1.67 indexes/table) is reasonable.
- **Soft-delete — sparse.** Only 3 migrations use `deleted_at`. Most modules hard-delete or use status enums. Auditability is provided instead by the **event stream** (append-only `aura_events`), which is a stronger audit substrate than soft-delete but does not by itself prevent physical row loss.
- **Constraints:** `CHECK`/`NOT NULL`/`UNIQUE` are used (e.g. unique reference numbers, enforced by the numbering engine + unique indexes). Not exhaustively catalogued here.

## Multi-tenancy in the data layer

Traced Frontend → API → service → repository → DB in `08`. At the DB tier: RLS policies (`tenant_id = current_tenant_id()`) + the `TenantScopedPool` GUC binding provide **defense in depth** (app guard + RLS). Fail-closed: no bound tenant ⇒ GUC `''` ⇒ NULL ⇒ zero rows.

## Findings

- **Strength:** migration governance is genuinely enterprise-grade (CI-enforced sequencing, @DOWN, restore drill).
- **P1 gap:** thin FK coverage — recommend an orphan-scan catalog run in CI (project history references an "orphan-scan catalog"; verify it covers all spine parents) and selectively add FKs where ownership is intra-module.
- **P2 gap:** soft-delete/retention policy is inconsistent; define a data-lifecycle policy per entity class.

**Database maturity score: 84/100.**
