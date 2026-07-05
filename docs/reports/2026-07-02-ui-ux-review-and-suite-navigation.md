# UI/UX Review + Suite Navigation Restructure — 2026-07-02

Live walkthrough of the web app (worktree stack: API :4100 with `AUTH_JWT_SECRET`, web :3100) as `u-admin`. All findings verified in the browser, all fixes re-verified live.

## Changes shipped

| # | Change | Files |
|---|--------|-------|
| 1 | **Suite navigation (enterprise IA)** — sidebar reduced from ~70 flat links to 20 suites in 7 sections (Workspace / Sales / Delivery / Operations / Finance / People / Platform); the active suite's pages render as a horizontal tab strip in the header, so sibling pages are one click away | `components/nav.ts` (rewritten: `SECTIONS`, `findSuite`, `findActiveItem`; `ALL_ITEMS` kept for ⌘K palette), `components/app-shell.tsx` |
| 2 | **Finance split** — 18 finance links split into Finance (AR/AP/cash/banking, 10 tabs) and Accounting (GL/statements/budgets/tax, 8 tabs) | `components/nav.ts` |
| 3 | **Bug: AR Aging always "API offline"** — page called `/api/finance/ar-aging`, which does not exist; real endpoint is `customer-invoices/aging` | `app/finance/ar-aging/page.tsx` |
| 4 | **Bug: AP Aging always "API offline"** — same, now `invoices/aging` | `app/finance/ap-aging/page.tsx` |
| 5 | **Mobile support** — <900px: sidebar collapses to hamburger overlay drawer (backdrop, auto-close on navigate); compact search button | `components/app-shell.tsx` |
| 6 | **Styled 404** — was a bare black screen; now in-shell with ⌘K hint + "Back to My Work" | `app/not-found.tsx` (new) |
| 7 | **React console errors** — `border` shorthand mixed with `borderColor` longhand (React 19 warns on every rerender) | `crm-pipeline-client.tsx`, `attendance-client.tsx`, `mar-client.tsx`, `salik-client.tsx` |
| 8 | Sidebar density — all 20 suites fit a laptop viewport without scrolling | `components/app-shell.tsx` |

Verified: `tsc --noEmit` clean; eslint clean on changed files (1 pre-existing warning untouched); light + dark themes; mobile (375px) + desktop; ⌘K palette still indexes every page.

## End-user journey verified live

Login → workspace → CRM lead create (Ahmed Al Mansouri / Emaar) → opportunity create ($2.5M, KPIs update live) → stage → **won** → Tender auto-created downstream ($2.5M, Draft) → workspace home shows the event trail (4 events, activity by area). The deal-chain automation is real and visible to the end user.

## Dev-environment note

`next dev` after `next build` in the same tree breaks middleware loading (`adapterFn is not a function`, every page 500s) — the prod `middleware.js` in `.next/` conflicts with Turbopack dev. Fix: delete `apps/web/.next` before starting dev.

## Open UX gaps (not fixed — need product decisions)

| Gap | Where | Why it matters |
|-----|-------|----------------|
| "API offline." shown for any non-OK response (incl. 404/403) | ~20 pages using `getJson` null-collapse | Misleading — masked the aging-endpoint bug; distinguish unreachable vs error |
| Dev jargon in end-user copy ("emits `crm.opportunity.stage_changed` on the spine") | Page subtitles across modules | Fine for dev demos; not enterprise product voice |
| Login page leaks dev internals (password placeholder, 403 note); AI dock renders pre-auth | `app/login/page.tsx`, `components/ai-dock.tsx` | Polish before any external demo |
| Lead rows are display-only (no qualify→opportunity action; opportunity links lead via dropdown only) | CRM pipeline | Extra friction in the core sales flow |
| Company switcher is simulated client-state only | `app-shell.tsx` | Reload keeps HQ; fine for now, flagged in code |
| No demo-data seeder — every module starts empty | API | First-run experience is all empty states; a `--demo` seed would make evaluation dramatically better |
