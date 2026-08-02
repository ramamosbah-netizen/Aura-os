# AURA OS — Experience Architecture Document (L5 Redesign)

**Date:** 2026-07-27
**Author role:** CPO / Principal UX Architect
**Scope:** Experience Layer only — Information Architecture, navigation, workspaces, discoverability. **Zero** backend / API / schema / domain / permission / workflow changes.
**Status:** Proposal for approval. **No production code has been written.**

> **Golden rule honored:** every page, route, workflow, and permission that exists today stays exactly where it is and keeps working. This document *reorganizes the way users enter and move through the system*; it does not touch what the system does. Every workspace below is a **navigation container** over pages that already exist — never a new home, never a duplicated capability. This extends the already-locked internal doctrine (`docs/reports/…` UX doctrine: *Workspace = nav container, not a page type; 3 page types only — Entity 360 / Operational / Queue*) from CRM to the whole platform.

---

## 0. Ground truth (what actually exists today)

Measured from `apps/web/components/nav.ts` (the single source of truth for the sidebar + command palette) and the 131 `page.tsx` routes.

**Current sidebar = 6 groups, ~86 permanent items:**

| Group | Items | What it really is |
|---|---:|---|
| **Workspace** | 2 | My Work (`/`), My Workspace (`/workspace`) |
| **CRM** | 7 | My Day, Accounts, Contacts, Sales Pipeline, Commercial, Market Intelligence, Activities |
| **Deal chain** | 7 | Tenders, Contracts, Projects, Projects Dashboard, Variations, Schedule, Payment Certificates |
| **Operate** | **54** | Procurement (5) · Inventory (5) · Engineering (1) · Site (2) · HSE (2) · Quality (3) · HR (7) · Fleet (3) · Assets (2) · AMC (2) · Subcontracts (3) · **Finance (15+)** — all flat, one list |
| **Intelligence** | 2 | Insights (`/intelligence`), Intelligence Console (`/admin/intelligence`) |
| **Platform** | 14 | Documents, Doc Control, Submittals, Templates, Admin Center + 9 admin pages, Events |

**Infrastructure that already exists and should be reused (do not rebuild):**

- `nav.ts` — one source of truth for sidebar **and** ⌘K palette; they never drift.
- `GROUP_SUITE` + `visibleNav(allowedSuites)` — **role-based nav gating already works** (groups gate on `suite.*` functions). Personalization has a backbone.
- **Global search** (`/search`) + **⌘K command palette** with `CREATE_ACTIONS` — search-before-browsing is partially wired.
- **`/workspace`** hub (chat, mail, approvals inbox, notifications, saved views, search — one page), **`/inbox`**, **`/notifications`**, **`/views`** (saved views).
- **Record tabs shell** — opening a record already surfaces an application tab (e.g. `OPPORTUNITY · AL dar Abudhabi ✕`, `TENDER · … ✕`). The browser-like model is *started*, not finished.
- **Entity 360 pages** already follow one record-shell design system (Opportunity 360, Tender 360, Account 360…).
- **Per-workspace overview pattern** already proven (My Day, pipeline command centers, 5 standalone dashboards).

The redesign is therefore **mostly a re-grouping + a few new overview containers**, not new machinery.

---

## 1. Current UX Audit

### 1.1 Navigation problems

| # | Problem | Evidence | Impact |
|---|---|---|---|
| P1 | **The sidebar is a page directory, not a navigator.** ~86 permanent links. | `nav.ts` `Operate` = 54 flat items. | New user cannot form a mental model; scrolling replaces thinking. |
| P2 | **The "Operate" group is a dumping ground.** It contains 11 unrelated domains *plus all of Finance*. | Procurement→Inventory→Engineering→HSE→HR→Fleet→**Finance** in one list. | Finance has **no home**; a QS and an accountant share the same 54-item scroll. |
| P3 | **Finance is homeless and split.** 15+ finance pages live inside "Operate"; "Finance Dashboard" sits mid-list. | `nav.ts` lines 91–111. | The single most permission-sensitive domain is the hardest to find. |
| P4 | **Dashboards are top-level destinations, not overviews.** 5 standalone `*/dashboard` items. | Projects/Procurement/Inventory/HR/Finance Dashboard all in the sidebar. | A dashboard competes with its own module for a click; no single "front door" per area. |
| P5 | **AI is scattered across ≥4 destinations.** `/intelligence`, `/admin/intelligence`, `/ai`, `/admin/ai`. | Two nav items + two admin pages. | AI feels like a place you *go*, not a capability that *travels with you*. |
| P6 | **"Deal chain" mixes two human jobs.** Selling (Tenders) and Delivering (Contracts/Projects/Certificates) share one group. | `nav.ts` `Deal chain`. | The seller and the project manager navigate through each other's noise. |
| P7 | **No stable "front doors."** Home / Inbox / Search are not a fixed top band; they're mixed into "Workspace". | `Workspace` group = My Work + My Workspace only. | The three things every user needs constantly aren't where the eye rests first. |

### 1.2 Duplicate / overlapping concepts (naming only — no functional duplication to remove)

- **"My Work" (`/`) vs "My Workspace" (`/workspace`) vs "My Day" (`/crm/my-day`)** — three personal landing surfaces with unclear division. (Keep all; clarify roles — see §4.)
- **Five "Dashboard" pages vs a workspace Overview** — same intent (a front door), two patterns.
- **"Intelligence / Insights / Console / AI"** — four names for the AI surface.
- **"Commercial" (`/crm/commercial`) vs "Quotations" vs "Pricing"** — already consolidated internally; just needs consistent labeling in nav.

### 1.3 Confusing workflows (friction, not breakage)

- Finding an **invoice** requires knowing it lives under "Operate" between "AMC" and "Subcontracts."
- A **project manager** starting their day has no single surface; they hit "Projects Dashboard," then "Projects," then "Schedule," then "Site Control," then "Variations" — 4+ sidebar trips.
- **Cross-object journeys** (Opportunity → Tender → Contract → Project) already work as links inside records, but the sidebar offers no matching mental grouping, so users lose the thread when they navigate by sidebar instead of by record.

### 1.4 User friction points (summary)

1. Too many permanent choices (Hick's Law) → slow first task.
2. No role-shaped default → everyone sees everything.
3. Context loss when jumping modules (tabs shell exists but isn't the default path).
4. AI is opt-in and out-of-the-way instead of ambient.

---

## 2. Information Architecture Proposal

**Model:** the sidebar carries **8 permanent destinations** (4 personal front doors + 7 workspaces + admin). Every one of the ~86 current items becomes a page **inside** a workspace, reached via the workspace's own sub-nav — never deleted, never moved on disk (routes unchanged), only re-parented in navigation.

**Mapping — representative rows** (full table maintained in the migration sheet; pattern is identical for every page):

```
Existing Page (route)              → Workspace   → Nav level        → Access method            → Reason
```

| Existing page (route unchanged) | Workspace | Nav level | Access method | Reason |
|---|---|---|---|---|
| `/crm/accounts` | **Sales** | Workspace tab | Sidebar → Sales → Accounts | Customer's one home is Sales |
| `/crm/leads` (Pipeline) | **Sales** | Workspace tab | Sidebar → Sales → Pipeline | Selling motion |
| `/crm/commercial`, `/crm/quotations` | **Sales** | Workspace tab "Quotations" | Sidebar → Sales → Quotations | Commercial output of a deal |
| `/crm/market-intelligence` | **Sales** | Workspace tab | Sidebar → Sales → Market Intelligence | Reference behind pricing |
| `/tendering/tenders` | **Delivery** | Workspace tab "Tenders" | Sidebar → Delivery → Tenders | Bid execution (its own workspace, per the locked Sales↔Tender separation) |
| `/contracts/contracts` | **Delivery** | Workspace tab | Sidebar → Delivery → Contracts | Awarded engagement's home |
| `/projects/projects` | **Delivery** | Workspace tab | Sidebar → Delivery → Projects | Delivery's home |
| `/projects/dashboard` | **Delivery** | **Overview** (default) | Sidebar → Delivery (lands on Overview) | Dashboard *becomes* the workspace front door |
| `/projects/schedule`, `/projects/variations`, `/contracts/certificates` | **Delivery** | Workspace tab | Sidebar → Delivery → Schedule / Variations / Certificates | Delivery sub-functions |
| `/procurement/*`, `/inventory/*` | **Operations** | Workspace sub-group | Sidebar → Operations → Procurement / Inventory | Buying & stock |
| `/engineering`, `/site/*`, `/quality/*`, `/hse/*` | **Operations** | Workspace sub-group | Sidebar → Operations → … | Site execution |
| `/fleet/*`, `/assets/*`, `/amc/*` | **Operations** | Workspace sub-group | Sidebar → Operations → … | Physical resources & service |
| `/hr/*` | **Operations** (or its own **People** later) | Workspace sub-group "People" | Sidebar → Operations → People | Workforce |
| `/finance/*` (all 15+), `/subcontracts/back-charges` money | **Finance** | Workspace tab | Sidebar → Finance → Accounting / AR / AP / Treasury / VAT / Budget / Reports | Finance finally gets one home |
| `/documents`, `/documents/control`, `/doccontrol/submittals`, `/admin/templates` | **Knowledge** | Workspace tab | Sidebar → Knowledge → … | Documents' one home |
| `/intelligence`, 5 `*/dashboard` roll-ups | **Analytics** | Workspace tab | Sidebar → Analytics → … | Cross-module reporting & insight |
| `/admin/*` (14 pages) | **Administration** | Workspace sub-group | Sidebar → Administration → … | Governance & config |
| `/`, `/workspace`, `/inbox`, `/search`, `/notifications`, `/views` | **Front doors** | Permanent top band | Always visible | The things every user needs constantly |
| `/ai`, `/admin/ai`, `/admin/intelligence` | **(dissolved as destinations)** | Ambient | Copilot dock + per-workspace Overview panels | AI is a capability, not a place (§7) |

> **Every route above stays valid.** The workspace layer is a new parent in the *navigation tree*; the pages render exactly as they do now.

---

## 3. Sidebar Redesign

**Before:** 6 groups, ~86 items, one 54-item scroll.
**After:** a fixed, role-filtered, ~11-line spine.

```
┌─ AURA OS ─────────────┐
│  ⌂  Home              │   ← /  (My Work: personal command center)
│  ✓  My Work           │   ← today's tasks/approvals across all workspaces
│  ✉  Inbox             │   ← /inbox (approvals + mail)
│  ⌕  Search            │   ← /search + ⌘K
│  ───────────────────  │
│  ◎  Sales             │   ← workspace (lands on Overview)
│  ▥  Delivery          │
│  ⚙  Operations        │
│  ◳  Finance           │
│  ▤  Knowledge         │
│  ✶  Analytics         │
│  ───────────────────  │
│  🛠  Administration    │   ← role-gated
└───────────────────────┘
```

Rules:
- **Nothing but permanent destinations lives here.** No individual entity pages, no dashboards, no leaf functions.
- **Role-gated** using the *existing* `visibleNav` / `GROUP_SUITE` mechanism (extend the map from 5 keys to the 7 workspaces; no new backend).
- **Personalizable**: pinned/favorite pages and default landing page ride on the existing saved-views/workspace-config surfaces (`/views`, `/admin/workspace`) — configuration, not new capability.
- The current `NAV` array is **not deleted** — it becomes the *source for each workspace's sub-nav* (the same objects, re-grouped one level deeper).

---

## 4. Workspace Architecture

Every workspace = **one Overview (default) + a short sub-nav of existing pages**. The Overview replaces that area's standalone dashboard.

**Universal Overview contract** (same layout everywhere → learn once):
`KPIs · Pending actions (mine) · Recent activity · AI Summary · Alerts · Primary actions`.

### Front doors (personal, not workspaces)
- **Home / My Work (`/`)** — the personal command center: my day across *all* workspaces (tasks, approvals, reminders, AI next-best-action). Absorbs the intent of `/crm/my-day` at the personal level while `/crm/my-day` stays as the sales-scoped view inside Sales.
- **Inbox (`/inbox`)**, **Search (`/search` + ⌘K)** — unchanged, promoted to the fixed top band.
- **My Workspace (`/workspace`)** — kept; positioned as the *collaboration* surface (chat/mail/views). No longer competes as a "home."

### Sales  → lands on **Overview**
`Overview · Accounts · Contacts · Pipeline · Quotations · Activities · Market Intelligence · Analytics`
(= today's CRM group + My Day folded into Overview; matches the locked CRM IA.)

### Delivery  → **Overview**
`Overview · Tenders · Contracts · Projects · Schedule · Variations · Certificates · Documents`
(= today's Deal chain, minus the selling noise; `/projects/dashboard` becomes Overview.)

### Operations  → **Overview**, then sub-grouped (the 54-item list, finally structured)
```
Overview
Procurement   → Dashboard(Overview) · Requests · RFQs · Purchase Orders · Suppliers
Inventory     → Stock · Goods Receipts · Transfers · Valuation
Engineering   → Engineering · Submittals
Site          → Site Control · Site Instructions
Quality       → Control · ITPs · Material Approvals
HSE           → Control · Toolbox Talks
People (HR)   → Dashboard · HR & Payroll · Timesheets · Attendance · Expenses · Advances · Gratuity · Doc Expiry
Fleet         → Fleet & Logistics · Traffic Fines · Salik
Assets        → Assets & Equipment · Depreciation
AMC           → AMC & Services · Preventive Maintenance
Subcontracts  → Subcontracts · Variations · Back-Charges
```

### Finance  → **Overview** (the biggest win — a real home)
`Overview · Accounting (Ledger/COA · Statements · Consolidation · Period Close) · AR (Customer Invoices · AR Aging · Receipts) · AP (Supplier Invoices · AP Aging) · Treasury (Petty Cash · Bank Rec · PDC · Bank Guarantees · FX) · VAT (Tax · VAT Returns) · Budget (Budgets · Revenue Recognition) · Reports`

### Knowledge  → **Overview**
`Overview · Documents · Document Control · Templates · Submittals`

### Analytics  → **Overview**
`Overview · Insights (AI briefing) · Portfolio dashboards (roll-ups) · Financial reports · Cross-module reports`

### Administration  → **Overview** (role-gated)
`Overview · Users & Access · Approval Matrix · Workflows · Numbering · Connectors/Webhooks · Feature Flags · Settings · Audit · Events · Data`

---

## 5. Page Hierarchy

Three levels only — no deeper trees:

```
Level 0  Front doors + Workspaces        (sidebar; permanent; role-gated)
Level 1  Workspace Overview + sub-nav    (the workspace shell; existing pages as tabs)
Level 2  Entity 360 / Operational / Queue (the pages themselves — UNCHANGED)
           └─ Level 3 lives INSIDE a record: tabs/sections/expanders (progressive disclosure)
```

- **Progressive disclosure:** a Level-2 record opens on Summary/Status/Recent/AI/Primary-actions; everything advanced is a tab/section/expander *within the record* (already the record-shell pattern).
- **One home law:** each object resolves to exactly one Level-1 location (Customer→Sales, Tender→Delivery, Invoice→Finance, Document→Knowledge). Cross-links between records remain, but "where does it live" has one answer.

---

## 6. Multi-tab Navigation Proposal

**Status:** a record-tab shell already exists (records open as labeled tabs with ✕). Proposal = **make it the default navigation model and finish it**, browser/VS-Code/Figma style — pure frontend.

- Opening any record or page **preserves the current context** and opens (or focuses) an **application tab**; the workspace shell never unmounts.
- **Multiple open records**, quick-switch (⌘1..9 / ⌘K "switch to open tab"), reorderable, closeable, "reopen closed tab."
- **Pinned tabs** for the surfaces a role lives in (e.g. a PM pins Delivery Overview).
- **Deep-link safe:** every tab is still a real route (shareable URL), so nothing about routing/APIs changes.
- **Persistence:** open-tab set restores per user via the existing saved-views/workspace-config store (config only).

Acceptance: a user can have Opportunity, its Tender, and the Contract open simultaneously and move between them without losing scroll/filter state.

---

## 7. AI Integration Strategy

**Principle:** *AI is a capability, not a destination.* Dissolve `/ai`, `/admin/ai`, `/admin/intelligence`, `/intelligence` as **places you navigate to**; surface the same services **where the work is**. (No AI backend changes — the AiService, autonomy queue, agents, RAG all stay; only their *entry points* move.)

Three ambient surfaces:

1. **Copilot dock** — a persistent, collapsible right-rail / ⌘J launcher available on **every** page. Context-aware (knows the open workspace/record). Absorbs the isolated `/ai` chat.
2. **Per-workspace Overview panels** — each Overview shows *this area's* AI Summary + Next-Best-Action + pending **autonomy proposals** (real ones from the autonomy queue; honest empty state when none — never fabricated). This is where the current `/ai` cards belong, wired to real data.
3. **Per-record insights** — every Entity 360 exposes AI Summary / Insights / Suggested Actions inline (already the pattern in Opportunity/pricing).

**Governance stays visible but as a control surface, not a "module":** the admin AI control center (agents, guardrails, autonomy thresholds, traces) lives under **Administration → AI Governance** — configured by admins, not walked through by users.

> Note: an in-flight fix already replaces the fabricated `/ai` dashboard with real autonomy-queue data — that work aligns with surface (2) and should land as its own change.

---

## 8. Quick Wins (frontend-only, low risk, high signal)

1. **Reshape the sidebar to the 8-line spine** (§3) by re-grouping `nav.ts` — no route changes, no new pages. *Single-file, reversible.*
2. **Promote Home / Inbox / Search to a fixed top band.**
3. **Give Finance a home** — pull the 15+ finance items out of "Operate" into a Finance workspace group. *Biggest perceived improvement for least effort.*
4. **Rename for humans:** "Sales Pipeline"→ keep; "Deal chain"→ split into Sales/Delivery; "Operate"→ "Operations" with sub-headers.
5. **Turn the 5 `*/dashboard` pages into their workspace's Overview** (route them as the workspace default; keep the page).
6. **Add the Copilot dock launcher** (⌘J) reusing the existing `/ai` chat component.
7. **Consistent workspace Overview header** across the 5 existing dashboards (shared component).

All seven are pure IA/label/layout — nothing behind them moves.

## 9. Medium-Term Improvements

1. **Finish the multi-tab shell** (§6): pinning, quick-switch, persistence.
2. **Structure the Operations sub-groups** (§4) with collapsible sub-headers.
3. **Per-workspace Overview data panels** wired to existing read-models (KPIs/pending/alerts) + real AI summary.
4. **Role-shaped defaults**: extend `GROUP_SUITE` to 7 workspaces; per-role default landing page via existing workspace-config.
5. **Global search upgrades**: type-ahead entities (customers, tenders, invoices, employees…) so users find objects without knowing modules.
6. **Personalization**: favorites/pins surfaced in the sidebar via saved-views store.

## 10. Migration Plan (non-breaking, staged)

- **Stage 0 — Instrument (no user change):** finalize the full Page→Workspace map (extend §2 table to all 131 routes) as a data file. Keep the current sidebar live.
- **Stage 1 — Sidebar re-group behind a flag:** ship the 8-line spine reading the *same* `nav.ts` objects re-parented; gate with an existing feature flag so it can be toggled per tenant/user. Old sidebar remains fallback.
- **Stage 2 — Workspace shells:** introduce the 7 Overview containers (5 already exist as dashboards → re-route as defaults; 2 new — Finance, Knowledge — are thin overview pages over existing read-models).
- **Stage 3 — AI ambient surfaces:** Copilot dock + Overview AI panels; retire `/ai` as a nav destination (route still resolves).
- **Stage 4 — Multi-tab default + personalization:** flip tabs to default; enable pins/persistence; role defaults.
- **Rollback:** every stage is flag-gated and additive; disabling the flag returns the current experience byte-for-byte.

## 11. Implementation Roadmap

| Phase | Deliverable | Effort | Risk | Depends on |
|---|---|---|---|---|
| **R1** | Sidebar spine (§3) + Finance/Delivery/Sales split, flag-gated | S | Low | approval |
| **R2** | Front-door top band + dashboards→Overviews | S | Low | R1 |
| **R3** | Copilot dock (⌘J) + real autonomy-queue Overview panels | M | Low | R1; in-flight AI fix |
| **R4** | Operations sub-grouping + Finance/Knowledge overview shells | M | Low | R1 |
| **R5** | Multi-tab default (pin/persist/quick-switch) | M | Med | tab shell |
| **R6** | Role-shaped defaults + personalization (favorites) | M | Low | R1, existing workspace-config |
| **R7** | Global search type-ahead across entities | M | Low | search API (exists) |

---

## Success criteria check

| Criterion | How this design meets it |
|---|---|
| New employee navigates in <10 min | 8-line spine + human labels + one-home law |
| Common tasks in ≤3 clicks | Sidebar → Workspace → page (or ⌘K direct) |
| Sidebar = permanent nav only | 8 destinations; zero leaf pages |
| One home per object | §2 mapping resolves each object to one workspace |
| Workflows / permissions / APIs unchanged | Nav-only re-parenting; routes & guards untouched; `visibleNav` reused |
| AI contextual, not isolated | 4 AI destinations → 1 dock + ambient panels |
| Feels like one OS | Uniform Overview contract + tabbed shell + ambient AI |

---

## Explicit non-goals (guardrails restated)

No backend/API/schema/domain/event/permission/business-rule change. No page deleted. No module duplicated. No parallel workflow. Existing modules remain the source of truth. **This document is for approval; nothing here is implemented yet.**
