<!-- AURA OS — Step F2 Report: Projects WBS & EVM UI -->
# Step F2 — Projects WBS & EVM UI

**Date:** 2026-06-26  
**Status:** ✅ Complete  
**Build:** 24/24 tasks successful, 0 errors  
**Tests:** All 22 workspace tests passing  

---

## What was done

### 1. BFF API Route Integration (`apps/web/app/api/projects/...`)
Added Next.js App Router route handlers to support interactive WBS tree editing:
- `apps/web/app/api/projects/wbs/route.ts` — GET list of WBS nodes and POST creation of new WBS nodes (linked to parent task code or root).
- `apps/web/app/api/projects/wbs/[id]/progress/route.ts` — PATCH leaf task progress percentage (0-100%) and Status (`pending`, `in_progress`, `completed`).

### 2. Client Components for WBS Editing & EVM Summary
- **ProjectDetail (`apps/web/components/project-detail.tsx`)**
  - Renders a clean grid layout presenting the five primary Earned Value Management (EVM) indices:
    - **Planned Value (PV)** — Budgeted baseline.
    - **Earned Value (EV)** — Work done baseline.
    - **Actual Cost (AC)** — Actual committed invoicing spend.
    - **Cost Performance Index (CPI)** — Status colors (Green >= 1.0, Red < 1.0).
    - **Schedule Performance Index (SPI)** — Status colors (Green >= 1.0, Red < 1.0).
  - Renders the recursive **WBS Tree Table**:
    - Indents task titles automatically by hierarchy level.
    - Displays progress indicators (percentage and slider) for all tasks.
    - Enables inline sliders and status drop-downs specifically on leaf nodes (non-parents).
    - Features a slide-out inline creation form to add recursive child tasks under any WBS parent.

### 3. Server Page Router (`apps/web/app/projects/projects/page.tsx`)
- Modified signature to parse `searchParams` and extract the selected `projectId`.
- If a project is selected:
  - Fetches the recursive task list from `wbs` API.
  - Fetches the project-wide EVM rollups from `projects/:id/evm` API.
  - Renders the `ProjectDetail` component in a bottom-pane layout.
- Added styling and query-param links to the project table titles to support selection.

---

## Verification Results

- Verified monorepo typescript compilation with `pnpm typecheck` (all 24 tasks completed with zero errors).
- Validated UI and API route bindings.
