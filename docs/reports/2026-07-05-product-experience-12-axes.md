# Product-Experience Pass — 12 Axes — 2026-07-05

Response to the "12 محاور / Product Experience" brief. Goal: move from strong modules to an integrated enterprise product. Built on branch `claude/jolly-faraday-3901d4` (same branch as the suite-navigation restructure). Every axis verified live (worktree stack: API :4100 with `AUTH_JWT_SECRET`, web :3100, seeded via `pnpm --filter @aura/api seed:demo`). Build 22/22 green; API search tests 6/6; tsc + eslint clean on all changed files.

## What shipped, per axis

| # | Axis | Status | What was done |
|---|------|--------|---------------|
| 1 | Workspace as work hub | ✅ | "Today" row on the workspace: **Pending approvals** (→ /inbox), **Invoices to pay** (count + AED total), **Open tenders**, **Active projects** — each a live, linked card. Replaced the low-value "recent events / documents / active areas" stats. |
| 2 | Real global search | ✅ | Expanded `SearchService` fan-out from 6 to **9 entity types** — added Leads, Opportunities, Employees. "Ahmed" → the lead; "Downtown" → Opportunity + Tender + Contract + Project + PO in one list. Each module wrapped defensively so one failure can't sink the search. |
| 3 | Universal Inbox | ✅ | New `/inbox` page — every pending approval/action in one queue (PRs, invoices, subcontracts, claims) with approve/reject/pay/certify actions. Reuses the proven WorkCenter engine. Live-tested: approving a PR dropped the badge 2→1. Added to nav with 📥. |
| 4 | Recent items | ✅ | `lib/recent-items.ts` (localStorage, 12 max); app-shell records each page visit; ⌘K palette shows a **Recent** group (clock glyph) on open for fast return. |
| 5 | Breadcrumbs | ✅ | Header shows **Section › Suite › Page** (e.g. "Sales › CRM › Sales Pipeline"), derived from the nav model. |
| 6 | Command palette → command center | ✅ | Added an **Actions** group (Create Lead/Account/Quotation/Tender/PO/Invoice/Project, Open Inbox) alongside Records + Navigate. Switched matching to **token-based** (order-independent) so "create invoice" matches "Create Supplier Invoice". |
| 7 | (dup of 3 in brief) | ✅ | Covered by Universal Inbox. |
| 8 | Context-aware AI dock | ✅ | Dock suggestions now change by route: on a Tender page → "Analyze the open tenders", "Estimate the margin", "Generate a risk summary"; Finance → aging/cash prompts; per module. Also hidden on /login. |
| 9 | Activity feed filters | ✅ | New `ActivityFeed` component: **module chips** (CRM 18, Tendering 2, …) + **period** selector (24h/7d/30d/all), rendering **human labels** instead of `crm.opportunity.stage_changed`. |
| 10 | Empty states → demo data | ✅ | `apps/api/scripts/seed-demo.mjs` (`pnpm --filter @aura/api seed:demo`) posts a realistic UAE contracting dataset through the API: 5 accounts, 4 leads, 5 opportunities (2 won → tenders auto-created), 2 contracts + projects, and a PO→PR→invoice spend loop. |
| 11 | Product language | ✅ | Removed event-code jargon (`*.created … on the spine`, "from the kernel") from 12 page subtitles + workspace + AI dock. Added `lib/event-labels.ts` humanizer used by the activity feed. |
| 12 | Enterprise login | ✅ | Split-panel enterprise sign-in (brand story + value props left, focused form right). Removed dev password hint and the 403 note; blank username default; AI dock no longer renders pre-auth. |
| — | Record tabs (VS Code-style) | ⏸ **Deferred** | Needs per-record **detail routes for every entity** (don't exist yet — modules are list + inline-create) plus a persistent tab manager. Its own workstream. Recents (4) + breadcrumbs (5) cover the context-retention need for now. |

## New / changed files

**Web** — `components/nav.ts` (Inbox item, `findSection`), `components/app-shell.tsx` (breadcrumb, recents tracking), `components/command-palette.tsx` (actions, recents, token match), `components/ai-dock.tsx` (context suggestions), `components/role-dashboard-shell.tsx` (Today hub, ActivityFeed), `components/activity-feed.tsx` (new), `lib/event-labels.ts` (new), `lib/recent-items.ts` (new), `app/inbox/page.tsx` (new), `app/login/page.tsx` (rewrite), 12 module page subtitles.

**API** — `src/search/search.service.ts` (+leads/opportunities/employees, defensive), `src/search/search.service.test.ts` (updated ctor + 2 new tests), `scripts/seed-demo.mjs` (new), `package.json` (seed:demo script).

## Verification notes

- Deal-chain global search verified live through the ⌘K palette (Records group).
- Inbox approval verified end-to-end (badge + tab counts update on approve).
- Command palette Actions verified: "create invoice" → lands on /finance/invoices with the create form + correct breadcrumb.
- Context AI dock verified: tender page shows tender-specific prompts.
- **Preview screenshot tool times out on the app** (backdrop-blur sticky headers + radial gradient stress the headless capture); pages are healthy (200s, no console errors) and were verified via DOM snapshot/eval instead.

## Still open (product decisions, not built)

- Axis 6/12 record tabs — see deferral above.
- Search still omits Documents/Assets/AMC tickets (no `emails` module exists). Easy follow-on once those list APIs are confirmed.
- "Notifications", "Meetings", "Risks", "AI Summary" from the axis-1 wishlist are not yet on the Today hub — needs backing data/services.
