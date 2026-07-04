# Volume 25 — Appendices

[← Master index](README.md)

---

## A. Glossary

| Term | Meaning in AURA |
|---|---|
| **ABAC** | Attribute-based access control — grants conditioned on tenant/company/ownership attributes |
| **AMC** | Annual Maintenance Contract (FM service agreements) |
| **BFF** | Backend-for-frontend — `apps/web/app/api/**` routes proxying `/api/v1` |
| **BOQ** | Bill of Quantities — priced tender line items |
| **CBS / WBS** | Cost / Work Breakdown Structure |
| **CDM** | Common domain model (`shared/domain/cdm.ts`) |
| **Deal chain** | Lead→Opportunity→Quotation→Tender→Contract→Project, event-connected |
| **DLP** | Defects Liability Period |
| **EOSB** | End-of-Service Benefits (UAE gratuity) |
| **EVM / CPI / SPI** | Earned Value Management; cost/schedule performance indices |
| **Form engine** | Metadata form platform (Volume 5) |
| **GRN / GRNI** | Goods Receipt Note / GRN-not-invoiced liability account |
| **IPC** | Interim Payment Certificate |
| **IR / NCR / ITP / MAR** | Inspection Request / Non-Conformance Report / Inspection & Test Plan / Material Approval Request |
| **Kernel** | `core/` + `shared/` — platform services no module rebuilds |
| **MCP** | Model Context Protocol — AURA exposes tools to AI agents |
| **Mulkiya** | UAE vehicle registration card |
| **Outbox** | Event persisted in the same DB transaction as the business row |
| **Port / adapter** | Interface + in-memory + Postgres implementations |
| **PPM** | Planned Preventative Maintenance |
| **PTW / CAPA** | Permit to Work / Corrective & Preventive Action |
| **Reactor** | Event subscriber that performs a cross-module action idempotently |
| **RLS** | Row-Level Security (Postgres) |
| **Salik** | Dubai road toll |
| **Snapshot-not-join** | Cross-context references copy id+name; no FK (ADR-0001) |
| **Spine** | The deal-chain entities (account/tender/contract/project/PO/invoice) |
| **TRN** | Tax Registration Number (UAE VAT) |
| **WAC** | Weighted Average Cost (moving) |
| **WPS / SIF** | Wage Protection System / Salary Information File (SCR/EDR records) |

## B. Standards

Applied or targeted: **UAE VAT** (5%, returns) · **WPS SIF** format · **UAE Labour Law** EOSB
bands · **IFRS-15** revenue recognition (cost-to-cost) · double-entry accounting invariants ·
**WCAG 2.1 AA** (target, Vol 21 §5) · **SOC 2** (program target) · **UAE PDPL / GDPR**
(posture target) · JWT/JWKS (RFC 7519/7517) · HMAC-signed webhooks.

## C. Naming

| Artifact | Convention | Example |
|---|---|---|
| DB tables | `aura_<module>_<entity>` plural | `aura_crm_accounts` |
| Indexes | `idx_aura_<table>_<purpose>` | `idx_aura_crm_accounts_tenant` |
| Events | `<context>.<entity>.<verb>` past tense | `finance.invoice.approved` |
| API | `/api/v1/<module>/<resource>` (+`/:id/<verb>`) | `/api/v1/tendering/tenders/:id/status` |
| Packages | `@aura/<name>` | `@aura/shared` |
| Files | kebab-case; `X-store.ts` port, `in-memory-X-store.ts`, `postgres-X-store.ts` | |
| Form schemas | `<module>.<entity>` | `hr.employee` |
| Migrations | `NNNN_<area>_<topic>.sql` sequential | `0126_tender_win_loss.sql` |
| Permissions (proposed) | `<module>.<entity>.<verb>` | `finance.invoice.approve` |

## D. Coding Standards

- TypeScript strict everywhere; no `eval`/dynamic code (the formula engine exists precisely
  to avoid it).
- Controllers thin → services own transactions (`TX_RUNNER`) → domain pure → stores dumb.
- Every store behind a port with dual adapters; no vendor SDK outside `core`.
- Events appended in-transaction; reactors idempotent.
- Tests colocated (`*.test.ts`, vitest); in-memory adapters for speed; comments state
  constraints, not narration.
- Lint: ESLint flat config; unused vars must match `/^_/`.
- Known debt register lives in Vol 23 §3 (pg-mapper `any`s, CRLF normalization).

## E. Architecture Decisions (summary register)

All fourteen decisions are formalized in `docs/adr/` (back-filled 2026-07-03):

| ADR | Decision |
|--:|---|
| [0001](../adr/0001-fk-policy.md) | **FK policy — snapshot-not-join across contexts**; 1 hard FK platform-wide |
| [0002](../adr/0002-transactional-outbox.md) | Transactional outbox + polling relay (SKIP LOCKED) over brokers |
| [0003](../adr/0003-dual-runtime-adapters.md) | Dual-runtime (in-memory ⇄ Postgres) via DI on `PG_POOL` |
| [0004](../adr/0004-no-module-imports.md) | No module→module imports; idempotent reactors only |
| [0005](../adr/0005-single-ai-seam.md) | Single AI seam; local fallback keeps AI features alive keyless |
| [0006](../adr/0006-forms-are-json.md) | Form schemas are pure JSON; behavior by registry id |
| [0007](../adr/0007-formula-engine-no-eval.md) | Formula engine hand-rolled, no eval; cycles rejected at compile |
| [0008](../adr/0008-createdrawer-frozen-adapter.md) | `CreateDrawer` API frozen as adapter (zero-regression migration) |
| [0009](../adr/0009-rest-first.md) | REST-first; GraphQL demand-triggered |
| [0010](../adr/0010-rls-authored-early-enforced-last.md) | RLS authored early, **enforced last** — accepted risk, tracked P0 |
| [0011](../adr/0011-crm-email-ms-graph.md) | CRM email via Microsoft Graph (GCC market) |
| [0012](../adr/0012-metadata-designer-sequence.md) | Metadata designers sequenced: forms → views → dashboards → entities |
| [0013](../adr/0013-export-first-bi.md) | Export-first BI (no embedded lock-in) |
| [0014](../adr/0014-css-token-design-system.md) | Design system on CSS tokens; no UI framework dependency |

## F. RFC Process [proposed]

For platform-affecting changes (new kernel service, event-catalog changes, metadata surface,
security posture): 1-page RFC in `docs/rfc/NNN-title.md` (motivation, design, alternatives,
migration) → review → ADR on acceptance. Module-internal changes need no RFC — the template
is the contract. Threshold rule: *if it changes a contract in `shared/`, it needs an RFC.*

## G. Source-of-record index

| Record | Location |
|---|---|
| This report | `docs/master-report/` (25 volumes + README health board) |
| Verification reports (28) | `docs/reports/` (dated) |
| Blueprints (historical) | `docs/AURA-*.md` |
| ADRs | `docs/adr/` |
| Event catalog | `shared/src/events/catalog.ts` |
| Form engine | `shared/src/forms/` + `apps/web/components/form-engine/` |
| Migrations | `infrastructure/migrations/0001–0126` |
| CI | `.github/workflows/ci.yml` |

---

*End of the Master Report. Maintained with the codebase: every volume carries verifiable
paths; the health board (README) and gap register (Volume 23) are updated together as rows
close.*
