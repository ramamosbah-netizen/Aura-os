# Report — Phase 0c.1: Web shell + Workspace v1 (Next.js 16)

**Date:** 2026-06-24 · **Repo:** `Desktop/aura-os` (local, branch `main`) · **Increment:** Phase 0c step 1 — the experience shell begins. The kernel finally becomes visible.

> Per `AGENTS.md` ("this is NOT the Next.js you know"), I installed Next first, then **read the bundled docs in `node_modules/next/dist/docs/`** before writing any web code — Next resolved to **16.2.9**, a major version beyond training data.

---

## Next 16 deltas I accounted for (from the bundled docs)

- **Turbopack is the default** bundler for `next dev`/`next build` — no `--turbopack` flag; do **not** add a webpack config (build fails if one is found).
- **`next lint` removed**; `next build` no longer lints. Scripts are `dev`/`build`/`start` only.
- **Async Request APIs**: `params`, `searchParams`, `cookies()`, `headers()` are all Promises now — must be `await`ed.
- **App Router**, Server Components by default; data fetched by `await fetch(...)` (uncached ⇒ dynamic).
- `serverRuntimeConfig`/`publicRuntimeConfig` removed → read `process.env` server-side; `NEXT_PUBLIC_` for the client.

## What was built (`apps/web`)

- Scaffold: `package.json` (Next 16 + React 19), `tsconfig.json` (Next-managed), `next.config.ts` (minimal), `next-env.d.ts`.
- `app/layout.tsx` — required root layout; `app/globals.css` — dark "command-center" theme.
- `lib/api.ts` — server-side `getJson()` against the API (`AURA_API_URL`, default `http://localhost:4000`); returns `null` on failure so the UI degrades gracefully.
- `app/page.tsx` — **Workspace "My Work" v1**: a Server Component (`force-dynamic`, `no-store`) that fetches the **live event stream** (`/api/events`) + documents (`/api/documents`) and renders: an API-status pill, stat cards (recent events / documents / active areas), **activity-by-area** bars (events grouped by module prefix), and a **recent-activity** feed. Clean "API offline" state when the backend is down.

## Verified

- `pnpm build` → **4/4** (shared → core → api → **web**). Turbopack: "Compiled successfully"; route `/` is `ƒ (Dynamic)` (server-rendered per request); TypeScript checked.
- **Runs**: started API (:4000) + `next start` (:3000); fetched `/` → 26 KB HTML with `<h1>My Workspace`, **"API online"**, and live **`dms.document.*`** events + document data pulled server-side from Postgres. Full stack (Next 16 SC → Nest API → Supabase) confirmed end-to-end.

## Decisions

- **Workspace = the event spine made visible**, not a chart wall — the home shows real cross-module activity from `/api/events`, reinforcing the event-driven core.
- **Server Components fetch the API directly** — no client data-fetching library yet; add SWR/React Query only when a view needs client interactivity.
- **Plain CSS dark theme for now** — deliberately no Tailwind/design-system yet (the UX/IA audit flagged a dual-token mess to avoid); a real design system comes when the nav/hub shell lands.
- **Graceful degradation** — the shell renders with or without the API up, so `next build`/`next start` never depend on a running backend.

## Next — Phase 0c.2+

The hub/nav shell (grouped, overflow-aware navigation — reuse the NEW-ERP IA map as reference), the **command palette**, and the **AI dock** (wired to the kernel `AiService`). Then richer "My Work": real approvals/tasks aggregated from the Workflow engine + Access platform. Then **T1** modules on the completed kernel.
