# Frontend Review

**Score: 6.5 / 10** — modern stack, coherent server-component data pattern, and genuinely excellent cockpit UIs where invested. Dragged down by a depth cliff across delivery verticals, mega-components, missing loading/error states, and no client data layer.

## 1. Stack & rendering model

- **Next.js 16 App Router + React 19** (`apps/web/package.json`). Very current.
- **No UI component library** — Tailwind (`globals.css`) + `lucide-react` icons + `jspdf`. The entire design system is **hand-rolled**. This is a double-edged sword: full control and a consistent house style (per memory: navy+amber ELV theme, the 360-record shell), but every primitive (tables, drawers, modals) is bespoke and must be maintained in-house.
- **No client state/data library** — `useSWR`/react-query/zustand/redux = **0 files**. 

## 2. The data pattern (consistent, but dated)

Confirmed shape (e.g. `apps/web/app/crm/accounts/page.tsx`):
1. Page is a **server component** (only 6 of 133 pages are `"use client"`).
2. It calls `getJson<T>()` from `apps/web/lib/api.ts` (server-side fetch to `AURA_API_URL`).
3. `export const dynamic = 'force-dynamic'` — no caching; every navigation is a fresh server round-trip.
4. Data is **prop-drilled** into one large `*-client.tsx` component that owns all interactivity.
5. Mutations POST to the API then rely on `router.refresh()` (full server re-render).

**Consequences:**
- ✅ Simple mental model; server owns data; no client cache invalidation bugs.
- ❌ No optimistic UI, no background revalidation, no partial updates — every mutation is a full-page server round-trip.
- ❌ `force-dynamic` everywhere defeats Next.js caching/ISR; TTFB is bound to API latency.
- ❌ With **0 `loading.tsx` and 0 `error.tsx`** files, there are no route-level Suspense skeletons or error boundaries — a slow or failing API yields a blocked page or an unstyled crash, not a graceful state.

## 3. Component health

- **166 components**; several are **mega-components**: `project-detail.tsx` (1,899 lines), `tender-detail.tsx` (1,447), `engineering-client.tsx` (1,235), `crm-pipeline-client.tsx` (1,095), `ai-admin-client.tsx` (984).
- These ship as `"use client"` → large JS bundles to the browser, hard to test, hard to code-review, and a re-render performance risk. They should be decomposed into presentational sub-components + hooks.
- **162 client components** total — a lot of interactivity is client-side despite the server-component page shell.

## 4. Navigation & information architecture

- Recently overhauled into a **SAP/Salesforce-style model** (memory: Experience Architecture): flat sidebar selects a *workspace*, a horizontal workspace tab-row, hideable sidebar (⌘B), Operations as a two-level workspace (10 domains × sub-tabs), Overview-first cockpits, a ⌘J Copilot dock, ⌘K command palette. `apps/web/components/{app-shell,nav}.tsx`.
- This is a strong, modern IA — arguably the product's best UX asset. It is, however, **only as good as the pages behind it**: many workspace tabs lead to thin or absent screens (see §5).

## 5. The depth cliff (the defining frontend problem)

Web pages per module (measured):

| Deep (cockpit-grade) | Thin / stub |
|---|---|
| Finance 21 · CRM 19 · HR 9 · Procurement 7 · Inventory 6 | **Engineering 1** · **Doc Control 1** · HSE 2 · Site 2 · AMC 2 · Assets 2 · Quality 3 · Fleet 3 · Tendering 4 |

Engineering (36 backend files → 1 page) and Doc Control (25 → 1) are the extremes. The verticals that make this an **ELV/construction** ERP — engineering, site, quality, HSE, doc control, commissioning/handover, field service — are exactly the ones with the thinnest UIs. A CRM/Finance user sees a finished product; an engineer or site technician sees a placeholder. This is the #1 frontend priority (see [`11-ERP-FUNCTIONALITY-REVIEW.md`](11-ERP-FUNCTIONALITY-REVIEW.md), [`12-USER-EXPERIENCE-REVIEW.md`](12-USER-EXPERIENCE-REVIEW.md)).

## 6. Accessibility & responsiveness

- Hand-rolled components mean a11y is opt-in per component — no library baseline (ARIA roles, focus traps, keyboard nav) to inherit. High risk of gaps in modals, drawers, tables. **Not audited automatically; recommend an axe/Lighthouse pass.**
- Responsiveness / mobile: cockpit layouts are desktop-first; field verticals (where mobile matters most for technicians) are the least built. No evidence of a mobile/PWA field app. Major gap for ELV field service.

## 7. Consistency

- Strong within the design system (360-record shell, create-drawer pattern, KPI cards) — memory documents deliberate primitives (`record-shell.tsx`, `ui/create-drawer.tsx`).
- Inconsistent *coverage*: newer modules adopt the shell; older/thin ones don't.

## Recommendations (ranked)

1. **Close the depth cliff** for delivery verticals — turn 1-page stubs into working cockpits (Engineering, Doc Control, Site, Quality, HSE first). This is where the ERP-vs-CRM gap lives.
2. **Add `loading.tsx` + `error.tsx`** at each workspace segment for graceful loading/error states.
3. **Introduce a client data layer** (React Query/SWR) for mutation-heavy screens to get optimistic UI + revalidation instead of full-page `router.refresh()`.
4. **Decompose mega-components** (>800 lines) into sub-components + hooks; move non-interactive parts back to server components to shrink bundles.
5. **Consume `@aura/sdk`** in `lib/api.ts` for end-to-end type safety instead of hand-typed `getJson<T>`.
6. **Run an accessibility + Lighthouse audit**; adopt a headless-primitive baseline (e.g. Radix) for modals/menus/tables to inherit a11y.
7. **Build a mobile/field surface** (PWA) for technician/site workflows.
