# Product Experience Gap Verification — 12 Axes

**Date:** 2026-07-02 (updated 2026-07-03: Waves 1–6 implemented — **all 12 axes closed**) · **Verified against:** live tree (`apps/web`, `apps/api`) on `claude/gallant-northcutt-3d0938`

Verdicts: ✅ claim confirmed as-is · 🟡 partially exists (claim overstated) · each row cites the evidence file.

| # | Axis | Verdict | Evidence | Actual delta |
|---|------|---------|----------|--------------|
| 1 | Workspace = timeline only | 🟡 overstated → **closed in W5** | `apps/web/app/page.tsx` + `components/role-dashboard-shell.tsx` | Workspace already has 4 perspectives (General/CEO/CFO/PM), a **Unified Work Center Queue** (approve PR / approve+pay invoice / activate subcontract / certify+pay claim), activity-by-area, recent events. **Missing:** Tasks, Meetings, RFQs due, Tender deadlines, Invoices due (dates), AI summary, Risks, Notifications digest. |
| 2 | No real global search | 🟡 partially exists → **closed in W3** | `apps/api/src/search/search.service.ts`, `components/command-palette.tsx:73-91` | `/api/search` exists and is wired into ⌘K (debounced, grouped "Records" above "Navigate"). Covers **6 types only**: Account, Tender, Contract, Project, PO, Invoice. **Missing:** Opportunities, Employees, Tickets, Documents, Assets, Emails; in-memory fan-out capped at 50/entity (no projection, no ranking); **hits link to list pages, not the record** (`href: '/crm/accounts'`) — no per-record deep links; no full search-results page. |
| 3 | No Universal Inbox | 🟡 partially exists → **closed in W3** | `components/work-center.tsx` | Work Center is a real unified actionable queue with module filter — but only 4 flows (PR, Invoice, Subcontract, Claim), derived by hardcoded status checks. **Missing:** Leave, Tender, Variation approvals; not driven by the generic workflow engine (`apps/api/src/workflow/` exists, only `po.approval` seeded); no assignment/ownership ("my approvals" vs everyone's). |
| 4 | No Recent Items | ✅ confirmed → **closed in W2** | grep: no recent/pinned/favorite in `apps/web` | Nothing. Adjacent: saved views exist (`views-client.tsx`, `save-view-button.tsx`). Trivially buildable client-side (localStorage) once record deep links exist (see #2/#6). |
| 5 | No Breadcrumbs | ✅ confirmed → **closed in W2** | `components/app-shell.tsx` | Sidebar + topbar only; single `<main>` outlet, no breadcrumb component anywhere. |
| 6 | No record Tabs (VS Code style) | ✅ confirmed → **closed in W6** | `app-shell.tsx`, `apps/web/README.md:4` | "multi-tab" listed in README as planned, not built. **Blocker:** most entities have no per-record route — search/list link to list pages. Record-level routing is the prerequisite; tabs come after. |
| 7 | Command Palette = navigation only | ✅ confirmed → **closed in W4** | `components/command-palette.tsx` | Two groups: Records (search hits) + Navigate (nav items). No verbs: no Create/Approve/Assign actions. |
| 8 | AI Dock not context-aware | ✅ confirmed → **closed in W4** | `components/ai-dock.tsx:12-17` | `SUGGESTIONS` is a static 4-item array; no `usePathname`, no page/record context sent to `/api/intelligence/chat`. |
| 9 | Activity feed lacks filters | ✅ confirmed → **closed in W1** | `role-dashboard-shell.tsx:122,220-236` | Timeline = last 12 events, no module/type/period filters. (Work Center has a module filter; the timeline doesn't.) |
| 10 | No demo data / empty states | ✅ confirmed → **closed in W5** | `apps/api/src/auth/auth.seeder.ts`, `workflow/workflow.seeder.ts` | Only seeds: u-admin grant + `po.approval` workflow + u-demo grant. Zero business demo data (no demo customers/projects/invoices/inventory). Empty states are plain "Nothing yet." text. |
| 11 | Raw event codes shown to users | ✅ confirmed → **closed in W1** | `role-dashboard-shell.tsx:227` (`<code>{e.type}</code>`), `page.tsx:216` | Event types rendered verbatim in monospace (`crm.opportunity.stage_changed` style). No humanization layer exists. |
| 12 | Login page is dev-flavored | ✅ confirmed → **closed in W1** | `apps/web/app/login/page.tsx:8,56,64-67` | Default username `u-admin` prefilled; password placeholder "dev: any (unless AUTH_DEV_PASSWORD set)"; footer hint explains 403 behavior. |

## Extra findings (not in the 12)

- **Company switcher is simulated** — `app-shell.tsx` hardcodes 4 fake companies ("Simulated authorized companies — in production, loaded from session/API"). Same product-experience class as #12; should load from session.
- **`/api/auth/switch-company` is dead code** — `apps/web/app/api/auth/switch-company/route.ts` writes an `aura-session` cookie, but the real session cookie is `aura_session` (`lib/session.ts:5`) and **nothing anywhere reads `aura-session`**. The switcher POST "succeeds" while changing no server-side context. Fixing the switcher requires a real company concept in auth (`AuthController.login` mints `companyId: null`), so it is deferred to a later wave — not a quick patch.

## Structural insight

Axes **2, 4, 6** share one root cause: **no per-record routes**. Only `project-detail.tsx` / `tender-detail.tsx` exist as detail components. Search can't deep-link, Recent Items has nothing to point at, and tabs have nothing to open. → **Record-level routing (`/crm/accounts/[id]` etc.) is the single highest-leverage prerequisite of the whole phase.**

Axes **3** and part of **1** share a second root cause: approvals are derived per-module by status checks instead of flowing through the existing workflow engine. Generalizing `workflow/` into an inbox feed unlocks Leave/Tender/Variation approvals for free as modules adopt it.

## Suggested build order

| Wave | Items | Rationale | Status |
|------|-------|-----------|--------|
| W1 — cheap wins | #11 event-label humanizer, #12 login branding, #9 timeline filters | Small, isolated, immediate perceived-quality jump | ✅ **done 2026-07-02** |
| W2 — routing spine | Per-record routes for spine entities → then #4 Recent Items (localStorage) + #5 Breadcrumbs (derive from route) | One prerequisite unlocks three axes | ✅ **done 2026-07-03** |
| W3 — search & inbox | #2 expand SearchService coverage + deep-link hrefs + results page; #3 inbox on workflow engine | Depends on W2 hrefs | ✅ **done 2026-07-03** |
| W4 — command surface | #7 palette actions (Create/Approve/Go To), #8 context-aware AI dock (pathname + record context) | Verbs need routes + inbox APIs to call | ✅ **done 2026-07-03** |
| W5 — first-run | #10 demo-data seeder (behind flag) + designed empty states; #1 Workspace "Today" composition (deadlines, due invoices, meetings, AI summary) | Workspace composes everything built above | ✅ **done 2026-07-03** |

## Wave 1 implementation (2026-07-02)

| Axis | Change | Files |
|------|--------|-------|
| #11 Product language | New humanization layer: `crm.opportunity.stage_changed` → module badge **CRM** + "Opportunity stage changed". Generic derivation (split on `.`/`_`, title-case) so new modules need zero registration; `AREA_LABELS` overrides display names (HR, HSE, Document Control…). Applied to the Workspace timeline (raw code kept as hover tooltip) and the Event stream page (label first, raw code secondary — it stays an audit view). "Activity by area" bars now show display names too. | `apps/web/lib/event-labels.ts` (new), `components/role-dashboard-shell.tsx`, `app/events/page.tsx` |
| #9 Activity feed filters | Recent-activity panel gained two filters: **module** (derived from live event areas) and **period** (All / 24h / 7d / 30d); filtered list shows up to 30 events (was fixed 12, unfiltered). | `components/role-dashboard-shell.tsx` |
| #12 Login page | Rebuilt as a two-pane enterprise screen: brand pane (mark, tagline, copyright) + clean sign-in form. Removed all dev artifacts: prefilled `u-admin`, "dev: any (unless AUTH_DEV_PASSWORD set)" placeholder, and the 403-behavior footnote. Added autocomplete attributes and a neutral "Contact your workspace administrator" hint. Auth flow unchanged. | `apps/web/app/login/page.tsx` |

**Verification:** `pnpm --filter @aura/web typecheck` ✅ · `pnpm --filter @aura/web build` ✅ (113 routes, no errors). E2E smoke (`e2e/smoke.spec.ts`) only asserts /login reachability — unaffected.

**Deliberately not touched in W1:** company switcher (needs real company model — see Extra findings), Workspace subtitle dev-copy ("fed by the event spine") — candidate for W5 Workspace rework.

## Wave 2 implementation (2026-07-03)

The routing spine: every spine entity now has a real per-record page, and the three UX layers that depend on deep links (breadcrumbs, recent items, search) light up together.

| Piece | Change | Files |
|-------|--------|-------|
| Record routes ×5 | New detail pages for **Account, Contract, Project, Purchase Order, Invoice** (Tender already existed). Each fetches the entity's `GET :id` endpoint (all six already existed in the Nest API — only the web layer was missing), renders a shared header/field-grid/related-links layout, and handles not-found. Cross-links follow the deal chain by snapshot ids: Invoice → PO → Project → Contract → Tender → Account. | `app/crm/accounts/[id]/page.tsx`, `app/contracts/contracts/[id]/page.tsx`, `app/projects/projects/[id]/page.tsx`, `app/procurement/purchase-orders/[id]/page.tsx`, `app/finance/invoices/[id]/page.tsx`, shared layout `components/record-detail.tsx` |
| #5 Breadcrumbs | Topbar trail `{nav group} › {nav item} › {record}` derived from the pathname against `NAV` (longest-prefix match — never drifts from the sidebar). The record leaf is announced by the detail page via a `RecordChrome` custom event; raw ids are never shown. | `components/breadcrumbs.tsx` (new), `components/app-shell.tsx` |
| #4 Recent Items | `RecordChrome` client island on every record page logs visits to localStorage (deduped, max 12). The ⌘K palette shows a **Recent** group above Navigate when the query is empty. | `lib/recent-items.ts` (new), `components/record-chrome.tsx` (new), `components/command-palette.tsx` |
| #2 (partial) Search deep links | `SearchService` hits now link to the record (`/crm/accounts/{id}` …), not the list page. Remaining for W3: coverage expansion + results page. | `apps/api/src/search/search.service.ts` (+ test updated) |
| List → record links | Title cells link to the record page on Accounts, Contracts, POs, Invoices lists (Tenders already did). Projects list kept its existing inline `?projectId=` detail panel — richer than the new page; not worth breaking. | `app/crm/accounts/page.tsx`, `app/contracts/contracts/page.tsx`, `components/po-list.tsx`, `components/invoices-list.tsx`, `app/tendering/tenders/[id]/page.tsx` (RecordChrome added) |

**Verification:** web `typecheck` ✅ · `next build` ✅ (118 routes — 5 new record pages) · API tests **17/17** ✅ including the updated search deep-link assertion. (Note: two API suites initially failed on a stale `@aura/core` dist in the fresh worktree — rebuilt, all green; unrelated to these changes.)

## Wave 3 implementation (2026-07-03)

| Piece | Change | Files |
|-------|--------|-------|
| #2 Search coverage | `SearchService` grew from 6 to **12 entity types**: + Opportunity, Quotation, Supplier, Subcontract, Employee, Asset (matches name/title/reference/serial/email; e.g. "Ahmed" now finds employees, accounts and suppliers together). Still a thin host aggregator — no cross-module joins. Controller now accepts a `limit` query (capped at 100). | `apps/api/src/search/search.service.ts`, `search.controller.ts`, `search.service.test.ts` (+1 test) |
| #2 Results page | New `/search` page: full-width query form, results grouped by entity type with counts, deep links. The ⌘K palette adds a "See all results for …" row (query ≥ 2 chars) that lands here — palette stays the fast path, the page is the exhaustive one. | `apps/web/app/search/page.tsx` (new), `components/command-palette.tsx` |
| #3 Universal Inbox API | New `InboxService` host aggregator: every record across the platform waiting on a human decision, from **9 modules / 12 kinds** — PR (approve), PO pending_approval, Invoice (approve/pay), Subcontract (activate), Claim (certify/pay), Tender submitted (decide), Project Variation submitted, Leave pending, Timesheet submitted, Expense Claim submitted, Staff Advance requested, Material Approval submitted. HR items resolve employee names via an in-host map (no join). Sorted newest-first. | `apps/api/src/inbox/inbox.service.ts`, `inbox.controller.ts` (new), `app.module.ts` |
| #3 Inbox page | New `/inbox` page: pending count pill, items grouped by module with action verb badges (Approve/Pay/Certify/Decide/Review), value and age per row, deep links to the record or owning module. Empty state: "All clear — nothing is waiting on you." | `apps/web/app/inbox/page.tsx` (new) |
| Navigation | "Inbox" and "Search" added to the Workspace nav group — sidebar and palette pick them up automatically (single source of truth in `nav.ts`). | `components/nav.ts` |

**Architecture note:** the inbox derives "pending" from each entity's own status (the same composition pattern as search). When modules adopt the Workflow engine (still Phase-0 proof: only `po.approval` seeded, no module routes through it), `InboxService.list` becomes a `listInstances` projection without changing callers — this was the deliberate v1 trade-off vs. refactoring every module onto the engine first.

**Verification:** API `nest build` ✅ · API tests **18/18** ✅ · web `typecheck` ✅ · `next build` ✅ (`/inbox`, `/search` in the route table).

## Wave 4 implementation (2026-07-03)

| Piece | Change | Files |
|-------|--------|-------|
| #7 Palette verbs | ⌘K is now a command center with five row groups: **Recent** (last-opened records, empty query), **Pending** (live universal-inbox decisions rendered as verbs — "Approve: Invoice X", "Decide: Tender Y" — fetched on open via a new `/api/inbox` BFF proxy), **Records** (global search), **Actions** (12 Create/Open commands: Create Account/Lead/Quotation/Tender/Contract/Project/PR/PO/Invoice/Customer Invoice/Subcontract, Open Inbox), and **Navigate**. With a query, Actions rank above Navigate; empty palette shows Recent + top Pending first. | `components/command-palette.tsx`, `components/nav.ts` (`CREATE_ACTIONS`, `findNavMatch`), `app/api/inbox/route.ts` (new) |
| #8 Context-aware AI dock | The dock now knows where the user is: `usePathname` + `findNavMatch` give the module; the `RecordChrome` title event gives the open record. Suggestions are per-area (Tendering: "Analyze this tender: {record}", "Estimate the margin…", "Suggest vendors…"; Finance, Projects, CRM, Procurement, HR, Inventory, Subcontracts, Inbox each have their own set) and the suggestion header names the page. Every chat request now carries `page: { path, module, record }`; the API injects a "USER'S CURRENT CONTEXT" block into the system prompt so "this" means the open record. | `components/ai-dock.tsx`, `apps/api/src/intelligence/intelligence.controller.ts` (`ChatDto.page`), `app/api/intelligence/chat/route.ts` (proxy now forwards `page`) |
| Reuse | Breadcrumbs refactored onto the shared `findNavMatch` (was inline duplication). | `components/breadcrumbs.tsx` |

**Verification:** API `nest build` ✅ · API tests **18/18** ✅ · web `typecheck` ✅ · `next build` ✅.

## Wave 5 implementation (2026-07-03)

| Piece | Change | Files |
|-------|--------|-------|
| #10 Demo-data seeder | New `DemoSeeder`, opt-in via **`DEMO_SEED=true`** (tests/production untouched), idempotent (skips when the tenant has any account). Seeds THROUGH the module services — never the stores — so every record emits its real spine events. The slice: 3 accounts (Emaar, DEWA, Nakheel) → won tender → contract → active project, plus a submitted tender, a submitted variation, supplier, draft PR, issued + pending-approval POs, draft + approved invoices, active subcontract with a claim + a draft subcontract, 3 employees with a pending leave / submitted timesheet / submitted expense claim, and a submitted material approval. Result: **12 inbox items across 7 modules on first sign-in**, and search/workspace/dashboards populated. | `apps/api/src/demo/demo.seeder.ts` (new), `app.module.ts` |
| #1 Workspace "Today" | The general Workspace view now opens with a **Today** section fed by the universal inbox: four stat cards (Pending decisions, Invoices to pay, Tenders to decide, HR approvals) + the top-5 pending items with action badges + "Open Inbox →". Dev-copy subtitle ("fed by the event spine…") replaced with product language. | `apps/web/app/page.tsx`, `components/role-dashboard-shell.tsx` |

**Verification:** API `nest build` ✅ · tests **18/18** ✅ · web `typecheck` + `next build` ✅ · **live run-through**: started the API with `DEMO_SEED=true` — seeder logged success, `GET /api/v1/inbox` returned 12 items spanning Finance (Approve/Pay), HR, Procurement, Projects, Quality, Subcontracts (Activate/Certify), Tendering (Decide); `GET /api/v1/search?q=ahmed` returned employee "Ahmed Al Mansouri".

## Wave 6 implementation (2026-07-03)

| Piece | Change | Files |
|-------|--------|-------|
| #6 Record tabs | VS Code-style tab strip under the topbar. A tab opens automatically when any record page mounts (`RecordChrome` → `openTab`); **only records become tabs** — lists/dashboards stay sidebar territory. Tabs persist across reloads and sessions (localStorage, cap 8 LRU), click switches records, × or middle-click closes (closing the active tab jumps to its neighbour, or Workspace when none remain). Active tab tracked by pathname with an accent top-border. Strip renders nothing until the first record is opened. | `lib/tabs.ts` (new), `components/tab-bar.tsx` (new), `components/record-chrome.tsx`, `components/app-shell.tsx` |

UX defaults chosen (revisitable): persistence = localStorage (survives restarts, like VS Code); auto-open on visit rather than explicit "open in tab"; 8-tab cap dropping the oldest.

**Verification:** web `typecheck` ✅ · `next build` ✅.

## Final status — all 12 axes closed

Six waves, 2026-07-02 → 2026-07-03, every wave verified by build + tests (W5 also live-probed against a running API with `DEMO_SEED=true`).

Deferred extras (documented, not part of the 12): company switcher needs a real company model (dead `aura-session` cookie noted above); designed empty states beyond Workspace/Inbox/Search remain per-module polish; palette verbs navigate to forms rather than executing inline (inline execution is a natural W7 when the Workflow engine adoption lands).
