# 23 — Traceability Matrix

Requirement (business capability) → Module → API surface → DB (migration/table) → UI route → Test. `✓` verified present, `△` partial, `✗` absent/unverified. Endpoint columns cite the module controller(s); exhaustive per-route enumeration is available via `/api/docs-json`.

| Capability | Module | API (controller) | DB | UI route | Test |
|---|---|---|---|---|---|
| Lead management | crm | `crm-leads`, `lead-command` | `0005+` crm | `/crm` | ✓ `crm-lead-*.e2e` |
| Opportunity/pipeline | crm | `crm-opportunities`, `opportunity-360`, `pipeline-command` | crm migs | `/crm` | ✓ `crm-*.e2e` |
| Quotation + pricing | crm | `crm-quotations`, `pricing-sheets` | crm/quotation migs | `/crm` | ✓ `crm-quotation-pricing.e2e` |
| Tender lifecycle | tendering | `tendering`, `estimates`, `pricing`, `win-loss` | tender migs `0178+` | `/tendering` | ✓ `tender-lifecycle.e2e` |
| BOQ import | tendering | `estimates` | tender migs | `/tendering` | ✓ `tender-boq-import.e2e` |
| Contracts + IPC + bonds | contracts | `contracts`, `payment-certificates`, `bonds`, `clauses`, `obligations` | contract migs `0149+` | `/contracts` | ✓ `ar-contract-cap.e2e` |
| Projects + WBS + EVM | projects | `projects` | project migs | `/projects` | ✓ `quantity-ledger.e2e` |
| Cost/quantity ledger | projects/finance | (ledger domain) | ledger migs `0051+` | `/projects`,`/finance` | ✓ `cost-ledger.e2e` |
| Procurement P2P | procurement | `procurement`, `framework-agreements` | procurement migs | `/procurement` | ✓ module tests |
| Inventory / GRN / serial | inventory | `inventory` | inventory migs | `/inventory` | ✓ module tests |
| Finance AR/AP/tax/FX | finance | `finance`, `statements`, `budget`, `period-close` | finance migs | `/finance` | ✓ 33 finance tests |
| Bank recon / PDC / guarantees | finance | `finance` | finance migs | `/finance` | ✓ service tests |
| Subcontracts + backcharge | subcontracts | `subcontracts` (1) | subcontract migs | `/subcontracts` | ✓ module tests |
| ▲ Engineering / drawings | engineering | (1 controller) | engineering migs + **`0224`** | `/engineering/drawings`, `/drawings/[id]` | ✓ `engineering-drawing-workflow.e2e` + **browser** `drawing-workflow.spec` |
| ▲ Document control | doccontrol | (1 controller) | doccontrol migs + **`0226`** | `/doccontrol/register`, `/register/[id]`, `/transmittals` | ✓ `doccontrol-document-workflow.e2e` + **browser** `document-workflow.spec` |
| ▲ Site execution | site | (1 controller) | site migs + **`0227`** | `/site/daily-reports`, `/site/execution/[id]` | ✓ `site-execution-workflow.e2e` + **browser** `site-execution.spec` |
| ▲ QA/QC (ITP/NCR) | quality | (1 controller) | quality migs + **`0225`** | `/quality/ncrs`, `/quality/ncrs/[id]` | ✓ `quality-ncr-workflow.e2e` + **browser** `ncr-workflow.spec` |
| HSE | hse | (1 controller) | hse migs | `/hse` | △ CRUD — **unchanged at Rev 2** |
| ▲ Commissioning → Handover | commissioning | `commissioning` (2) | commissioning migs + **`0228`** | `/commissioning`, `/commissioning/[id]`, `/handover` | ✓ `commissioning-handover-workflow.e2e` + **browser** `commissioning-workflow.spec` (commissioning side; **handover depth still △**) |
| AMC / work orders | amc | (1 controller) | amc migs | `/amc` | △ |
| Assets | assets | (1 controller) | assets migs | `/assets` | △ |
| HR | hr | (1 controller) | hr migs `0025+` | `/hr` | △ 9 tests, thin API |
| Fleet | fleet | (1 controller) | fleet migs | `/fleet` | △ |
| Global search | search | `search` | (fan-out, no table) | `/search` | ✓ `search.service.test` (unit) |
| Notifications | core/notifications | (subscriber + store) | notification migs | `/notifications` | △ delivery unverified |
| Admin control plane | admin | 13 controllers | config/identity migs | `/admin` (24 pages) | △ |
| Auth / identity | core | `auth` | identity migs | `/login` | ✓ guard tests |
| Multi-tenancy (RLS) | core | (all) | `0163/0164` + **148 `CREATE POLICY`** statements *(Rev 1's "128 RLS migs" was a mismeasurement — see `README.md`)* | (all) | ✓ isolation tests (dev) + `rbac-tenant-isolation.e2e` |
| Idempotency | core | (spine creates) | idempotency mig | — | ✓ |
| Events / outbox | core | `events` | `0001`,`0013` | `/events` | ✓ subscriber tests |
| Field service / mobile | — | ✗ | ✗ | ✗ | ✗ |

## Coverage summary (Rev 2)

- **Fully traceable (req→API→DB→UI→test):** CRM, tendering, contracts, finance, procurement, inventory, projects — the acquisition-to-cash spine — **plus (Rev 2) engineering, doccontrol, site, QA/QC and commissioning**, which additionally carry **browser-level** journey proof the spine does not.
- **Partial (req→API→DB, thin UI/test):** HSE, handover, AMC, assets, HR, fleet, notifications.
- **Absent:** field service / mobile / offline.

> **Traceability caveat (Rev 2).** "Fully traceable" for the spine still means *API-level* test evidence only — the spine has **no browser E2E** (P0 G-03). The five delivery-half rows are, on the UI-proof axis, now better evidenced than the spine rows they sit beneath.
