# Application Map

## Architecture

```text
Next.js Web (apps/web)
        │ httpOnly session / BFF routes
        ▼
NestJS API (apps/api)
        │
        ├── core: auth, access, tenant context, events, outbox, observability
        ├── shared: IDs, money, contracts, client utilities
        └── modules: domain services + in-memory/PostgreSQL adapters
                │
                ▼
        PostgreSQL / Supabase-compatible migrations (001–0275)
```

This is a modular monolith, not a set of independently deployable services. The module boundary is technical and ownership-oriented; cross-module business flow is carried by application services and events.

## Domain inventory

| Domain package | Source files | Primary responsibility |
|---|---:|---|
| CRM | 152 | leads, opportunities, customers, quotations, commercial decisions |
| Finance | 117 | AP/AR, journals, tax, cash and FX |
| Projects | 87 | project/WBS/CBS, quantity/cost ledgers, EVM, delays/variations |
| Tendering | 61 | tenders, BOQ, estimation, submission, award |
| Contracts | 39 | contract lifecycle, IPC/certification, clauses, bonds |
| HR | 38 | workforce and people processes |
| Procurement | 37 | suppliers, PR/PO/RFQ and spend |
| Doccontrol | 32 | document revisions/transmittals |
| Quality | 29 | inspections/NCR/verification |
| Site | 25 | daily reports, installations, instructions |
| Inventory | 38 | stock, GRN, serials, valuation |
| Others | 8–19 each | engineering, compliance, HSE, fleet/assets, AMC, commissioning, market intelligence, subcontracts, etc. |

## Web surface inventory

There are 202 `page.tsx` files across 30 route families. The full file-level list is in `03-page-register.md`; key family counts are: Admin 24, CRM 30, Finance 22, My Work 7, Procurement 10, Contracts 7, Inventory 8, Projects 6, Quality 8, Tendering 6, Site 6, Subcontracts 5, AMC 5, HR 11.

Navigation is centralized in `apps/web/components/nav.ts`; the current source has 134 `href` entries and feeds both sidebar and command palette. Sales & Commercial is one visible product owner; Pre-Award and Commercial are not separate top-level suites in the current map.

## API surface

107 controllers cover authentication/identity, CRM, tendering, contracts, projects, finance, procurement, inventory, site, quality, HSE, commissioning, documents, admin and integrations. Project routes include handover, delivery maps, WBS/CBS, quantity/cost ledgers, baseline/EVM, delays/EOT and variations. The API has an application-level `PermissionsGuard`, tenant context, correlation IDs, rate limiting/CORS posture and migration readiness checks.

## Persistence

Migration chain count is 275. Current local catalog inspection reports 248 public tables, 237 with RLS, 232 FORCE RLS, and 240 policies. Migrations 0273–0275 cover delivery-item maps, cost provenance, and opening BAC baseline identity. This proves local schema state only; it does not prove staging/production deployment or role posture.

## Ownership observations

- Cost Ledger is the canonical project actual-cost history; CBS/WBS actuals are projections.
- Frozen handover/source items and DeliveryItemMap anchor execution and certification; mutable Tender/CRM state is not execution truth.
- `calculateEvm` retains a legacy three-argument overload while canonical service calls the four-argument PV-unavailable form; readers must be audited before a future refactor.
- `/crm/reports` is a compatibility surface that redirects/lands on Analytics performance; record as route alias, not a duplicate authority.
