# Sales IA / Duplication / Canonical Ownership Audit

**Audit date:** 30 August 2026
**Environment:** Aura OS local, `main`
**Decision rule:** **One capability → One canonical owner**
**Scope:** Sales navigation, Commercial's ten tabs, Customers / Accounts / Contacts, Leads / Pipeline / Opportunities, Quotations / Pricing, Reports / Analytics, and the related approval and document surfaces.

> This is an architecture and ownership audit. It does not authorize deletion or implementation. Every recommendation below preserves unique business actions before consolidating a surface.

## Executive verdict

The proposed Sales information architecture is correct, with one refinement: **Commercial should remain a cross-deal control center, while Quote and Opportunity records remain the places where work is executed.** The current implementation already points in that direction, but it does not enforce it consistently.

The audit found four different situations:

1. **True workflow duplication:** the Opportunities Pipeline implements lead capture, qualification and conversion even though Leads and Lead 360 already own that lifecycle.
2. **Shared shell, not duplicate logic:** Customers embeds the exact Accounts and Contacts components and calls the same APIs. The duplication is mainly in the legacy list routes, not in business logic or storage.
3. **Unique functions living in the wrong workspace:** Commercial Negotiation and Commercial Documents contain real functionality that must be preserved and relocated, not removed.
4. **Valid cross-domain views with unsafe execution boundaries:** Commercial Decision Queue is a useful control view, but it directly approves or cancels quotations instead of opening the canonical quotation decision context.

### Recommended target Sales navigation

```text
SALES
├── Overview
├── Radar
├── Leads
├── Opportunities
├── Forecast
├── Customers
├── Activities
├── Campaigns
├── Quotations
├── Commercial
├── Market Intelligence
└── Reports
```

`Analytics` becomes a report family below Reports while its existing `/crm/analytics` routes remain stable. `Activities`, already implemented at `/crm/activities`, becomes a first-class Sales destination.

## Meaning of the decisions

| Decision | Meaning in this audit |
|---|---|
| **KEEP** | The capability is correctly owned. It may still need UX or data-quality improvements. |
| **MERGE** | Preserve the useful behavior, then combine it with another surface owned by the same canonical capability. |
| **MOVE** | Preserve and relocate the capability to its canonical owner. The original workspace may retain a read-only summary/link. |
| **REDIRECT** | Keep the URL as a compatibility route, but send users to the canonical surface. |
| **REMOVE** | Remove only the duplicated surface/action after its required behavior is available at the canonical owner. This never means delete the underlying business capability or data. |

## P0 findings

### P0.1 — Lead workflow is implemented twice

`/crm/leads` and Lead 360 deliberately make the lead record the place for qualification and conversion. The Leads board even documents that conversion must happen in Lead 360 so readiness context is not skipped (`apps/web/components/leads-workspace.tsx:167`).

The Opportunities Pipeline separately provides:

- Quick lead capture (`apps/web/components/crm-pipeline-client.tsx:406`).
- New Leads and Qualified Leads columns (`:365-366`).
- Drag-to-qualify and drag-to-convert (`:299-317`).
- Direct qualify and conversion buttons (`:892-902`, `:1034-1035`).
- Direct calls to `/api/crm/leads/{id}/convert` (`:256-270`).

This is a true duplicate workflow with different UX rules. It should be removed from Opportunities after the Leads workspace is confirmed to preserve all required capture and conversion paths.

### P0.2 — Commercial approval bypasses the canonical record context

Commercial Decision Queue directly calls the quotation status endpoint with `approve` or `cancel` (`apps/web/components/commercial-decision-queue.tsx:80-102`) and renders action buttons in the queue (`:208-224`). This is the same command boundary used by Quotation 360.

The server correctly enforces segregation of duties, approval authority and amount limits (`modules/crm/src/quotation.service.ts:129-146`) and locks the approved Commercial Baseline (`:148-164`). However, the document-readiness checklist displayed in Commercial is not enforced by the service. It is a UI-derived indicator (`apps/web/components/decision-readiness.tsx:83-124`), not an approval invariant.

The queue should keep prioritization and readiness visibility, but approval execution should open Quotation 360. If required evidence is policy, the API must enforce it or require an explicit, auditable waiver.

### P0.3 — Commercial margin reporting uses the wrong data contract

Quotation 360 reads a dedicated pricing view and calculates cost, profit and margin from it (`apps/web/components/quotation-360-client.tsx:87-105`). Commercial Financials instead attempts to find `unitCost` on quotation lines and explicitly reports that margin is unavailable when those fields are absent (`apps/web/components/commercial-financials.tsx:6-14`, `:26-60`).

This can show “margin unknown” even when the quotation has a valid pricing sheet. Commercial Financial Performance must consume a canonical pricing/baseline summary API, not infer cost from the customer quotation line contract.

### P0.4 — Reports is not a report center

`/crm/reports` currently performs only a redirect to `/crm/analytics?view=performance` (`apps/web/app/crm/reports/page.tsx:1-6`). It does not provide discovery across Sales reports, registers and printable documents.

Reports should become a catalog and composition layer, not another calculation engine or workflow owner.

## Canonical ownership register

Each row has exactly one decision.

| Capability | Decision | Current owner / surface | Proposed canonical owner | Duplicate implementation | Unique functionality to preserve | Key dependencies | Risk | Evidence |
|---|---|---|---|---|---|---|---|---|
| Sales command overview | **KEEP** | Sales Overview | Sales Overview | None proven | Cross-Sales KPIs and attention | Pipeline, forecast, activities | Low | `/crm/overview` |
| Sales signals | **KEEP** | Radar | Radar | None proven | Signal triage and export | CRM signals API | Low | `/crm/radar` |
| Lead lifecycle | **KEEP** | Leads + Lead 360 | Leads + Lead 360 | Duplicated inside Pipeline | Capture, lifecycle, qualification, readiness, convert | Lead APIs, account/contact creation, opportunity conversion | Medium | `leads-workspace.tsx:5-10`, `:167-168` |
| Lead workflow copy inside Opportunities | **REMOVE** | Opportunities Pipeline | Leads + Lead 360 | Yes: separate board, buttons and direct mutation calls | Preserve quick capture in Leads; preserve source lineage on Opportunity | Internal links, tests, saved views | High | `crm-pipeline-client.tsx:256-317`, `:365-406`, `:892-902`, `:1034-1035` |
| Opportunity register and stages | **KEEP** | `/crm/pipeline` | Opportunities | None proven outside the lead copy | Deal board/list, stage progression, weighted value | Opportunity API, accounts | Medium | `sales-pipeline-workspace.tsx`, `crm-pipeline-client.tsx` |
| Opportunity record | **KEEP** | Opportunity 360 | Opportunity 360 | No second record implementation proven | Qualification, strategy, stakeholders, win plan, engagement, governance and history | Opportunity APIs, activities, DMS, quotations | Medium | `opportunity-360-client.tsx:417-422` |
| Direct-sale pre-award package | **KEEP** | Opportunity 360 Commercial panel | Opportunity 360 → Pre-Award | Not a duplicate of quote pricing | Scope approval, estimate, pricing revisions/freeze, generate quotation | Pre-award APIs, estimate/pricing routes | High | `commercial-panel.tsx`; `/crm/opportunities/[id]/pre-award/*` |
| Tender-route estimate and pricing | **MOVE** | Mixed contextual links | Tendering | Superficially overlaps direct-sale pricing, but domain differs | Tender-owned pricing sheets and tender governance | Tendering routes and APIs | High | `commercial-workspace.tsx:125-133`; source tender link in `quotation-360-client.tsx:157` |
| Forecast management | **KEEP** | Forecast | Forecast | Analytics reuses the presentation component but does not own snapshots | Forecast categories and immutable snapshot capture | Opportunity forecast endpoints | Medium | `sales-insight-workspace.tsx:34` and forecast API calls in `crm-pipeline-client.tsx` |
| Sales activity register | **KEEP** | `/crm/activities` | Activities | Contextual timelines are valid filtered views | Cross-record activity register, filters and exports | Activities API, record links | Low | `/crm/activities` |
| Customers workspace | **KEEP** | `/crm/customers` | Customers | No independent store or alternate components | Unified Accounts, Contacts and Stakeholder Map entry point | Accounts and Contacts APIs | Low | `customers/page.tsx:8-16`; `customers-workspace-client.tsx:121-125` |
| Accounts list route | **REDIRECT** | `/crm/accounts` | `/crm/customers?view=accounts` | Same `AccountsPortfolioClient` is rendered twice | Preserve filters, create/edit, Excel/PDF and deep links | Internal links, tests, favorites, query preservation | Medium | `accounts/page.tsx:7-20`; `customers-workspace-client.tsx:121` |
| Account record and dossier | **KEEP** | `/crm/accounts/[id]` | Account 360 | No duplicate record owner proven | Account commercial context, exports and print dossier | Accounts, contacts, opportunities, documents | Low | `/crm/accounts/[id]`, `/crm/accounts/[id]/print` |
| Contacts list route | **REDIRECT** | `/crm/contacts` | `/crm/customers?view=contacts` | Same `ContactsClient` and same endpoints are used | Preserve filters, create/edit, CSV/Excel/Print | Internal links, tests, favorites, query preservation | Medium | `contacts/page.tsx:37-53`; `customers-workspace-client.tsx:123` |
| Contact record | **KEEP** | `/crm/contacts/[id]` | Contact 360 | No duplicate record owner proven | Stakeholder profile and relationship context | Contacts and activities | Low | `/crm/contacts/[id]` |
| Stakeholder coverage | **KEEP** | Customers → Stakeholder Map | Customers | Contextual stakeholder views inside Account/Opportunity are not duplicates | Cross-account coverage and navigation | Contacts paging, account relationships | Low | `customers-workspace-client.tsx:64-142` |
| Campaign lifecycle and ROI | **KEEP** | Campaigns | Campaigns | None proven | Campaign register, spend and attribution | Campaign and opportunity attribution data | Medium | `/crm/campaigns` |
| Quotation overview and register | **KEEP** | Quotations | Quotations | Commercial embeds the same full operational component | Analytics, list/board register, exports and allowed quick actions | Quotation APIs | Medium | `commercial-workspace.tsx:123`; `quotations-client.tsx` |
| Commercial copy of Quotations register | **REDIRECT** | Commercial → Quotations | Quotations | Yes: exact `QuotationsClient` component | Retain a small quoted-value summary/card in Commercial | Navigation, saved Commercial tab URLs if any | Low | `commercial-workspace.tsx:4`, `:123` |
| Quotation lifecycle | **KEEP** | Quotation 360 | Quotation 360 | Approval/cancel duplicated in Commercial Queue; list also has shortcuts | Submit, approve, send, negotiate, accept/reject, revise, convert and immutable baseline | Quotation service, permissions, contracts | High | `crm-quotations.controller.ts:352-370`; `quotation.service.ts:116-170` |
| Quotation pricing | **KEEP** | `/crm/quotations/[id]/pricing` | Quotation 360 → Pricing | Commercial Pricing actually points to Tendering, not quote pricing | Quote-specific cost/sell build-up, margin, advice and internal print | Pricing view, quotation baseline | High | `quotation-360-client.tsx:87-105`, `:185`, `:401-440` |
| Quotation terms | **KEEP** | Quotation 360 Overview | Quotation 360 → Terms | None proven | Structured exclusions, payment, delivery and notes with lifecycle locking | `/terms` API and revision state | Medium | `quotation-360-client.tsx:478-568` |
| Quotation negotiation log | **MOVE** | Commercial → Negotiation | Quotation 360 → Negotiation | Not duplicated; currently misplaced | Customer asks, counters, concessions, comments, competitors and revision-linked price movement | Negotiation API/store, quotation revisions, permissions | High | `negotiation-tab.tsx:63`; `negotiation.controller.ts:46-91` |
| Quotation approval execution | **MOVE** | Commercial Decision Queue plus Quotation 360 | Quotation 360 → Approval | Same quotation status command exists in two workspaces | Preserve decision context, SoD, amount authority and baseline lock | Approval permissions, readiness policy, audit history | High | `commercial-decision-queue.tsx:80-102`; `quotation.service.ts:129-164` |
| Commercial decision prioritization | **KEEP** | Commercial → Decision Queue | Commercial Control Center → Decision Queue | My Work is a personal inbox, not a commercial portfolio queue | Ranking, readiness, value and risk visibility; open canonical record | Quotations, contracts, documents, requirements | Medium | `commercial-decision-queue.tsx:138-228` |
| Personal approval attention | **KEEP** | My Work → Approvals | My Work → Approvals | Not a record owner | Universal personal queue that opens source records | Inbox service, source links | Low | `approvals-reviews-workspace.tsx:85-96` |
| Quotation document context | **MOVE** | Commercial → Documents | Quotation 360 → Documents | Opportunity Governance has contextual documents, but for a different aggregate | Documents linked to one quote, readiness state and open-in-DMS actions | DMS, document requirements | High | `documents-tab.tsx`; `decision-readiness.tsx` |
| DMS access and sharing administration | **MOVE** | Commercial → Documents | Document Control / DMS | No second DMS owner should exist | Effective access, share, revoke and permission inspection | DMS authorization APIs | High | `documents-tab.tsx` POST/DELETE sharing calls |
| Commercial cross-deal overview | **KEEP** | Commercial → Overview | Commercial Control Center | KPIs partly repeat Financials/Margins | Portfolio totals, decision count, risk count and drill-down | Canonical commercial read model | Medium | `commercial-workspace.tsx:61-77`, `:98-109` |
| Commercial financial performance | **KEEP** | Commercial → Financials | Commercial Control Center → Financial Performance | Margins tab repeats part of it | Quoted, accepted, contracted, expected revenue and margin coverage | Canonical pricing/baseline aggregate API | High | `commercial-financials.tsx:32-60` |
| Commercial margins tab | **MERGE** | Commercial → Margins | Commercial → Financial Performance | Repeats Overview/Financials and lacks the correct pricing contract | Preserve useful conversion and margin signals | Pricing/baseline summary | Medium | `commercial-workspace.tsx:147-156` |
| Commercial risk monitoring | **KEEP** | Commercial → Risks | Commercial Control Center → Risks | No equivalent portfolio risk owner proven | Expiry, missing validity/cost/lines and stalled review | Canonical quote/pricing summaries, record drill-down | Medium | `commercial-financials.tsx:71-116` |
| Commercial approvals tab | **MERGE** | Commercial → Approvals | Commercial → Decision Queue | Both list `internal_review` quotations | Preserve count and direct links | Quote status, My Work personal queue | Low | `commercial-workspace.tsx:77`, `:136-145` |
| Commercial pricing tab | **MOVE** | Commercial → Pricing | Tendering for tender sheets; Quote 360 for quote pricing | Current tab is only a linked tender pricing table | Preserve pricing alerts and summary links in Commercial | Tendering and quotation pricing summaries | Medium | `commercial-workspace.tsx:125-133` |
| Commercial negotiation summary | **MERGE** | Not separately implemented | Commercial Overview / Risks | Detailed log moves to Quotation 360 | “Ball in our court”, open concession and exposure summaries | Negotiation summary read model | Medium | `negotiation.controller.ts:46-56` |
| Market Intelligence | **KEEP** | Market Intelligence | Market Intelligence | None proven | Reference catalogue and benchmarks | Catalogue data source | Low | `/crm/market-intelligence` |
| Sales report discovery | **KEEP** | `/crm/reports` is only a redirect | Reports | Current route has no catalog implementation | One grouped index of every report, register and print surface | Route metadata, permissions, report links | Medium | `reports/page.tsx:1-6` |
| Analytics report family | **MOVE** | Top-level Sales nav item | Reports → Executive / Pipeline / Revenue | Forecast shares presentation infrastructure, not report ownership | Performance, Sources & Margin, Executive analytics | Pipeline, source funnel and executive APIs | Low | `/crm/analytics?view=*`; `sales-insight-workspace.tsx:34` |
| Report calculations | **KEEP** | Existing domain/report endpoints | Existing report endpoints | Reports must not create a second calculation layer | Pipeline, forecast, executive and source-funnel read models | Domain APIs and authorization | Medium | Calls in `crm-pipeline-client.tsx` |
| Sales printable documents | **KEEP** | Account, Quotation and Pricing print routes | Source record owners; discoverable from Reports → Documents | No duplicate renderers proven | Account Register, Account Dossier, Client Quotation, Internal Pricing | Source records, print permissions | Low | `/crm/accounts/print`, `/crm/accounts/[id]/print`, `/crm/quotations/[id]/print`, `/crm/quotations/[id]/pricing/print` |

## Commercial ten-tab disposition

| Current tab | Decision | Target behavior |
|---|---|---|
| Overview | **KEEP** | Cross-deal KPIs, financial headline, risks and drill-downs only. |
| Decision Queue | **KEEP** | Prioritize decisions and show readiness; open Quotation 360 for the command. |
| Quotations | **REDIRECT** | Replace the embedded operational register with a summary and “Open Quotations”. |
| Pricing | **MOVE** | Tender sheets live in Tendering; quote sheets live in Quotation 360. Keep only portfolio signals/links. |
| Financials | **KEEP** | Rename to Financial Performance and connect to the canonical pricing/baseline read model. |
| Risks | **KEEP** | Keep cross-deal risk aggregation and add canonical record drill-down. |
| Negotiation | **MOVE** | Move the detailed log to Quotation 360; keep only portfolio negotiation exposure in Commercial. |
| Documents | **MOVE** | Quote context moves to Quotation 360; sharing/access administration remains DMS-owned. |
| Approvals | **MERGE** | Merge its list/count into Decision Queue. My Work keeps personal attention; Quote 360 executes. |
| Margins | **MERGE** | Merge into Financial Performance and Overview using canonical pricing data. |

### Target Commercial Control Center

```text
COMMERCIAL
├── Overview
├── Decision Queue
├── Risks
└── Financial Performance
```

Optional cards inside these four pages may link to Quotations, negotiation exposure, Tender pricing and document readiness. They do not become alternate owners.

## Opportunity target boundary

The current Opportunity 360 is already organized into six coherent work areas (`Overview`, `Strategy`, `Commercial`, `Engagement`, `Governance`, `History`). It does not need eleven literal top-level tabs to satisfy the proposed capability model.

Recommended mapping:

| Proposed capability | Existing placement | Decision |
|---|---|---|
| Overview + Qualification | Overview | **KEEP** |
| Stakeholders + Win Plan + Pursuit | Strategy | **KEEP** |
| Requirements + Scope + Estimate | Commercial → direct-sale Pre-Award | **KEEP** |
| Activities | Engagement | **KEEP** |
| Documents | Governance, contextual only | **KEEP** |
| Commercial Context | Commercial, linking to canonical quotations | **KEEP** |
| History | History | **KEEP** |

The component named `CommercialPanel` should eventually be renamed to `PreAwardPanel` or `EstimateAndPricingPanel`. It is an Opportunity-owned direct-sale pre-award workflow, not the Commercial Control Center.

## Quotation 360 target boundary

```text
QUOTATION 360
├── Overview
├── Pricing
├── Revisions
├── Terms
├── Negotiation
├── Approval
├── Documents
├── Activity
└── Client Print
```

The current implementation already owns Overview, Pricing, Revisions, Terms, Activity and all status transitions. Negotiation and quotation-document context are the two unique Commercial functions that must be moved here. Approval readiness and execution should also be made explicit here.

The full pricing page and internal pricing print remain dedicated sub-routes, but they are part of the Quotation capability. Opportunity pre-award pricing remains a different earlier-stage capability with explicit lineage into the quotation.

## Customers target boundary

```text
CUSTOMERS
├── Accounts
├── Contacts
└── Stakeholder Map

ACCOUNT 360  → canonical account record
CONTACT 360  → canonical contact record
```

Customers is already the correct shell. It renders the same `AccountsPortfolioClient` and `ContactsClient` as the legacy list routes and calls the same APIs. Therefore:

- Do not rebuild Accounts or Contacts.
- Make Customers the canonical list/search entry.
- Preserve `/crm/accounts/[id]`, `/crm/contacts/[id]` and all print/dossier routes.
- Convert only the two legacy list URLs into query-preserving redirects after links, tests and favorites are migrated.

## Reports target blueprint

```text
REPORTS
├── Executive
│   ├── Sales Overview
│   ├── Forecast
│   ├── Performance
│   └── Executive Analytics
├── Pipeline
│   ├── Radar
│   ├── Leads
│   ├── Opportunities
│   └── Activities
├── Customers
│   ├── Accounts
│   ├── Contacts
│   └── Stakeholder Coverage
├── Revenue
│   ├── Campaign ROI
│   ├── Quotations
│   ├── Margin
│   └── Commercial
└── Documents
    ├── Account Register
    ├── Account Dossier
    ├── Client Quotation
    └── Internal Pricing
```

Reports owns **discovery, grouping and read-only composition**. It does not own the calculations and does not execute source workflows. Each card either uses the existing canonical read component or opens the source report with the user's filter context.

## Required permission and governance corrections

1. **Negotiation permission:** `NegotiationController` exposes GET/POST/DELETE behavior but does not show the `@Permissions(...)` guards used by the quotation controller. Add explicit read/update/delete permissions aligned to quotation access before relocating the UI.
2. **Decision readiness:** decide whether missing required evidence blocks approval. If yes, enforce it in the quotation service. If no, require an auditable waiver reason. A warning beside an active Approve button is not a reliable policy boundary.
3. **Approval authority:** keep the existing server-side segregation of duties, amount authority and immutable baseline behavior.
4. **DMS ownership:** quotation and opportunity pages may display context, but document versioning, sharing, revocation and access policy remain DMS-owned.
5. **Commercial scope:** the Commercial page currently loads broad arrays of quotations, contracts, sheets and documents. Replace this with server-paged, tenant-scoped summary endpoints before the portfolio grows.

## Migration sequence

### Phase 0 — Contract tests and route inventory

- Capture current links, permissions and business actions for all ten Commercial tabs.
- Add tests proving canonical owners and preventing a second mutation surface.
- Record saved URLs and query parameters that redirects must preserve.

### Phase 1 — Close governance gaps

- Add negotiation permissions.
- Define and enforce approval-readiness policy.
- Create the canonical commercial pricing/baseline summary read model.

### Phase 2 — Strengthen canonical records

- Add Negotiation, Approval readiness and Documents context to Quotation 360.
- Keep DMS access administration in Document Control.
- Confirm Leads/Lead 360 preserve every currently used quick-capture and conversion case.

### Phase 3 — Remove duplicate execution surfaces

- Remove lead mutation columns/actions from Opportunities.
- Change Commercial Decision Queue actions to open Quotation 360.
- Replace Commercial's embedded Quotations register with a summary/link.
- Merge Commercial Approvals and Margins into Decision Queue and Financial Performance.

### Phase 4 — Normalize navigation and routes

- Add Activities and Reports to the primary Sales navigation.
- Move Analytics beneath Reports while keeping `/crm/analytics` stable.
- Redirect only the Accounts and Contacts list routes into Customers; preserve all 360 and print routes.

### Phase 5 — Build the report center

- Replace the `/crm/reports` redirect with the grouped catalog.
- Reuse canonical report components/endpoints.
- Apply permission-aware visibility and preserve filter context when opening source reports.

## Acceptance rules for the future implementation

The Sales architecture is complete only when all of the following are true:

- A user cannot execute the same high-risk business command from two independently maintained workspaces.
- Commercial can see and prioritize every commercial decision but opens the canonical record to execute it.
- Lead qualification and conversion have one official user journey.
- Customers is the official Accounts/Contacts list shell; record and print routes remain stable.
- Quotation 360 contains the quote's negotiation, terms, pricing, approval context, document context and revision history.
- Commercial margin KPIs reconcile with the quotation pricing/baseline source.
- Reports discovers all Sales reports without duplicating their calculations or mutations.
- Existing unique Negotiation and DMS behavior is preserved before old Commercial tabs are removed.
- Permissions, audit history, deep links, redirects, exports and print outputs have regression coverage.

## Final architecture decision

Adopt the proposed Sales IA with these canonical owners:

- **Lead** owns lead qualification and conversion.
- **Opportunity** owns the deal, pursuit and direct-sale pre-award package.
- **Tendering** owns tender-route estimate and pricing.
- **Quotation** owns quote pricing, terms, revisions, negotiation and approval execution.
- **DMS** owns document lifecycle and access policy.
- **Customers** owns Accounts/Contacts list discovery; Account 360 and Contact 360 own their records.
- **Commercial** owns cross-deal visibility, prioritization, risk and financial performance—not record execution.
- **My Work** owns personal attention—not source records or final authority.
- **Reports** owns discovery and read-only composition—not calculations or workflows.

This establishes one canonical owner per capability while preserving the legitimate need to surface the same information in multiple contexts.
