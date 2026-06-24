# Report — Phase 0c.3: App frame — sidebar nav + ⌘K command palette

**Date:** 2026-06-24 · **Repo:** `Desktop/aura-os` (local, branch `main`) · **Increment:** Phase 0c step 3 — two floating pages become a real platform shell.

---

## What was built (`apps/web`)

- `components/nav.ts` — **single source of truth** for navigation (groups + items), consumed by both the sidebar and the command palette so they never drift.
- `components/app-shell.tsx` (`'use client'`) — the persistent frame: a left **sidebar** (brand + grouped nav with active highlighting via `usePathname`) and a sticky **top bar** with the command-palette trigger. Owns the palette open-state + the global **⌘K / Ctrl-K** shortcut. Renders `{children}` (pages stay server-rendered — the RSC-as-children pattern).
- `components/command-palette.tsx` (`'use client'`) — ⌘K overlay: fuzzy filter over the nav, ↑/↓ + Enter to jump (`useRouter().push`), Esc/click-out to close.
- **Destination pages** (so the nav isn't hollow): `app/documents/page.tsx` (DMS document table) and `app/events/page.tsx` (the event stream) — Server Components fetching the API (`force-dynamic`).
- Refactors: `app/layout.tsx` now wraps `{children}` in `<AppShell>`; `app/page.tsx` (Workspace) dropped its own brand/top bar (the shell owns those) and its `<main>` → `<div>` (the shell provides the single `<main>`).

## Verified

- `pnpm build` → **4/4**; web routes: `ƒ /`, `ƒ /documents`, `ƒ /events`, `ƒ /api/ai`.
- **Live SSR probes** (API + `next start`):
  - `/` → brand "AURA", nav "My Work/Documents/Events", "Search or jump to…" trigger, "My Workspace" content — the frame wraps the page.
  - `/documents` → "Main Contract" (the earlier DMS doc) in a real table.
  - `/events` → the live `dms.document.*` / `kernel.*` stream.

## Decisions

- **One nav source** (`nav.ts`) feeds sidebar + palette — adding a module is one entry, both surfaces update.
- **Client shell, server pages** — `AppShell` is client (keyboard + state) but pages render on the server and pass through as `children`; no data leaks into the client frame.
- **Palette is navigation-only for now** — actions (New document, Emit event, jump-to-record) slot into the same list later.
- **Pages are thin Server Components** over the API — consistent with the Workspace; no client data library yet.

## Next — Phase 0c (wrap-up) → T1

Richer **My-Work** (approvals/tasks aggregated from the Workflow engine + Access platform — the "universal inbox" idea), then **T1**: the first business module (**CRM**) as a clean vertical slice on the completed kernel + shell.
