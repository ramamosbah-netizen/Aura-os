# Report — Phase 0c.2: AI dock (kernel AiService in the shell)

**Date:** 2026-06-24 · **Repo:** `Desktop/aura-os` (local, branch `main`) · **Increment:** Phase 0c step 2 — the AURA differentiator, made tangible.

> The kernel's AI seam (0b.3) becomes a persistent assistant in the web shell — and it's wired so adding a key turns on real Claude with no code change.

---

## What was built

**API (`apps/api`)** — `AiController` (`/api/ai`), wired into `AppModule`:
- `POST /api/ai/complete` → `AiService.complete({ system, messages:[{role:'user',content:prompt}] })`.
- `GET /api/ai/provider` → `{ provider }` (`claude` | `local`).

**Web (`apps/web`)**:
- `app/api/ai/route.ts` — a **Route Handler (backend-for-frontend)**: the browser POSTs same-origin; the handler forwards server-side to the Nest API (`AURA_API_URL`). The browser never sees the API URL or any future model key, and there's no CORS surface. (Built per the Next 16 route-handler docs: `export async function POST(request: Request)`, `await request.json()`, `Response.json()`.)
- `components/ai-dock.tsx` — `'use client'` dock: a floating "✦ Ask AURA" button that opens a chat panel (message thread, input, provider badge, loading + error states). Posts to `/api/ai`.
- Mounted persistently in `app/layout.tsx` (a client component inside the server layout).

## Verified

- `pnpm build` → **4/4**; the web build now lists `ƒ /api/ai` (dynamic route handler) alongside `ƒ /`.
- **Live**: started API (:4000) + web (:3000).
  - `GET /api/ai/provider` → `{"provider":"local"}`.
  - `POST /api/ai` (web BFF) → `{"text":"[local-ai] … echoing your input: Summarize my workspace","model":"local","provider":"local","stopReason":"end_turn"}` — full path browser → web route handler → Nest API → `AiService` → back.
  - Dock SSR'd: "Ask AURA" present in the page HTML.

## Decisions

- **BFF, not direct browser→Nest** — keeps the API URL and (future) key server-side, sidesteps CORS, and gives the web app one seam to evolve. The standard Next 16 pattern.
- **Reuses the kernel seam** — zero AI logic in the web app; it calls `AiService`. Local-echo today; set `ANTHROPIC_API_KEY` on the API and it's real Claude (`claude-opus-4-8`) with no code change.
- **Persistent in the layout** — the dock is part of the shell, not a page, so it's available everywhere as modules land.

## Next — Phase 0c.3+

The **hub/nav shell** (grouped, overflow-aware navigation — reuse the NEW-ERP IA map) and the **command palette** (⌘K). Then richer **My-Work** (approvals/tasks aggregated from the Workflow engine + Access platform). Then **T1** modules on the completed kernel.
