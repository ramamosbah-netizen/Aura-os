<!-- AURA OS — Step F1 Report: Subcontracts UI & Navigation Integration -->
# Step F1 — Subcontracts UI & Navigation Integration

**Date:** 2026-06-26  
**Status:** ✅ Complete  
**Build:** 24/24 tasks successful, 0 errors  
**Tests:** All 22 workspace tests passing  

---

## What was done

### 1. BFF API Route Integration (`apps/web/app/api/subcontracts/...`)
Created a set of Next.js App Router route handlers to proxy client-side requests with user identity to the NestJS Subcontracts API:
- `apps/web/app/api/subcontracts/route.ts` — GET list of subcontracts and POST creation of new subcontracts.
- `apps/web/app/api/subcontracts/[id]/status/route.ts` — PATCH status change (Activate, Close).
- `apps/web/app/api/subcontracts/claims/route.ts` — GET list of claims and POST new progressive claims.
- `apps/web/app/api/subcontracts/claims/[id]/certify/route.ts` — PATCH certify progressive claim.
- `apps/web/app/api/subcontracts/claims/[id]/pay/route.ts` — PATCH mark claim as paid.

### 2. Client Components for Creation & Interaction
- **SubcontractCreate (`apps/web/components/subcontract-create.tsx`)**
  - Renders a clean interface for registering a subcontract.
  - Linked to active projects using a select dropdown.
  - Form validations for subcontract title, subcontractor name, value, and retention percentage (defaults to `10.0%`).
- **SubcontractsList (`apps/web/components/subcontracts-list.tsx`)**
  - Displays all registered subcontracts with their Project, Value, Retention, and Status.
  - Features expandable details rows showing progressive claims (Interim Payment Certificates) in a sub-table.
  - Allows inline submission of progressive claims (cumulative gross work completed).
  - Handles status transitions (Draft -> Active -> Closed) and claim lifecycle actions (Submit -> Certify -> Pay).

### 3. Server Page Router (`apps/web/app/subcontracts/subcontracts/page.tsx`)
- Renders the main dashboard for subcontracts, fetching all subcontracts, active projects, and progressive claims concurrently from the backend APIs.
- Degrades gracefully with an "API offline" panel if the backend server cannot be reached.

### 4. Navigation & Sidebar Hook (`apps/web/components/nav.ts`)
- Added **Subcontracts** to the main sidebar configuration under the **Operate** group with the glyph `▧`.

---

## Verification Results

- Verified monorepo typescript compilation with `pnpm typecheck` (all 24 tasks completed with zero errors).
- Validated UI structure and API route bindings.
