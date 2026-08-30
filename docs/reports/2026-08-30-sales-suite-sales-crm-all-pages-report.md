# Sales Suite / Sales CRM — All Pages and Reports

**Audit date:** 30 August 2026
**Environment:** Local Aura OS on `main` (`http://localhost:3000`)
**Scope:** Every route under `/crm`, including canonical workspaces, query-backed report views, 360 records, commercial/pricing workspaces, print surfaces, and legacy redirects.

## Executive summary

Sales Suite and Sales CRM are the same Aura OS product boundary: the **Sales** suite owns every `/crm` route.

- **30 page routes** exist under `/crm`.
- **11 canonical Sales navigation destinations** are visible to users.
- **3 Analytics reports** exist: Performance, Sources & Margin, and Executive.
- **2 Forecast/Pipeline display modes** exist: Board and List, with Forecast as a separate management surface.
- **3 Quotation surfaces** exist: Overview analytics, List register, and Board register.
- **4 dedicated print/PDF-ready document surfaces** exist: Account Register, Account Dossier, Client Quotation, and Internal Pricing Sheet.
- Operational reports are distributed across Radar, Customers, Activities, Quotations, Commercial, and 360 pages.
- `/crm/reports` does **not** list all reports; it redirects to `/crm/analytics?view=performance`.

### Live local snapshot

| Area | Current local result |
|---|---:|
| Open pipeline | AED 0 |
| Weighted forecast | AED 0 |
| Active opportunities | 0 |
| Won deals (90 days) | 1 |
| Win rate | 100% |
| Sales signals | 0 |
| Leads | 0 |
| Accounts | 1 |
| Contacts | 1 |
| Campaigns | 0 |
| Quotations | 1 accepted |
| Total quoted / accepted | AED 35,686 |
| Quotation acceptance rate | 100% |
| Logged sales activities | 0 |

The figures above are a point-in-time read of the local demo company and will change as records change.

## Canonical Sales pages and their reports

| Page | Route | Reports and decision information | Export / print | Status |
|---|---|---|---|---|
| Sales Overview | `/crm/overview` | Open pipeline, weighted forecast, active deals, win rate, stage funnel, attention queue, AI sales brief | None | Live |
| Radar | `/crm/radar` | Signal counts by status, source and type; filterable signal register | CSV | Live |
| Leads | `/crm/leads` | Lead funnel, owner/source filters, active/overdue/qualifying/qualified KPIs, Board/List | None | Live |
| Opportunities | `/crm/pipeline?view=board` and `?view=list` | Lead/opportunity KPIs, pipeline value, weighted forecast, won value, win rate, stage/owner/customer filters | No visible export | Live |
| Forecast | `/crm/forecast` | Expected close, confidence, commit/best-case/forecast-category management | None | Live; client report loads asynchronously |
| Analytics — Performance | `/crm/analytics?view=performance` | Conversion, win/loss and performance analysis | None | Live; client report loads asynchronously |
| Analytics — Sources & Margin | `/crm/analytics?view=sources` | Source funnel, channel contribution and margin analysis | None | Live; client report loads asynchronously |
| Analytics — Executive | `/crm/analytics?view=executive` | Won/lost counts and value, deal/value win rates, win/loss reasons, competitor mentions and revenue concentration; 90-day/1-year/2-year windows | None | Live |
| Customers | `/crm/customers` | Accounts, Contacts and Stakeholder Map views with relationship coverage | Account Excel/PDF; Contact CSV/Excel/Print | Live |
| Campaigns | `/crm/campaigns` | Total spend, attributed won value, leads generated, blended ROI and channel breakdown | None | Live |
| Quotations | `/crm/quotations` | Total/open/accepted value, acceptance rate, average deal size, expiry and approval attention, stage value, outcomes and sources | Register exports/print | Live |
| Quotation Register | `/crm/quotations/register` | Filterable List and Board; global stage totals and values | CSV, Excel, Print; client quote print per row | Live |
| Commercial | `/crm/commercial` | Overview, Decision Queue, Quotations, Pricing, Financials, Risks, Negotiation, Documents, Approvals and Margins | None | Live |
| Market Intelligence | `/crm/market-intelligence` | Reference item catalogue with category, cost, selling benchmark, installation effort, source and as-of date | None | Live |

## Supporting and contextual Sales pages

| Page | Route | Report coverage | Export / print | Status |
|---|---|---|---|---|
| Accounts Portfolio | `/crm/accounts` | Total accounts, prospects, active customers, active opportunities, pipeline, contracted value, outstanding AR, at-risk accounts and health register | Excel, PDF register | Live; also embedded in Customers |
| Account Register Print | `/crm/accounts/print` | A4/PDF-ready full account register | Browser print / PDF | Implemented |
| Account 360 | `/crm/accounts/[id]` | Commercial snapshot, contacts, opportunities, tenders, quotations, contracts, projects, receivables, activity and relationship map | Customer dossier Excel/PDF | Implemented; data loads asynchronously |
| Account Dossier Print | `/crm/accounts/[id]/print` | Profile, commercial summary, contacts, opportunities, tenders, quotations, contracts, projects and timeline | Browser print / PDF | Implemented |
| Contacts Register | `/crm/contacts` | Total contacts, decision makers, champions, primary contacts, unmapped roles and uncovered accounts | CSV, Excel, Print, full filtered CSV | Live; also embedded in Customers |
| Contact 360 | `/crm/contacts/[id]` | Stakeholder profile, account relationship and contextual activity | No dedicated dossier export | Implemented; data loads asynchronously |
| All Activity Register | `/crm/activities` | Open, overdue, due today/week, completed 30-day KPIs; record/type/status filters; due-date buckets | CSV, Excel, Print | Live |
| Contextual Activity Timeline | `/crm/activities?relatedType=…&record=…` | Same activity history scoped to Account, Contact, Lead, Opportunity, Quotation, Tender, Contract or Project | Same register tools | Implemented |
| Lead 360 | `/crm/leads/[id]` | Qualification, timeline, documents and conversion context | No dedicated dossier export | Implemented |
| Opportunity 360 | `/crm/opportunities/[id]` | Deal KPIs, qualification, stakeholders, win plan, requirements, scope, pursuit, commitments, activities and commercial depth | No visible full dossier export | Implemented; data loads asynchronously |
| Opportunity Estimate | `/crm/opportunities/[id]/pre-award/estimate/[estimateId]` | Detailed estimate workspace and cost build-up | No dedicated print route under CRM | Implemented |
| Opportunity Pricing | `/crm/opportunities/[id]/pre-award/pricing/[sheetId]` | Pre-award package pricing and commercial policy | No dedicated print route under CRM | Implemented |
| Quotation 360 | `/crm/quotations/[id]` | Quote status, pricing summary, revisions, terms, negotiation and conversion controls | Client quotation print | Implemented |
| Quotation Pricing | `/crm/quotations/[id]/pricing` | Material, labour, equipment, subcontract, loadings, cost, sell, profit, margin, benchmark, history and pricing advice | Internal pricing print | Live |
| Client Quotation Print | `/crm/quotations/[id]/print` | Customer-facing quote with line items, VAT, total, validity, notes and signatures | Browser print / PDF | Live |
| Internal Pricing Print | `/crm/quotations/[id]/pricing/print` | Internal cost breakdown, direct/indirect cost, sell, profit, margin and markup | Browser print / PDF | Live; clearly marked internal |

## Redirects and route ownership

| Legacy route | Canonical destination | Result |
|---|---|---|
| `/crm/reports` | `/crm/analytics?view=performance` | Verified redirect |
| `/crm/opportunities` | `/crm/pipeline` | Verified redirect |
| `/crm/my-day` | `/my-work/my-day` | Verified redirect; personal execution belongs to My Work |
| `/crm/pipeline?tab=radar` | `/crm/radar` | Defined redirect |
| `/crm/pipeline?tab=forecast` | `/crm/forecast` | Defined redirect |
| `/crm/pipeline?tab=analytics` | `/crm/analytics` | Defined redirect |
| `/crm/pipeline?tab=overview` | `/crm/overview` | Defined redirect |

## Reporting coverage by capability

| Capability | Pages with coverage | Assessment |
|---|---|---|
| Executive KPIs | Overview, Forecast, Analytics, Customers, Campaigns, Quotations, Commercial, Account 360, Opportunity 360 | Strong |
| Filterable registers | Radar, Leads, Opportunities, Accounts, Contacts, Activities, Quotations | Strong |
| CSV export | Radar, Contacts, Activities, Quotations | Partial |
| Excel export | Accounts, Account 360, Contacts, Activities, Quotations | Good |
| Print/PDF | Accounts, Account 360, Contacts, Activities, Quotations, Pricing | Good |
| Board/List visual analysis | Leads, Opportunities, Quotations | Strong |
| Time-window analysis | Analytics Executive | Present but narrow |
| Cross-page report discovery | Only Analytics is linked as “Reports” | Missing |

## Gaps and recommended priority

### P0 — Create one Sales Report Center

Add a visible **Reports** destination under Sales that catalogs and links to every report surface instead of silently redirecting to only Performance Analytics. The center should group:

1. Executive: Overview, Forecast, Performance, Sources & Margin, Executive.
2. Pipeline: Radar, Leads, Opportunities, Activities.
3. Customers: Accounts Portfolio, Contacts Coverage, Stakeholder Map, Account Dossier.
4. Revenue: Campaign ROI, Quotations, Commercial, Margin and Pricing.
5. Documents: Account Register, Account Dossier, Client Quotation, Internal Pricing Sheet.

### P1 — Normalize exports

Add consistent CSV/Excel/Print controls to Leads, Opportunities, Forecast, Analytics, Campaigns, Commercial and Market Intelligence. Preserve server-side filtering so exports represent the full filtered result, not only the visible page.

### P1 — Add report freshness and scope labels

Every management report should state:

- company / tenant scope;
- selected date window;
- active filters;
- generated/refreshed time;
- whether totals cover the full dataset or the current page.

### P2 — Add governed 360 dossiers

Account 360 already has a strong dossier. Add equivalent printable/exportable dossiers for Lead, Contact, Opportunity and Quotation 360 where business users need formal review packs.

### P2 — Improve slow-report feedback

Forecast, Analytics and several 360 pages load their detailed data asynchronously. Keep the existing loading state, but add a visible last-refresh timestamp and a retry/error message if the report exceeds its expected response time.

## Conclusion

The Sales suite already contains substantial reporting depth. The main weakness is not missing data; it is **discoverability and consistency**. Users must know which operational page contains each report, and export controls vary by surface. A single Sales Report Center plus normalized exports would make the existing capability feel complete without duplicating domain logic or creating parallel report implementations.
