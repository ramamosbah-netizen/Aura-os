# AURA OS — Per-Page UX Scorecard (Phase 2A, full sweep)

**Date:** 2026-08-15 · **Pages scored:** 173 · **Method:** static-signal analysis of each `page.tsx` **plus the client component(s) it imports** (1 level deep). This is a measured signal scan, not a hand-review of each screen — it reliably catches *structural* presence/absence (does the code import a loading primitive? call a transition endpoint? link to other records? use a breakpoint?) and is intentionally conservative. Treat 🟢 as "the pattern is present", 🔴 as "no trace of the pattern".

**Axes:** S Surface(discoverable in nav) · N Navigation/connectivity(internal links to related records) · C CRUD(create/edit writes) · W Workflow(state-transition endpoint calls) · D Detail/360(record page exists) · X States(loading+empty+error) · F Find(search/sort/paginate/saved-view) · M Mobile(🟢 real @media/useMediaQuery breakpoints · 🟠 fluid clamp()/minmax() only · 🔴 none).

**Caveats:** W/F/D show `—` where not applicable (e.g. workflow on a pure register, find on a detail page). X is generous (counts `catch`/`length===0`), so 🟠 there means "some handling", 🟢 means "explicit loading+empty+error primitives". M's 🟠 (fluid) means the grid reflows but there is no mobile-specific layout.

---

## Foundation status (P0-A) — updated 2026-08-15

The Phase-2C-thin UX foundation is **partially built and verified** (frontend-only; backend untouched; web package typecheck 0 errors, lint 0 errors on the new files). These primitives are the levers that move the debt axes below — but **scores move on _adoption_, not on existence**. As of this update **0 / 173 pages** have been migrated; ELV will be the first consumer.

| Debt axis (current 🔴/🟠) | Foundation primitive built | File | Moves the axis when a page… |
|---|---|---|---|
| **Find** (43🔴 + 64🟠) | `AuraDataTable` upgraded to operational register — URL-persisted state, pagination, faceted filters, column visibility, sort | [aura-data-table.tsx](../../apps/web/components/ui/aura-data-table.tsx) | replaces its bespoke `<table>` with `AuraDataTable` |
| **Mobile** (92🔴 + 68🟠) | Rows→cards responsive mode + `useMediaQuery`/`useIsMobile` hook | [aura-data-table.tsx](../../apps/web/components/ui/aura-data-table.tsx), [use-media-query.ts](../../apps/web/lib/use-media-query.ts) | renders via `AuraDataTable` or branches layout on `useIsMobile()` |
| **Connectivity** (93🔴) | `RelatedRecords` + `ActivityTimeline` (deep-linked) | [related-records.tsx](../../apps/web/components/ui/related-records.tsx) | adds a Related-records / History section to its 360 |
| **States** (153🟠) | Composed `<DataState loading empty error>` contract | [data-state.tsx](../../apps/web/components/ui/data-state.tsx) | wraps its data region in `<DataState>` |
| **Detail/360** (116🔴) | Shared record shell promoted `crm/record-shell` → [record.tsx](../../apps/web/components/ui/record.tsx) (every module, not just CRM) + `related`/`activity` props | [record.tsx](../../apps/web/components/ui/record.tsx) | composes `RecordShell` for its 360 |

### Foundation build log (each gated: static → unit → prod build → live browser)

| PR | What | Verification |
|---|---|---|
| **PR-01** `AuraDataTable` operational register + `DataState` + `RelatedRecords`/`ActivityTimeline` + `useMediaQuery` | ✅ **PASS** | 20 query-engine unit tests + prod build + **live prod browser**: search/sort/filter+URL, filter→page-1 reset, deep-link/refresh restore, mobile cards, empty/loading. Caught+fixed a real `next/headers` client-boundary bug the build missed → extracted `lib/data-error.ts`. |
| **PR-04** promote `crm/record-shell` → shared `ui/record.tsx` (+ `related`/`activity` integration; 5 CRM 360s untouched via re-export) | ✅ **PASS** (residual note) | typecheck/lint/48 tests/prod build + SSR-render of the full surface via the re-export path. Live hydration of project-nested routes flaky in the sandbox pane → primitives are unchanged production code, so risk covered. |
| **PR-05** Project Context — URL-derived, no stored state (kills URL↔state divergence) | ✅ **PASS** (residual note) | 15 scope unit tests + prod build + **live browser, 2 real projects**: init, deep-link/refresh restore, **divergence guard (URL id === server head id)**, **isolation (A→B no carryover)**, structured AI context, AI-dock transport captured on the wire. Setter-click not live-captured (project-route hydration flaky) → covered by `buildScopeUrl` tests. |

**Still pending in P0-A:** app-shell responsive audit (PR-02). Then PR-06 ELV (first real adopter of this foundation).

> **Honest delta note:** the only aggregate number that changed since the first sweep is **States 1🟢 → 9🟢**. This is *not* per-page adoption — it is a static-scan artifact: the ~9 pages that already import the `data-state` module now see all three state keywords because the new `DataState` wrapper was added to that same file. Real per-page State improvements will register only as pages wrap their content in `<DataState>`. Every other axis is unchanged, confirming no page has adopted the new register/connectivity primitives yet. This reinforces the report's standing caveat: **static score ≠ usability verdict** — acceptance is proven by real user-journey tests (see the Gap Register), not by the scan.

## Aggregate by axis (🟢 ok · 🟠 partial · 🔴 missing · — n/a)

| Axis | 🟢 | 🟠 | 🔴 | — |
|---|---|---|---|---|
| Surface (discoverable) | 157 | 9 | 7 | 0 |
| Navigation/connectivity | 58 | 22 | 93 | 0 |
| CRUD | 63 | 49 | 47 | 14 |
| Workflow | 16 | 25 | 0 | 132 |
| Detail/360 | 43 | 0 | 116 | 14 |
| States (load/empty/err) | 9 | 153 | 11 | 0 |
| Find (search/sort/page) | 29 | 64 | 43 | 37 |
| Mobile/responsive | 13 | 68 | 92 | 0 |

## Interpretation — where the UX debt concentrates

1. **Connectivity is the #1 debt (93🔴 of 173).** Most pages carry <2 internal links to related records — the "everything is connected" vision is the weakest axis. Fix: cross-link records (NCR→drawing, certificate→contract, message→object).
2. **Detail/360 largely absent (116🔴).** Many registers have no record page. Some legitimately (config/dashboards), many should (engineering RFI/submittal/TQ, subcontract, incident).
3. **States near-universally partial (153🟠, only 9🟢).** Empty/error handled, but explicit loading skeletons almost never — adopt `skeleton`/`page-loading` + `error-state` consistently.
4. **Find weak on registers (43🔴 + 64🟠).** Search/sort/pagination missing despite `/paged` endpoints — the single `aura-data-table` adoption fixes this class.
5. **Mobile: real responsiveness almost nonexistent (13🟢 breakpoint · 68🟠 fluid-only · 92🔴).** Blocks field use (Site/Quality/HSE).
6. **Surface strong (157🟢), workflow solid where present (16🟢+25🟠, 0🔴).** Discoverability and transition-wiring are the healthy axes — confirming the platform's Level-1/2 strength; the work is Level-3 UX.

**7 non-discoverable pages** (S🔴): `/login` (correct), and 6 real gaps reachable only via a parent hub link — `/hse/permits`, `/site/execution`, `/doccontrol/register`, `/doccontrol/transmittals`, `/assets/register`, `/tendering/pricing` — these are built workflow pages missing a top-nav entry.

## Full per-page scorecard


### admin

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/admin` | register/page | 🟢 | 🟢 | 🔴 | — | 🔴 | 🟠 | 🟠 | 🟠 |
| `/admin/access` | register/page | 🟢 | 🟢 | 🟠 | — | 🔴 | 🟠 | 🟠 | 🟠 |
| `/admin/ai` | register/page | 🟢 | 🟢 | 🟠 | 🟢 | 🔴 | 🟠 | 🟠 | 🟠 |
| `/admin/approval-matrix` | register/page | 🟢 | 🟢 | 🟠 | — | 🔴 | 🟠 | 🟢 | 🟠 |
| `/admin/audit` | register/page | 🟢 | 🟠 | 🔴 | — | 🔴 | 🟠 | 🟢 | 🔴 |
| `/admin/calendar` | register/page | 🟢 | 🟢 | 🟠 | — | 🔴 | 🟠 | 🟢 | 🟠 |
| `/admin/connectors` | register/page | 🟢 | 🟢 | 🟢 | — | 🔴 | 🟠 | 🟠 | 🟠 |
| `/admin/data` | register/page | 🟢 | 🟢 | 🟠 | — | 🔴 | 🟠 | 🟠 | 🟠 |
| `/admin/feature-flags` | register/page | 🟢 | 🟢 | 🟠 | — | 🔴 | 🟠 | 🟠 | 🟠 |
| `/admin/forms` | register/page | 🟢 | 🟢 | 🟢 | — | 🔴 | 🟠 | 🟠 | 🟠 |
| `/admin/health` | register/page | 🟢 | 🟢 | 🔴 | — | 🔴 | 🟠 | 🟠 | 🟠 |
| `/admin/intelligence` | register/page | 🟢 | 🔴 | 🟠 | — | 🔴 | 🟠 | 🟠 | 🟠 |
| `/admin/module-settings` | register/page | 🟢 | 🟢 | 🟠 | — | 🔴 | 🟠 | 🟠 | 🟠 |
| `/admin/modules` | register/page | 🟢 | 🟢 | 🟠 | — | 🔴 | 🟠 | 🟠 | 🟠 |
| `/admin/notifications` | register/page | 🟢 | 🟢 | 🟠 | — | 🔴 | 🟠 | 🟠 | 🟠 |
| `/admin/numbering` | register/page | 🟢 | 🟢 | 🟠 | — | 🔴 | 🟠 | 🟠 | 🟠 |
| `/admin/organization` | register/page | 🟢 | 🟢 | 🟠 | — | 🔴 | 🟠 | 🟠 | 🟠 |
| `/admin/security` | register/page | 🟢 | 🟢 | 🟠 | — | 🔴 | 🟠 | 🟠 | 🟠 |
| `/admin/settings` | register/page | 🟢 | 🟢 | 🟢 | — | 🔴 | 🟠 | 🟢 | 🟠 |
| `/admin/templates` | register/page | 🟢 | 🔴 | 🟢 | — | 🔴 | 🟠 | 🟠 | 🟠 |
| `/admin/users` | register/page | 🟢 | 🟢 | 🟢 | — | 🔴 | 🟠 | 🟠 | 🟠 |
| `/admin/webhooks` | register/page | 🟢 | 🟢 | 🟢 | — | 🔴 | 🟠 | 🟠 | 🟠 |
| `/admin/workflows` | register/page | 🟢 | 🟢 | 🔴 | — | 🔴 | 🟠 | 🟠 | 🟠 |
| `/admin/workspace` | register/page | 🟢 | 🔴 | 🟢 | — | 🔴 | 🟠 | 🟠 | 🔴 |

### ai

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/ai` | register/page | 🟢 | 🟢 | 🟠 | — | 🔴 | 🟠 | 🟠 | 🟠 |

### amc

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/amc` | register/page | 🟢 | 🔴 | 🟠 | — | 🟢 | 🟠 | 🟠 | 🟠 |
| `/amc/dispatch` | register/page | 🟢 | 🔴 | 🟠 | 🟢 | 🔴 | 🟠 | 🟠 | 🟠 |
| `/amc/ppm` | register/page | 🟢 | 🔴 | 🟠 | — | 🔴 | 🟠 | 🔴 | 🔴 |
| `/amc/work-orders` | register/page | 🟢 | 🟢 | 🔴 | — | 🟢 | 🟢 | 🟢 | 🔴 |
| `/amc/work-orders/[id]` | detail | 🟢 | 🟢 | 🟠 | — | 🟢 | 🟠 | — | 🔴 |

### assets

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/assets/control` | register/page | 🟢 | 🔴 | 🟢 | 🟠 | 🔴 | 🟠 | 🟠 | 🔴 |
| `/assets/depreciation` | register/page | 🟢 | 🔴 | 🔴 | — | 🔴 | 🟠 | 🔴 | 🔴 |
| `/assets/disposals` | register/page | 🟢 | 🔴 | 🟠 | — | 🔴 | 🟠 | 🔴 | 🔴 |
| `/assets/register` | register/page | 🔴 | 🟢 | 🔴 | — | 🟢 | 🟢 | 🟢 | 🔴 |
| `/assets/register/[id]` | detail | 🟠 | 🟢 | 🔴 | — | 🟢 | 🟠 | — | 🔴 |

### commissioning

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/commissioning` | register/page | 🟢 | 🔴 | 🔴 | — | 🟢 | 🟠 | 🟢 | 🟠 |
| `/commissioning/[id]` | detail | 🟢 | 🟠 | 🟢 | 🟠 | 🟢 | 🟠 | — | 🔴 |

### compliance

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/compliance` | register/page | 🟢 | 🔴 | 🟠 | — | 🔴 | 🟠 | 🟢 | 🟠 |

### contracts

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/contracts/certificates` | register/page | 🟢 | 🟢 | 🟢 | 🟠 | 🔴 | 🟠 | 🔴 | 🔴 |
| `/contracts/certificates/[id]/print` | print | 🟢 | 🔴 | — | — | — | 🟠 | — | 🟢 |
| `/contracts/clauses` | register/page | 🟢 | 🔴 | 🟢 | — | 🔴 | 🟠 | 🟢 | 🔴 |
| `/contracts/contracts` | register/page | 🟢 | 🟢 | 🟢 | 🟠 | 🟢 | 🟢 | 🟠 | 🟠 |
| `/contracts/contracts/[id]` | detail | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟠 | — | 🔴 |
| `/contracts/contracts/[id]/print` | print | 🟢 | 🔴 | — | — | — | 🟠 | — | 🟢 |

### crm

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/crm/accounts` | register/page | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟢 | 🟢 | 🟠 |
| `/crm/accounts/[id]` | detail | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟠 | — | 🟠 |
| `/crm/accounts/[id]/print` | print | 🟢 | 🔴 | — | — | — | 🟠 | — | 🟢 |
| `/crm/accounts/print` | print | 🟢 | 🔴 | — | — | — | 🔴 | — | 🟢 |
| `/crm/activities` | register/page | 🟢 | 🔴 | 🟠 | — | 🔴 | 🟠 | 🟢 | 🟠 |
| `/crm/campaigns` | register/page | 🟢 | 🔴 | 🟢 | — | 🔴 | 🟠 | 🔴 | 🟠 |
| `/crm/commercial` | register/page | 🟢 | 🟢 | 🔴 | — | 🔴 | 🟠 | 🟠 | 🟠 |
| `/crm/contacts` | register/page | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟠 | 🟠 | 🟠 |
| `/crm/contacts/[id]` | detail | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟠 | — | 🟠 |
| `/crm/leads` | register/page | 🟢 | 🟢 | 🟠 | — | 🟢 | 🟠 | 🟠 | 🟠 |
| `/crm/leads/[id]` | detail | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟠 | — | 🔴 |
| `/crm/market-intelligence` | register/page | 🟢 | 🔴 | 🟠 | — | 🔴 | 🟠 | 🟠 | 🔴 |
| `/crm/my-day` | register/page | 🟢 | 🟢 | 🟢 | — | 🔴 | 🟢 | 🟢 | 🟠 |
| `/crm/opportunities/[id]` | detail | 🟠 | 🟢 | 🟢 | 🟢 | 🟢 | 🟠 | — | 🟠 |
| `/crm/overview` | register/page | 🟢 | 🟢 | 🔴 | — | 🔴 | 🟠 | 🟢 | 🟠 |
| `/crm/quotations` | register/page | 🟢 | 🟢 | 🔴 | — | 🟢 | 🟢 | 🟢 | 🟠 |
| `/crm/quotations/[id]` | detail | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟠 | — | 🔴 |
| `/crm/quotations/[id]/pricing` | detail | 🟢 | 🟢 | 🟢 | 🟠 | 🟢 | 🟠 | — | 🟠 |
| `/crm/quotations/[id]/pricing/print` | print | 🟢 | 🔴 | — | — | — | 🔴 | — | 🔴 |
| `/crm/quotations/[id]/print` | print | 🟢 | 🔴 | — | — | — | 🟠 | — | 🟢 |

### doccontrol

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/doccontrol/register` | register/page | 🔴 | 🟢 | 🔴 | — | 🟢 | 🟠 | 🟠 | 🔴 |
| `/doccontrol/register/[id]` | detail | 🟠 | 🟠 | 🟠 | — | 🟢 | 🟠 | — | 🔴 |
| `/doccontrol/submittals` | register/page | 🟢 | 🔴 | 🟢 | 🟠 | 🔴 | 🟠 | 🟠 | 🔴 |
| `/doccontrol/transmittals` | register/page | 🔴 | 🟠 | 🔴 | — | 🔴 | 🟠 | 🟠 | 🔴 |

### documents

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/documents` | register/page | 🟢 | 🟠 | 🔴 | — | 🔴 | 🟠 | 🔴 | 🔴 |
| `/documents/control` | register/page | 🟢 | 🔴 | 🟢 | 🟢 | 🔴 | 🟠 | 🔴 | 🟠 |

### engineering

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/engineering` | register/page | 🟢 | 🟠 | 🟢 | 🟠 | 🟢 | 🟠 | 🟢 | 🟠 |
| `/engineering/drawings` | register/page | 🟢 | 🟢 | 🔴 | — | 🟢 | 🟠 | 🟠 | 🔴 |
| `/engineering/drawings/[id]` | detail | 🟢 | 🟢 | 🟠 | — | 🟢 | 🟠 | — | 🔴 |

### events

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/events` | register/page | 🟢 | 🟠 | 🔴 | — | 🔴 | 🟠 | 🔴 | 🔴 |

### finance

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/finance/ap-aging` | register/page | 🟢 | 🟠 | 🔴 | — | 🔴 | 🟠 | 🔴 | 🔴 |
| `/finance/ar-aging` | register/page | 🟢 | 🟠 | 🔴 | — | 🔴 | 🟠 | 🔴 | 🔴 |
| `/finance/bank-guarantees` | register/page | 🟢 | 🔴 | 🟢 | 🟠 | 🔴 | 🟠 | 🟢 | 🔴 |
| `/finance/bank-reconciliation` | register/page | 🟢 | 🔴 | 🟠 | — | 🔴 | 🟠 | 🟠 | 🔴 |
| `/finance/budgets` | register/page | 🟢 | 🔴 | 🟠 | — | 🔴 | 🟠 | 🟠 | 🔴 |
| `/finance/consolidation` | register/page | 🟢 | 🔴 | 🔴 | — | 🔴 | 🟠 | 🔴 | 🔴 |
| `/finance/customer-invoices` | register/page | 🟢 | 🟠 | 🟠 | — | 🔴 | 🟠 | 🟢 | 🔴 |
| `/finance/customer-invoices/[id]/print` | print | 🟢 | 🔴 | — | — | — | 🟠 | — | 🟢 |
| `/finance/dashboard` | register/page | 🟢 | 🔴 | 🔴 | — | 🔴 | 🔴 | 🔴 | 🟠 |
| `/finance/fx` | register/page | 🟢 | 🔴 | 🟠 | — | 🔴 | 🟠 | 🔴 | 🔴 |
| `/finance/invoices` | register/page | 🟢 | 🟢 | 🟢 | 🟠 | 🟢 | 🟢 | 🟠 | 🟠 |
| `/finance/invoices/[id]` | detail | 🟢 | 🔴 | 🔴 | 🟠 | 🟢 | 🟠 | — | 🟠 |
| `/finance/ledger` | register/page | 🟢 | 🔴 | 🟠 | — | 🔴 | 🟠 | 🟠 | 🟠 |
| `/finance/period-close` | register/page | 🟢 | 🔴 | 🟠 | 🟢 | 🔴 | 🟠 | 🔴 | 🔴 |
| `/finance/petty-cash` | register/page | 🟢 | 🔴 | 🟠 | — | 🔴 | 🟠 | 🟠 | 🔴 |
| `/finance/post-dated-cheques` | register/page | 🟢 | 🔴 | 🟢 | 🟠 | 🔴 | 🟠 | 🟢 | 🔴 |
| `/finance/revenue-recognition` | register/page | 🟢 | 🔴 | 🔴 | — | 🔴 | 🟠 | 🔴 | 🔴 |
| `/finance/statements` | register/page | 🟢 | 🟠 | 🔴 | — | 🔴 | 🔴 | 🔴 | 🔴 |
| `/finance/statements/print` | print | 🟢 | 🔴 | — | — | — | 🟠 | — | 🟢 |
| `/finance/tax` | register/page | 🟢 | 🔴 | 🟠 | — | 🔴 | 🟠 | 🔴 | 🟠 |
| `/finance/vat-returns` | register/page | 🟢 | 🔴 | 🟢 | 🟠 | 🔴 | 🟠 | 🔴 | 🔴 |

### fleet

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/fleet/control` | register/page | 🟢 | 🔴 | 🟢 | 🟠 | 🔴 | 🟠 | 🟠 | 🟠 |
| `/fleet/fines` | register/page | 🟢 | 🔴 | 🟢 | — | 🔴 | 🟠 | 🟠 | 🔴 |
| `/fleet/salik` | register/page | 🟢 | 🔴 | 🟢 | — | 🔴 | 🟠 | 🟠 | 🔴 |

### handover

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/handover` | register/page | 🟢 | 🟠 | 🔴 | 🟢 | 🔴 | 🟠 | 🟢 | 🟠 |
| `/handover/[id]/print` | print | 🟢 | 🔴 | — | — | — | 🟠 | — | 🟢 |

### home

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/` | register/page | 🟢 | 🟠 | 🔴 | — | 🟢 | 🔴 | 🟠 | 🔴 |

### hr

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/hr/appraisals` | register/page | 🟢 | 🔴 | 🟢 | — | 🔴 | 🟠 | 🟠 | 🔴 |
| `/hr/attendance` | register/page | 🟢 | 🔴 | 🟢 | — | 🔴 | 🟠 | 🟠 | 🔴 |
| `/hr/control` | register/page | 🟢 | 🔴 | 🟢 | 🟢 | 🔴 | 🟠 | 🔴 | 🔴 |
| `/hr/dashboard` | register/page | 🟢 | 🔴 | 🔴 | — | 🔴 | 🔴 | 🔴 | 🟠 |
| `/hr/document-expiry` | register/page | 🟢 | 🔴 | 🔴 | — | 🔴 | 🟠 | 🔴 | 🔴 |
| `/hr/eosb` | register/page | 🟢 | 🔴 | 🟠 | — | 🔴 | 🟠 | 🔴 | 🔴 |
| `/hr/expense-claims` | register/page | 🟢 | 🔴 | 🟠 | — | 🔴 | 🟠 | 🟠 | 🔴 |
| `/hr/payroll/[id]/print` | print | 🟠 | 🔴 | — | — | — | 🟠 | — | 🟢 |
| `/hr/staff-advances` | register/page | 🟢 | 🔴 | 🟠 | — | 🔴 | 🟠 | 🟠 | 🔴 |
| `/hr/timesheets` | register/page | 🟢 | 🔴 | 🟠 | — | 🔴 | 🟠 | 🔴 | 🔴 |

### hse

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/hse/control` | register/page | 🟢 | 🟠 | 🟢 | 🟢 | 🔴 | 🟠 | 🟠 | 🟠 |
| `/hse/permits` | register/page | 🔴 | 🟢 | 🔴 | — | 🟢 | 🟢 | 🟢 | 🔴 |
| `/hse/permits/[id]` | detail | 🟠 | 🟢 | 🟢 | — | 🟢 | 🟠 | — | 🔴 |
| `/hse/risk-assessments` | register/page | 🟢 | 🔴 | 🟢 | 🟠 | 🔴 | 🟠 | 🟢 | 🔴 |
| `/hse/toolbox-talks` | register/page | 🟢 | 🔴 | 🟠 | — | 🔴 | 🟠 | 🟠 | 🔴 |

### inbox

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/inbox` | register/page | 🟢 | 🔴 | 🔴 | — | 🔴 | 🔴 | 🔴 | 🔴 |

### intelligence

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/intelligence` | register/page | 🟢 | 🔴 | 🟠 | — | 🔴 | 🟠 | 🔴 | 🔴 |

### inventory

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/inventory/dashboard` | register/page | 🟢 | 🔴 | 🔴 | — | 🔴 | 🔴 | 🔴 | 🟠 |
| `/inventory/grns` | register/page | 🟢 | 🔴 | 🟠 | — | 🔴 | 🟠 | 🔴 | 🔴 |
| `/inventory/grns/[id]/print` | print | 🟢 | 🔴 | — | — | — | 🟠 | — | 🟢 |
| `/inventory/locations` | register/page | 🟢 | 🔴 | 🟢 | — | 🔴 | 🟠 | 🟠 | 🟠 |
| `/inventory/serials` | register/page | 🟢 | 🔴 | 🔴 | 🟠 | 🔴 | 🟠 | 🟠 | 🟠 |
| `/inventory/stock` | register/page | 🟢 | 🔴 | 🟢 | — | 🔴 | 🟠 | 🟠 | 🔴 |
| `/inventory/transfers` | register/page | 🟢 | 🔴 | 🟠 | — | 🔴 | 🟠 | 🔴 | 🔴 |
| `/inventory/valuation` | register/page | 🟢 | 🔴 | 🔴 | — | 🔴 | 🟠 | 🔴 | 🔴 |

### login

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/login` | register/page | 🔴 | 🔴 | 🟠 | — | 🔴 | 🟠 | 🔴 | 🔴 |

### notifications

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/notifications` | register/page | 🟢 | 🔴 | 🔴 | — | 🔴 | 🔴 | 🔴 | 🔴 |

### operations

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/operations/overview` | register/page | 🟢 | 🟢 | 🔴 | — | 🔴 | 🟠 | 🟢 | 🟠 |

### procurement

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/procurement/dashboard` | register/page | 🟢 | 🔴 | 🔴 | — | 🔴 | 🟠 | 🟠 | 🟠 |
| `/procurement/purchase-orders` | register/page | 🟢 | 🟢 | 🟢 | 🟠 | 🟢 | 🟠 | 🔴 | 🔴 |
| `/procurement/purchase-orders/[id]` | detail | 🟢 | 🔴 | 🔴 | 🟠 | 🟢 | 🟠 | — | 🟠 |
| `/procurement/purchase-orders/[id]/print` | print | 🟢 | 🔴 | — | — | — | 🟠 | — | 🟢 |
| `/procurement/purchase-requests` | register/page | 🟢 | 🔴 | 🟢 | 🟠 | 🔴 | 🟠 | 🔴 | 🟠 |
| `/procurement/rfqs` | register/page | 🟢 | 🔴 | 🟢 | 🟠 | 🔴 | 🟠 | 🔴 | 🔴 |
| `/procurement/spend-analytics` | register/page | 🟢 | 🟠 | 🔴 | — | 🔴 | 🟠 | 🔴 | 🟠 |
| `/procurement/suppliers` | register/page | 🟢 | 🔴 | 🟢 | 🟠 | 🔴 | 🟠 | 🟠 | 🔴 |
| `/procurement/three-way-match` | register/page | 🟢 | 🟢 | 🔴 | — | 🔴 | 🟠 | 🟠 | 🟠 |

### project

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/project/[projectId]` | detail | 🟠 | 🟢 | 🔴 | — | 🟢 | 🟠 | — | 🟠 |
| `/project/[projectId]/[area]` | detail | 🟠 | 🟠 | 🔴 | — | 🟢 | 🟠 | — | 🔴 |
| `/project/[projectId]/team` | detail | 🟠 | 🔴 | 🟠 | — | 🟢 | 🟠 | — | 🔴 |

### projects

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/projects/closeout` | register/page | 🟢 | 🔴 | 🟠 | — | 🔴 | 🟠 | 🔴 | 🟠 |
| `/projects/dashboard` | register/page | 🟢 | 🟢 | 🔴 | — | 🔴 | 🟠 | 🟠 | 🟠 |
| `/projects/projects` | register/page | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟠 |
| `/projects/projects/[id]` | detail | 🟢 | 🟢 | 🔴 | 🟢 | 🟢 | 🟠 | — | 🔴 |
| `/projects/schedule` | register/page | 🟢 | 🔴 | 🟠 | — | 🔴 | 🟠 | 🟠 | 🔴 |
| `/projects/variations` | register/page | 🟢 | 🔴 | 🟢 | 🟠 | 🔴 | 🟠 | 🔴 | 🔴 |

### quality

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/quality/calibrations` | register/page | 🟢 | 🔴 | 🟠 | — | 🔴 | 🟠 | 🟢 | 🔴 |
| `/quality/control` | register/page | 🟢 | 🔴 | 🟢 | 🟢 | 🔴 | 🟠 | 🔴 | 🔴 |
| `/quality/inspection-requests` | register/page | 🟢 | 🔴 | 🟢 | 🟠 | 🔴 | 🟠 | 🟢 | 🔴 |
| `/quality/itps` | register/page | 🟢 | 🔴 | 🟢 | — | 🔴 | 🟠 | 🟠 | 🔴 |
| `/quality/material-approvals` | register/page | 🟢 | 🔴 | 🟢 | — | 🔴 | 🟠 | 🔴 | 🔴 |
| `/quality/ncrs` | register/page | 🟢 | 🟠 | 🟠 | — | 🟢 | 🟠 | 🟢 | 🔴 |
| `/quality/ncrs/[id]` | detail | 🟢 | 🟠 | 🟠 | — | 🟢 | 🟠 | — | 🔴 |
| `/quality/snags` | register/page | 🟢 | 🔴 | 🟢 | — | 🔴 | 🟠 | 🟢 | 🔴 |

### search

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/search` | register/page | 🟢 | 🔴 | 🔴 | — | 🔴 | 🔴 | 🔴 | 🔴 |

### site

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/site/control` | register/page | 🟢 | 🔴 | 🟢 | 🟢 | 🔴 | 🟠 | 🔴 | 🔴 |
| `/site/daily-reports` | register/page | 🟢 | 🟠 | 🟢 | 🟠 | 🔴 | 🟠 | 🟢 | 🔴 |
| `/site/daily-reports/[id]/print` | print | 🟢 | 🔴 | — | — | — | 🟠 | — | 🟢 |
| `/site/execution` | register/page | 🔴 | 🟠 | 🔴 | — | 🟢 | 🟠 | 🟢 | 🟠 |
| `/site/execution/[id]` | detail | 🟠 | 🟠 | 🟠 | — | 🟢 | 🟠 | — | 🟠 |
| `/site/instructions` | register/page | 🟢 | 🔴 | 🟢 | — | 🔴 | 🟠 | 🟠 | 🔴 |

### subcontracts

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/subcontracts/back-charges` | register/page | 🟢 | 🔴 | 🟢 | 🟠 | 🔴 | 🟠 | 🟠 | 🔴 |
| `/subcontracts/claims` | register/page | 🟢 | 🔴 | 🟢 | — | 🔴 | 🟠 | 🟠 | 🔴 |
| `/subcontracts/subcontracts` | register/page | 🟢 | 🔴 | 🟢 | 🟢 | 🔴 | 🟠 | 🟠 | 🔴 |
| `/subcontracts/subcontracts/[id]/print` | print | 🟢 | 🔴 | — | — | — | 🟠 | — | 🟢 |
| `/subcontracts/variations` | register/page | 🟢 | 🔴 | 🟢 | — | 🔴 | 🟠 | 🟠 | 🔴 |

### tendering

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/tendering/pricing` | register/page | 🔴 | 🟢 | 🔴 | — | 🔴 | 🟠 | 🔴 | 🔴 |
| `/tendering/tenders` | register/page | 🟢 | 🟢 | 🟢 | 🟠 | 🟢 | 🟠 | 🟠 | 🟠 |
| `/tendering/tenders/[id]` | detail | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 | 🟠 | — | 🔴 |
| `/tendering/tenders/[id]/pricing` | detail | 🟢 | 🟢 | 🟢 | — | 🟢 | 🟠 | — | 🔴 |

### views

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/views` | register/page | 🟢 | 🔴 | 🔴 | — | 🔴 | 🔴 | 🔴 | 🔴 |

### workspace

| Route | Kind | S | N | C | W | D | X | F | M |
|---|---|---|---|---|---|---|---|---|---|
| `/workspace` | register/page | 🟢 | 🟠 | 🟢 | — | 🔴 | 🟠 | 🟠 | 🔴 |
