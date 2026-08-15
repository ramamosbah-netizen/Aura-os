# AURA OS — Phase 2A: Frontend Completion + UX Gap Register

**Date:** 2026-08-15
**Builds on:** [2026-08-15-frontend-surface-audit.md](2026-08-15-frontend-surface-audit.md) (Phase 1 — surface existence)
**This phase measures the second and third levels:** *Frontend surface* (is there a place?) **and** *Usability/UX* (can the engineer actually finish the work?).
This document is the register that Phase 2B/2C execute against.

---

## Progress log (updated 2026-08-15)

Foundation build has started (open in **[PR #225](https://github.com/ramamosbah-netizen/Aura-os/pull/225)**). Each slice gated static → unit → prod build → **live browser** (never "compile = done"). Frontend/UX only; backend untouched.

| Slice | Status | Verification |
|---|---|---|
| **2C-thin PR-01** — `aura-data-table` operational register + `DataState` + `RelatedRecords`/`ActivityTimeline` + `useMediaQuery` | ✅ **DONE + gated** | 20 query-engine tests + prod build + live browser (search/sort/filter+URL, filter→page-1 reset, deep-link/refresh, mobile cards, empty/loading). Caught+fixed a real `next/headers` client-boundary bug the build missed → extracted `lib/data-error.ts`. |
| **PR-04** — promote `crm/record-shell` → shared `ui/record.tsx` (+ `related`/`activity`; 5 CRM 360s untouched via re-export) | ✅ **DONE + gated** (residual note) | typecheck/lint/48 tests/prod build + SSR-render of the full surface via the re-export path. Live hydration of project-nested routes flaky in the sandbox pane → primitives are unchanged production code, risk covered. |
| **PR-05** — Project Context (URL-derived, no stored state → kills URL↔state divergence) | ✅ **DONE + gated** (residual note) | 15 scope tests + prod build + live browser, 2 real projects: init, deep-link/refresh restore, **divergence guard (URL id === server head id)**, **isolation (A→B no carryover)**, structured AI context, AI-dock transport captured on the wire. Setter-click covered by `buildScopeUrl` tests. |
| **PR-02** — app-shell responsive audit | ⏳ next | shell already carries 22 responsive signals — audit not rebuild |
| **PR-06** — ELV workspace (first real adopter of the foundation) | ⏳ queued | register → Device 360 → workflow → cross-module → AI, on Project Context |

Deployed locally to the Desktop stack (web :3000 / API :4000) and confirmed serving the new build.

## The three levels being separated

| Level | Question | Phase 1 verdict |
|---|---|---|
| 1. Backend capability | Does the function exist in the system? | **Strong** — 102 controllers, deep workflows |
| 2. Frontend surface | Is there a clear place for the user to reach it? | **Good but incomplete** — concentrated 🔴/🟠 gaps |
| 3. Usability / UX | Is the page easy, clear, connected, and does it let the user finish the job? | **The focus now — measured below** |

---

## Part A — Platform-wide UX baseline (measured, not estimated)

Method: static sweep of `apps/web/{app,components}` (173 pages, 234 client components).

| UX dimension | Measurement | Reading |
|---|---|---|
| **Design-system table adopted** | `aura-data-table` imported by **1** file; **102** components hand-roll raw `<table>` | 🔴 A shared table exists but is ~unadopted — every register is bespoke |
| **Styling** | inline `const st`/`CSSProperties` in **218 / 234** components; `className` in 56 | 🔴 No consistent component styling; each page re-invents cards/tables/buttons |
| **Responsive / mobile** | `@media` in **5** files; `useMediaQuery`/`matchMedia`/`isMobile` in **0** | 🔴 Effectively desktop-only — blocks "manage the project from site" |
| **Pagination** | pagination logic in **1** component (despite `/paged` on ~every list endpoint) | 🔴 Large registers render unbounded flat lists |
| **Sort** | **2** components | 🔴 No column sorting |
| **Search / filter** | search input in **12** components | 🟠 Sparse; most registers can't be filtered |
| **Empty states** | `empty-state` primitive in **54**; empty copy in 130 | 🟢 Reasonable |
| **Error states** | `error-state` in **35**; `data-state` in 8 | 🟠 Partial; many pages degrade to silent-empty (`getJson`) |
| **Loading states** | `page-loading` in **35**; `skeleton` in **2** | 🟠 Route-level ok; in-view skeletons rare |
| **Accessibility** | `aria-*` in **39**; `role=` in **18** of 234 | 🟠 Sparse — labels/focus/semantics not systematic |
| **Create drawer adopted** | `create-drawer` in **23** components | 🟢 Good, consistent create UX where present |
| **Record shell adopted** | `record-shell`/360 primitives in **4** | 🟠 360 pattern under-reused |

### The four systemic UX debts (fix once, benefit everywhere)

1. **Register debt** — 102 bespoke tables, ~no pagination/sort/filter. A single adopted `aura-data-table` (search + sort + paginate + saved-views) upgrades every list at once.
2. **Responsive debt** — desktop-only. Site/Quality/HSE field work needs tablet/mobile layouts.
3. **Consistency debt** — inline styles everywhere; the design system (`components/ui/*`, `globals.css` 1659 lines, 73 tokens) is under-adopted.
4. **Connectivity debt** — related records don't deep-link (a message about DRG-001, an NCR from an IR, a certificate on a contract). The user's core vision — *"everything is connected"* — is the weakest UX axis.

> **Implication:** Phase 2C is not cosmetic polish added at the end. Two of these debts (register + responsive) are *infrastructure* that later pages should be built on top of, so a thin slice of 2C is pulled forward before mass page-building.

---

## Part B — UX audit rubric (applied per surface in the register)

Each surface is scored on 8 axes (🟢 ok · 🟠 partial · 🔴 missing):

| Axis | Test |
|---|---|
| **S — Surface** | Discoverable page exists (in `nav.ts`) |
| **N — Navigation/Connectivity** | Can reach parent/child + related records; breadcrumbs |
| **C — CRUD** | Create / view / edit / cancel per permission |
| **W — Workflow** | Every backend transition has a clear control |
| **D — Detail/360** | A record 360 exists where the user needs one |
| **X — States** | Loading + empty + error all handled |
| **F — Find** | Search / filter / sort / pagination on registers |
| **M — Mobile** | Usable on tablet/mobile |

---

## Part C — The Gap Register (reprioritized: *operate a project first*)

Priority follows the technical-lead ordering, not "easiest backend gap first."

### P0 — Engineer can operate a project end-to-end

| # | Surface to build/complete | S | N | C | W | D | X | F | M | Backend it sits on (exists) |
|---|---|---|---|---|---|---|---|---|---|---|
| P0-1 | **ELV workspace** `/elv` → Dashboard · Devices · Device 360 · Systems · Installation · Testing · Commissioning · Punch List · Compliance | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | `elv/devices` (register, punch-list, status, commissioning) — plus links to commissioning/assets/AMC |
| P0-2 | **Project Command Center** — health, per-discipline progress, red-flags (overdue RFIs/NCRs/delays/permits/approvals/variance), AI "what threatens this project / what to do today" | 🟠 | 🟠 | — | — | 🟠 | 🟠 | — | 🔴 | `projects` evm/cbs/delays/variations + cross-module reads (all exist) |
| P0-3 | **My Day → operations cockpit** — Urgent / Attention / Today / AI, counts from real data (NCR, RFI, PTW, drawings, approvals, claims, certificates) | 🟠 | 🟢 | — | — | — | 🟠 | — | 🔴 | `crm/my-day`, notifications, per-module list endpoints |
| P0-4 | **Actions (unified)** — every action across NCR/CAPA/commitments/site-instructions/tasks in one queue (Source·Action·Owner·Due·Priority·Status) | 🔴 | 🔴 | 🟠 | 🟠 | — | — | 🔴 | 🔴 | aggregate over hse/capas, crm commitments, site/instructions, activities |
| P0-5 | **Issues register** `/issues` — event that already happened (≠ risk) | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | ⚠ **no backend today** — see "Backend note" |
| P0-6 | **Risks register** `/risks` — cross-project heat map + register | 🟠 | 🔴 | 🟠 | 🟠 | 🟠 | 🟠 | 🔴 | 🔴 | opportunity/project risk data exists; cross-cutting view missing |
| P0-7 | **Communications area** `/communications` — Mail · Channels · DMs · project/dept channels · mentions · message→task/RFI/NCR/meeting; link to business object | 🟠 | 🔴 | 🟠 | — | — | 🟠 | 🟠 | 🔴 | `comms` (channels/dm/mail/unread) |
| P0-8 | **Calendar** `/calendar` — day/week/month, project + personal, deadlines (PTW expiry, NCR/RFI/submittal due) | 🔴 | 🔴 | 🟠 | — | — | 🔴 | — | 🔴 | `admin/calendar` (config) + due-date reads across modules |
| P0-9 | **Meetings + Meeting 360** — agenda, participants, decisions→Actions, minutes, AI summary | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | `crm/deal-brief` meeting-summary (AI) — meeting entity likely thin |
| P0-10 | **Reporting hub** `/reports` — project (progress/daily/weekly/delay/cost/quality/HSE/commissioning) + management + export PDF/Excel/CSV | 🟠 | 🔴 | — | — | — | 🟠 | 🟠 | 🔴 | statements, spend-analytics, win-loss, existing `.csv`/`.xlsx` exports |

### P1 — Complete existing workflows (embedded → dedicated + 360s)

| # | Surface | S | D | N | Backend it sits on |
|---|---|---|---|---|---|
| P1-1 | **Engineering 360s** — RFI 360 · Submittal 360 · Design-Change 360 · TQ 360 · BIM 360 (today: hub cards only) | 🟠 | 🔴 | 🟠 | `engineering/*` (all detail endpoints exist) |
| P1-2 | **Quality Audits** dedicated page `/quality/audits` (today in control hub) | 🟠 | 🟠 | 🟠 | `quality/audits` + checklist + raise-NCR |
| P1-3 | **HSE Incident 360** `/hse/incidents/:id` (investigation, root cause, CAPA, witnesses, closure) | 🟠 | 🔴 | 🟠 | `hse/incidents/:id/detail` |
| P1-4 | **Contract Obligations register** + due-soon queue | 🟠 | 🟠 | 🟠 | `contracts/obligations` (in 360 only) |
| P1-5 | **Contract Bonds register** | 🟠 | 🟠 | 🟠 | `contracts/bonds` (in 360 only) |
| P1-6 | **Subcontract 360** on-screen (today: print only) | 🟠 | 🔴 | 🟠 | `subcontracts/:id` |
| P1-7 | **EOT Claims register** + submit/decide controls | 🟠 | 🟠 | 🔴 | `projects/eot-claims` |
| P1-8 | **Doc Control Correspondence** dedicated surface | 🟠 | 🟠 | 🟠 | `doccontrol/correspondence` |
| P1-9 | **HR Org Chart** `/hr/org-chart` | 🔴 | 🔴 | 🔴 | `hr/org-chart` |

### P2 — Backend capabilities with zero UI

| # | Surface | Backend |
|---|---|---|
| P2-1 | Procurement **Framework Agreements** + call-offs | `procurement/framework-agreements` |
| P2-2 | Tendering **Win/Loss** register + analytics | `tendering/outcomes` |
| P2-3 | Finance **Profit Centers** + report | `finance/profit-centers` |
| P2-4 | Project **Cashflow Forecast** (surfaced inside Project financials) | `projects/cashflow-forecasts` |
| P2-5 | **Cost Ledger / Quantity Ledger** browsers (inside Project financials) | `projects/cost-ledger`, `quantity-ledger` |
| P2-6 | **WPS SIF generation** trigger (button in payroll) | `hr` `POST /wps` |
| P2-7 | Finance **Project Financial View** — commercial+cost+cash+profitability inside Project 360 | reads across finance/projects/contracts (exist) |

### P3 — UX excellence pass (page-by-page)

Apply the 8-axis rubric to every shipped page; fix the four systemic debts first (register, responsive, consistency, connectivity), then per-page: discoverability → understandable → usable → workflow complete → connected.

---

## Part D — Proposed navigation / IA (view-only re-parenting)

The prompt is right that dumping ~30 pages into `nav.ts` bloats the sidebar. Adopt the grouped IA below. **This only re-parents existing hrefs + adds the new P0/P1/P2 pages; no route, API, or permission changes** (same pattern already used successfully in the L5 experience re-group).

```
🏠 My Work        My Day · Inbox · Actions · Notifications
📡 Communications Mail · Channels · Messages · Meetings · Calendar
💼 Commercial     CRM · Tendering · Quotations · Contracts · Commercial
🏗 Delivery       Projects · Engineering · Site · Quality · HSE ·
                  Procurement · Materials · Subcontractors · Commissioning · Handover
⚡ ELV            Devices · Systems · Installation · Testing · Commissioning · Punch List · Compliance
💰 Finance        AP · AR · GL · Cash · Budget · Cost · Profit · Tax
👥 People         HR · Employees · Attendance · Payroll · Expenses · Org Chart
🚗 Operations     Fleet · Assets · AMC
📚 Documents      Documents · Document Control · Correspondence · Transmittals
📊 Reports        Project · Management · Financial · Operational
🤖 AI             AI Workspace · Intelligence
⚙ Administration  Users · Roles · Workflows · Settings · Audit · Integrations
```

## Part E — The per-module UX contract (Design System target)

Every module converges on a predictable shape (not every element mandatory):

```
MODULE → Dashboard · Register · Create · Detail/360 · Workflow · Documents · Activities · Actions · History · Reports · AI
```

Enforced through **adoption** of the existing primitives — `aura-data-table`, `create-drawer`, `record-shell`, `data-state`/`empty-state`/`error-state`/`skeleton` — replacing bespoke inline tables.

---

## Part F — Guardrail (the working contract for 2B/2C)

**Mode: UI/UX only. Do not modify operational/backend behavior.**

**Allowed:** create pages/components · improve layout, navigation, tables, forms, dashboards · add loading/empty/error states · add links between records · consume existing APIs & existing BFF proxies · responsive & a11y improvements · reorder/represent information · adopt the design-system primitives.

**Forbidden:** change API contracts · controllers · services · database/migrations · business logic · financial calculations · auth(n/z) rules · backend workflows · delete functionality · change the data model.

**BFF note:** new pages may add **read/forward** proxy routes under `apps/web/app/api/*` that pass through to *existing* API endpoints (required by the server-page→BFF pattern). That is frontend plumbing, not a new backend capability. No new capability is invented.

### Backend note (surfaces with thin/no backing — do NOT build backend)

Two P0 items lean on data that may not fully exist yet:
- **P0-5 Issues** — no dedicated `issues` controller found. Options within the guardrail: (a) surface Issues as a **view/filter over existing** signals/NCR/site-instruction data, or (b) flag that a backend Issues entity is a *separate* (out-of-scope) task. **Recommend (a)** for now.
- **P0-9 Meetings** — only AI `meeting-summary` exists; no meetings CRUD entity confirmed. Surface what exists (my-day meetings + AI summary); a full Meeting entity would be a backend task (out of scope).

These two are the only P0 items where "frontend over existing backend" doesn't cleanly hold — calling it out so we don't silently expand scope.

---

## Part G — Execution sequence

- **2C-thin (foundation) — ✅ DONE ([PR #225](https://github.com/ramamosbah-netizen/Aura-os/pull/225)):** `aura-data-table` operational register, `DataState`, `RelatedRecords`/`ActivityTimeline`, `useMediaQuery`, shared `ui/record.tsx` (PR-04), and URL-derived Project Context (PR-05). Every later page inherits these.
- **⏳ Remaining foundation:** PR-02 app-shell responsive audit (shell already has 22 responsive signals — audit, not rebuild).
- **2B build order (next):** **P0-1 ELV** → P0-2 Project Command Center → P0-3 My Day → P0-4 Actions → P0-7 Communications → P0-8 Calendar → P0-10 Reporting → P0-6 Risks → (P0-5 Issues / P0-9 Meetings per backend note) → P1 series → P2 series.
- **2C full:** per-page rubric sweep, module by module.
- Each surface = **one small PR**, reuses the design system, registers in `nav.ts`, ships with loading/empty/error + responsive, and deep-links its related records — each with its own **live behavioral gate**, not compile-only.

**Next slice: P0-1 (ELV workspace)** — the highest-value gap for an ELV contractor and the first real adopter that exercises the whole foundation (register → Device 360 → workflow → cross-module handoff to Commissioning/Assets/AMC → Project Context + AI).
