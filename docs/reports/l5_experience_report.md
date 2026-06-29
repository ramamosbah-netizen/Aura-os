# AURA OS — L5 Experience (Frontend) Technical Report

> **Location:** `apps/web/` (managed as the `@aura/web` package)  
> **Framework:** Next.js (App Router) · React 19 · Vanilla CSS Modules  
> **BFF Pattern:** Next.js Route Handlers forward authorization headers and session cookies to the NestJS API.  
> **Status:** Web shell and 37 client interfaces are operational. Key dashboard screens are fully interactive.

---

## 1. Frontend Architecture & BFF Pattern

The **L5 Experience Layer** serves as the unified interface shell of AURA OS. It is built as a Next.js App Router workspace package.

To enforce strict security boundaries, the web client communicates with the backend via a **Backend-for-Frontend (BFF)** proxy pattern. All fetch operations pass through Next.js server actions or route handlers (BFF) located in `apps/web/app/api/`. These route handlers read the secure, HTTP-only session cookie and inject the user's bearer identity token before routing the request to the NestJS API:

```
┌──────────────┐         (Fetch)          ┌───────────────────┐        (REST / JWT)        ┌──────────────┐
│  Next.js UI  │ ───────────────────────► │ Next.js BFF Route │ ─────────────────────────► │  NestJS API  │
│  Components  │                          │  (app/api/...)    │                            │  (Port 4000) │
└──────────────┘                          └───────────────────┘                            └──────────────┘
```

This pattern prevents exposing API URLs and security tokens directly to the client browser.

---

## 2. Shell & Workspace Controls

The app shell coordinates global navigation, AI assistance, and shortcuts:

* **App Shell Layout (`app-shell.tsx`):** Implements a collapsible left rail containing five navigation groups (Core, Deliver, Quality & Safety, Operations, Admin) comprising 24 navigation targets.
* **AI Copilot Dock (`ai-dock.tsx`):** A collapsible right sidebar panel that enables real-time conversations with the AI platform. It supports markdown rendering and suggests workspace actions.
* **⌘K Command Palette (`command-palette.tsx`):** Instantly activated by the standard keyboard shortcut. It parses active routes, menu options, and search queries for quick navigation.
* **Unified Work Center (`work-center.tsx`):** A consolidated inbox/dashboard showcasing pending workflow approval requests (PR approvals, subcontractor claims, invoice payments) sorted by urgency.

---

## 3. Role-Based Portals

The home page routes to specialized dashboards depending on the logged-in user profile:

```
                             ROLE PORTAL SHELL
      ┌──────────────────────────────┼──────────────────────────────┐
      ▼                              ▼                              ▼
┌──────────────┐              ┌──────────────┐              ┌──────────────┐
│ CEO Dashboard│              │ CFO Portal   │              │ PM Dashboard │
│  (Company    │              │  (COA, GL,   │              │  (WBS, EVM,  │
│  Metrics)    │              │   Invoices)  │              │   Delays)    │
└──────────────┘              └──────────────┘              └──────────────┘
```

1. **CEO Command Center (`ceo-command-center.tsx`):** Renders high-level pipeline stats, won/lost ratios, overall safety compliance rates, and system-wide audit timelines.
2. **CFO Portal (`cfo-portal.tsx`):** Exposes the General Ledger, Chart of Accounts, tax dashboards (`tax-dashboard.tsx`), and records balanced journal payout transactions.
3. **PM Dashboard (`pm-dashboard.tsx`):** Renders schedule metrics, active project cost center variances, and rolled-up project margins.

---

## 4. High-Fidelity Domain Workspace Components

The UI contains several large client modules with comprehensive controls:

* **Project Detail Workspace (`project-detail.tsx` - 78.5KB):** 
  - The single largest component in the experience layer.
  - Renders the interactive WBS tree grid with Gantt-like progress bars, CBS budgets, committed PO cost matrices, delay logs, and variation approvals.
* **Tender Detail Workspace (`tender-detail.tsx` - 34.5KB):**
  - Features an Excel-like spreadsheet table for dot-hierarchy Bill of Quantities (BOQ) item editing.
  - Includes a simulated **✦ AI OCR Sourcing Modal** that animates document layout scanning, rate cross-referencing, and automatic BOQ structuring.
* **HR Control Workspace (`hr-control-client.tsx` - 31KB):** 
  - Manage employee profiles, track visa compliance, approve leave requests, and disburse monthly payroll.
* **Subcontracts Claims Register (`subcontracts-list.tsx` - 22.3KB):** 
  - Track subcontracts, submit progressive Interim Payment Certificates (IPCs), and automate 10% retention deductions.
* **DocControl & Correspondence (`doccontrol-client.tsx` - 19.4KB):** 
  - Official transmittals sender and incoming correspondence tracker.
* **QSE Registers (`hse-control-client.tsx` & `quality-control-client.tsx`):** 
  - Incident reporters, Permit to Work (PTW) boards, non-conformance registers (NCR), and site punch lists.

---

## 5. UI Gaps & Backlog Items

The following experience features are scheduled for development in future phases:

* **AMC GIS Dispatch Board:** Needs a GIS map view (Google Maps/Mapbox) to track active work order pins and drag-and-drop technician assignments.
* **BPMN Workflow Designer:** Exposing the `@aura/core` workflow orchestrator graphically using React Flow or bpmn-js.
* **Theme & Density Settings:** UI theme toggles (Dark/Light Mode) and table density presets (Compact/Cozy).

---
