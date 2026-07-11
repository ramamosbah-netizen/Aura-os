# Projects Depth — Execution Lifecycle, Commercial Control, Closeout Loop

**Date:** 2026-07-12 · **Branch:** `feat/projects-depth`
**Why:** the last link. Contract → Project → Execution → Commercial Control →
Completion/Closeout had all its PARTS (variations, EOT, closeout checklist, EVM,
cashflow services existed) but no flow: `PROJECT_EVENT.started/completed` were defined
and never emitted, there was no status seam at all, and the detail page was flat.

---

## 1. What shipped

### Execution lifecycle — the missing seam
`ProjectService.changeStatus` with guarded transitions `planned → active (STARTED) →
completed (COMPLETED)`, cancel from planned/active — finally emitting the spine events
that were defined-but-dead. `PATCH /projects/projects/:id/status` + BFF.

### The deal chain CLOSES — new reactor
`projects.project.completed → contract completed` (guarded: only an ACTIVE contract,
once). The full loop is now event-driven end to end:
`opportunity.won → tender → tender.awarded → contract → contract.signed → project →
project.completed → contract.completed`.

### Project 360 (`/projects/projects/[id]` rebuilt)
- **Workflow**: ▶ Start execution · Complete ✓ → closes contract · Cancel — with a
  closeout-first hint on Complete.
- **Commercial control (inherited, not re-entered)**: Budget (contract value) ·
  Approved variations · **Revised value** (variation roll-up) · Pending variations ·
  Certified-to-date + billing % (IPC summary via the source contract) · EVM earned
  value + SPI/CPI · closeout progress.
- **Chain strip**: `◆ Account → ▤ Contract → ▦ PROJECT → ✓ delivered & closed`.
- **Tabs**: Variations (register w/ additions/omissions vs revised value) ·
  Delays & EOT (claims w/ days requested/granted) · **Closeout** — start the default
  checklist (as-builts, O&M, T&C certs …), toggle items, **Finalize** (handover date +
  DLP end) unlocked only when all items are done, then Complete the project.

### Migration **0150** — `created_by → text` everywhere (16 tables)
The closeout smoke hit the same defect 0142 fixed for quotations: 16 more tables
(`projects_closeouts`, `finance_customer_invoices`, `procurement_suppliers`,
`hr_attendance`, `quality_itps`, `site_instructions`, `doccontrol_submittals`, …)
still typed `created_by uuid` while actor ids are text — **every authored insert on
them failed on Postgres**. All aligned in one migration (guarded @DOWN).

## 2. Verification (live, dev DB)
Fresh chain walked end to end: contract (Acme, 90k) → **Sign → project auto-created
(value 90,000 inherited)** → Start execution → closeout checklist started (8 default
items) → all toggled → **Finalize (handover 2026-07-12, DLP until 2027-07-12)** →
**Complete project → the source contract flipped to `completed` via the reactor —
DEAL CHAIN CLOSED**. Guards verified ("cannot move project from completed to active").
Project 360 verified in the browser (inherited commercial block, chain strip reading
"delivered & closed", tabs). projects + api + web builds green · migration gate green
(150, @DOWN).

## 3. Deal-chain status after this PR
`Account → Lead → Opportunity → [Tender → Pricing] | Direct → Quotation → Contract
(obligations/bonds/IPCs) → Project (execution/variations/EOT/closeout) → CLOSED` —
every hop event-driven, every page at the uniform depth. Remaining niceties: project
register KPI pass (list page still the older table), variations/EOT create-drawers on
the 360 (registers exist as pages), DLP expiry watchlist.
