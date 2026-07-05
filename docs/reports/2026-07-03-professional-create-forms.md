# Professional Create Forms — Slide-over Drawer Overhaul

**Date:** 2026-07-03 · **Branch:** `claude/vibrant-feistel-c4213d` · **Commit:** `95961f3`

## Problem (user feedback)

> "app not looking beautiful … almost of function missing … when create something
> should open form or do something professional"

Verified against the live app: every create surface in the product was a
one-line inline "quick-add" strip (single text box + button). The backend
already accepted far richer data than the UI exposed, and several BFF routes
stripped fields the API supports (accounts forwarded only `name`).

## What shipped

### 1. Reusable drawer form system — `apps/web/components/ui/create-drawer.tsx`

Config-driven slide-over (right panel) opened from a `+ New X` primary button:

| Capability | Detail |
|---|---|
| Field kinds | text, number, select, date, textarea, **lines** (VAT line-items editor with live subtotal) |
| Validation | required markers, inline error highlight, required-summary in footer |
| Deal-chain inheritance | select options carry `fills` (prefill visible fields) and `extra` (hidden payload keys) — picking a won tender fills contract title/value and carries accountId/Name |
| Feedback | error banner from API message, success toast, `router.refresh()` |
| A11y/UX | ESC + backdrop close, aria-modal, focus rings, animation |

### 2. Design system in `globals.css`

Buttons (`.btn`, `.btn-primary`, `.btn-ghost`), inputs with focus rings,
drawer, badges (`.badge-good/-warn/-bad/-accent`), `.data-table` with row
hover, toast; semantic color tokens (`--warn`, `--*-soft`, shadows, overlay)
in both dark and light themes. Drawer z-index sits above the AI dock.

### 3. Converted surfaces (14 create flows, 12 entities)

| Entity | Component | New fields exposed |
|---|---|---|
| Account | account-create | status, industry, website |
| Lead | crm-pipeline-client | company, email, phone, source |
| Opportunity | crm-pipeline-client | value, stage, account, lead links |
| Quotation | quotations-client | issue date + full VAT line items |
| Tender | tender-create | reference, status, account, value |
| Contract | contract-create | won-tender inheritance, reference, status |
| Project | project-create | active-contract inheritance, reference, status |
| Supplier | suppliers-client | code, category, trade licence, TRN, contact, email, phone |
| Purchase Request | pr-list | reference, project link, value |
| Purchase Order | po-create | reference, project link, supplier |
| Supplier Invoice | invoice-create | received-PO inheritance, reference, supplier |
| Customer Invoice | customer-invoices-client | issue date, project + VAT line items |
| Subcontract | subcontract-create | retention %, project (required) |
| GRN | grn-create | issued-PO inheritance |

### 4. BFF routes un-stripped

`crm/accounts` (+status/industry/website), `tendering/tenders`,
`contracts/contracts`, `projects/projects` (+reference/status),
`procurement/purchase-orders`, `finance/invoices` (+reference).

### 5. Fixed a refresh bug

`quotations-client`, `suppliers-client`, `customer-invoices-client` held list
state in `useState(initialProps)`, so `router.refresh()` never showed new
records. They now render from server props directly.

## Verification (live, ports 4200/3200)

- Account "Aldar Properties" created via drawer with industry — persisted, badge shown.
- Quotation QT-2026-014 with one line 185,000 → API computed 194,250 (5% VAT).
- Supplier SUP-009 "Honeywell Building Solutions" created — list refreshed.
- Zero console errors; `turbo build --filter=@aura/web` passes; web tsc clean.

## Not done / next

- Edit forms (drawer supports it structurally; only create wired).
- Remaining inline forms on depth verticals (HSE, fleet, HR sub-pages) still
  use old styles — same drawer pattern applies.
- Server list pages (accounts/tenders/contracts/projects) still use their own
  inline table styles rather than `.data-table` (no hover).
