# User Experience Review

**Score: 6.3 / 10** — best-in-class where invested (CRM/Finance cockpits, modern IA), near-absent for delivery/field personas. Reviewed through 9 role lenses below.

## Global UX assessment

| Dimension | Rating | Notes |
|---|---|---|
| Navigation | 8/10 | SAP/Salesforce model: flat sidebar→workspace, workspace tab-row, ⌘K palette, ⌘J copilot, ⌘B hide sidebar, breadcrumbs. Genuinely modern. |
| Information architecture | 7/10 | Strong intent-based IA doctrine (memory: UX constitution); undermined where tabs lead to stub pages. |
| User flows | 6/10 | Commercial flows are complete and guided; delivery flows dead-end into thin UIs. |
| Clicks-to-task | 7/10 | Overview cockpits + command palette reduce clicks for common commercial tasks. |
| Learnability | 6/10 | Consistent design system helps; sheer module count + uneven depth confuses. |
| Productivity | 6/10 | High for sales/finance; low for engineers/technicians (no tools). |
| Consistency | 6/10 | Excellent within the 360-shell adopters; older/thin modules diverge. |
| Forms | 7/10 | Metadata-driven form engine (server-validated, AI fill/review), create-drawer + edit pattern. Strong foundation. |
| Tables | 6/10 | Hand-rolled; saved views exist; virtualization/perf at scale unverified. |
| Search | 7/10 | Real global search + command palette + recent items. |
| Filters | 6/10 | Saved-view pattern (per doctrine, queues = saved views not sidebar items). |
| Dashboards | 6/10 | Per-module cockpits (pipeline, portfolio, operations overview); no unified BI yet. |
| **Mobile** | **2/10** | Desktop-first; no field/PWA app. Critical miss for site/technician personas. |
| Empty/loading/error states | **3/10** | 0 `loading.tsx`, 0 `error.tsx`; only 1 `not-found`. Empty states are per-component, inconsistent. |

## Role-based walkthroughs

### CEO — 7/10
- **Has:** operations overview cockpit, sales overview, executive CRM, forecast/pipeline, per-module KPIs.
- **Wants:** a single cross-domain executive dashboard (cash position, backlog, project health, win rate) — exists in fragments, not unified. Analytics OS (planned) would close this.

### Sales Manager — 8/10 (best-served persona)
- **Has:** pipeline command center, account portfolio with health, forecast snapshots + slippage, quotations OS, my-day, deal briefs, at-risk deals with recommendations. This persona has a finished product.
- **Friction:** quotation pricing still has two engines; email/comms not fully in-app.

### Project Manager — 5/10
- **Has:** project backend depth (WBS/CBS/variations/schedules/cashflow), 5 pages.
- **Missing:** a PM cockpit — Gantt, earned-value, resource loading, RFI/submittal tracking, budget-vs-actual at a glance. The data exists; the workspace doesn't.

### Engineer — 3/10
- **Has:** 1 engineering page over 36 backend files.
- **Missing:** design register, drawing/submittal linkage, material take-off, technical query log. This persona sees a placeholder.

### Technician / Field — 1/10
- **Has:** essentially nothing built for the field. No mobile app, no work-order execution screen, no checklist/signoff, no offline.
- This is the **single largest UX gap** for an ELV/AMC business whose revenue depends on field service.

### Procurement Officer — 6/10
- **Has:** PR→RFQ→PO (7 pages), suppliers.
- **Missing:** 3-way match UI, supplier comparison/portal, spend analytics, approval inbox depth.

### Finance Officer — 8/10
- **Has:** 21 pages, GL, invoices, AP/AR, tax, budgets, period close, bank rec, PDCs.
- **Friction:** report pack / statements maturity; consolidation.

### Customer — 2/10
- **Missing:** no customer/client portal (view quotes, approve, track project, log service tickets, see invoices). A high-value differentiator that's absent.

### Admin — 8/10
- **Has:** rich Admin Center (memory: 22 screens) — users registry with enforced deactivation, security posture, module manager, approval matrices, feature flags, connectors, forms designer, numbering, settings. Strong.
- **Friction:** the AI-platform admin surface is new/uncommitted and unproven.

## Top UX friction points
1. **Depth cliff** — workspace tabs promise modules that render as stubs (Engineering, Doc Control, Site, HSE, Quality).
2. **No graceful states** — missing route-level loading/error boundaries; slow/failed API = blocked or broken page.
3. **No mobile/field surface** — excludes the personas who work outside an office.
4. **No customer portal** — the external relationship is entirely internal-facing.
5. **Full-page refresh on every mutation** — no optimistic UI; feels heavier than a modern SaaS.
6. **Two quotation pricing paths** — commercial confusion (documented, in-progress).

## Recommendations (ranked)
1. Build the **PM cockpit** and **Engineering workspace** (biggest persona value per effort — backends already exist).
2. Add **loading/error/empty state** primitives app-wide.
3. Ship a **field/technician PWA** for AMC/service work orders.
4. Add a **customer portal** (quotes, approvals, service tickets, invoices).
5. Unify the **executive dashboard** (Analytics OS).
6. Introduce **optimistic mutations** via a client data layer.
