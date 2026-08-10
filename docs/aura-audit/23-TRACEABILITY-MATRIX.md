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
| Engineering / drawings | engineering | (1 controller) | engineering migs | `/engineering` | △ model-only |
| Document control | doccontrol | (1 controller) | doccontrol migs | `/doccontrol` | △ model-only |
| Site execution | site | (1 controller) | site migs | `/site` | △ events only |
| QA/QC (ITP/NCR) | quality | (1 controller) | quality migs | `/quality` | △ |
| HSE | hse | (1 controller) | hse migs | `/hse` | △ CRUD |
| Commissioning → Handover | commissioning | `commissioning` (2) | commissioning migs | `/commissioning`,`/handover` | △ event-wired |
| AMC / work orders | amc | (1 controller) | amc migs | `/amc` | △ |
| Assets | assets | (1 controller) | assets migs | `/assets` | △ |
| HR | hr | (1 controller) | hr migs `0025+` | `/hr` | △ 9 tests, thin API |
| Fleet | fleet | (1 controller) | fleet migs | `/fleet` | △ |
| Global search | search | `search` | (fan-out, no table) | `/search` | ✓ `search.service.test` (unit) |
| Notifications | core/notifications | (subscriber + store) | notification migs | `/notifications` | △ delivery unverified |
| Admin control plane | admin | 13 controllers | config/identity migs | `/admin` (24 pages) | △ |
| Auth / identity | core | `auth` | identity migs | `/login` | ✓ guard tests |
| Multi-tenancy (RLS) | core | (all) | `0163/0164` + 128 RLS migs | (all) | ✓ isolation tests (dev) |
| Idempotency | core | (spine creates) | idempotency mig | — | ✓ |
| Events / outbox | core | `events` | `0001`,`0013` | `/events` | ✓ subscriber tests |
| Field service / mobile | — | ✗ | ✗ | ✗ | ✗ |

## Coverage summary
- **Fully traceable (req→API→DB→UI→test):** CRM, tendering, contracts, finance, procurement, inventory, projects — the acquisition-to-cash spine.
- **Partial (req→API→DB, thin UI/test):** engineering, doccontrol, site, QA/QC, HSE, commissioning, handover, AMC, assets, HR, fleet, notifications.
- **Absent:** field service / mobile / offline.
