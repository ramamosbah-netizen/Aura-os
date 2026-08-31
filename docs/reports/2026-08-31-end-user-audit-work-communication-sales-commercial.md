# End-User Audit — Work · Communication · Sales & Commercial

**Date:** 2026-08-31
**Suites:** My Work, Communication, Sales & Commercial (incl. the folded-in Pre-Award + Commercial surfaces).
**Lens:** End-user experience · business logic · workflow · gaps · improvements.
**Method:** Fresh read of the working tree at `85fdbc70` (+66 uncommitted files), every claim traced to a file. Health section is **measured** (live test + typecheck run this session). **No live browser click-through** was performed — UX findings are from component code, not a rendered session. Scores are deliberately omitted (a number is only quotable after a live journey run).

---

## A. Measured health (run this session)

| Check | Result |
|---|---|
| `tsc --noEmit` (whole web app) | ✅ PASS (exit 0) |
| Suite fitness tests (sales-global-ia, analytics-single-surface, quotation-pricing-contract, commercial-decisions, suites-taxonomy, nav) | ✅ 20/20 pass |
| Full web vitest (63 files / 170 tests) | ✅ 166 pass; 4 "fails" are all `Test timed out in 5000ms` |
| The 4 timeouts, re-run isolated | ✅ pass in <1s each — parallel-starvation, **not** regressions |

The code these suites ship compiles clean and its guard tests are green. The only failing signal is a vitest timeout-budget artifact under parallel load (fix: raise `testTimeout`).

---

## B. My Work — personal execution center

**Experience.** A genuine cross-suite attention hub (metrics · attention queue · AURA brief · shortcuts) via `SuiteDashboardShell`. Honest degradation everywhere (`null → "—"`, "feed unavailable" copy). Tiles that duplicated sidebar destinations were deliberately removed ([my-work-dashboard.tsx:59-72](../../apps/web/components/my-work-dashboard.tsx)).

**Business logic / workflow.** Composes 5 live sources (my-day, inbox, notifications, views, comms-unread). My Day adds work-items + meetings, Dubai-TZ pinned.

**Gaps**
- Tasks & My Day carry a `PARTIALLY IMPLEMENTED` flag ([suites.ts:48](../../apps/web/lib/suites.ts)) — confirm what's missing (recurring tasks? task-create UI? snooze?).
- Attention items fall back to `/crm/activities` when a task has no `href` — a dead-endy landing for a personal task.

**Improvements**
- Surface *why* an item is in the queue (SLA breach, overdue, approval age) as a one-line reason, not just a due date.
- Let a user act on an attention item inline (complete / snooze / reassign) without opening the source page.

---

## C. Communication — one center, 7 views

**Experience.** overview · email · chat · meetings · whatsapp · files · unread, grouped Your-work / Internal / External. Each view shows an honest status pill.

| View | Status | Reality |
|---|---|---|
| Chat | **Live** | Persisted, survives restart (624-line component) |
| Meetings | **Live** | Full Schedule→Minutes→Actions→Close lifecycle |
| Shared Files | **Live** | Projected from chat + WhatsApp media |
| Unread | **Live** | Single cross-channel actionable list |
| Email | **Internal only** | M365/Gmail **not configured** — stated plainly, nothing simulated |
| WhatsApp | **Not connected** | Full component (SSE stream, reconnect backoff, CRM-link, read receipts) **built & ready**; only Meta Cloud API creds missing |

**Best trait.** Channels use `fetchJson` so a **403 is distinguishable from empty** — it will not render "no conversations" when visibility rules hid them ([communication/page.tsx:110-124](../../apps/web/app/my-work/communication/page.tsx)). Correct degraded-data discipline, applied consistently.

**Gaps**
- **No real external comms journey**: outbound email and WhatsApp cannot complete until an admin connects M365/Gmail + Meta Cloud API. By design and honest — but a user cannot email a customer *from AURA* today.
- Meetings own the record/minutes/actions but **video links + calendar invites are provider integrations, not owned** — no actual Zoom/Teams join is created.
- Email view exercises only the internal mailbox; server-side `schedule`/`forward`/`send` routes exist but aren't reachable while providers are unconnected.

**Improvements**
- A single "Connect a channel" admin call-to-action on the unconnected views (Email, WhatsApp) so the path to enabling them is visible from where the user hits the wall.
- Draft-to-record linking: composing mail/chat from a Lead/Opportunity 360 already works; make the reverse (a message → attach to a record) a first-class action in the thread.

---

## D. Sales & Commercial — the deep suite

The journey is **Signal → Lead → Opportunity → Scope/BOQ → Estimate → Quotation → Decision → Contract**, and it is genuinely wired end-to-end (verified in §D.6).

### D.1 Radar → Leads
- **Leads OS** ([leads-workspace.tsx](../../apps/web/components/leads-workspace.tsx)): board with **drag-to-advance** (optimistic PATCH + rollback on failure), list view, KPIs (active / overdue follow-up / qualifying / qualified-ready), search + owner + source filters, overdue follow-up flags.
- **Workflow correctness**: lifecycle New→Contacted→Qualifying→Qualified→Disqualified; **Convert lives only in Lead 360**, not on the board — so the qualification→readiness→convert context can't be skipped. Good discipline.

### D.2 Opportunities
- Focused deal workspace; old pipeline tabs (radar/forecast/analytics/overview) **301-redirect** to their dedicated homes — duplicate UI removed, bookmarks preserved ([crm/pipeline/page.tsx:16-22](../../apps/web/app/crm/pipeline/page.tsx)).

### D.3 Tenders → Estimation
- **Bid register** ([tenders-client.tsx](../../apps/web/components/tenders-client.tsx)): every row reads the **deal chain left-to-right** — pricing progress (`priced/boq` + margin) → quotes → contract. Source tabs (Invitations/Opportunities/Public/Private/Unclassified), deadline urgency (due-soon ⚠ / overdue ✗), KPIs incl. win-rate.
- **Submission gate**: "Submit →" runs a server gate (bid decision + priced estimate + value must be on record). Won/Lost are one-click after submission.

### D.4 Quotations
- **Quotation OS** ([quotations-workspace.tsx](../../apps/web/components/quotations-workspace.tsx)): Overview cockpit + Register (list/board), URL-backed, tenant-scoped **paged** data with a **separate summary contract** so KPIs aren't limited to page 1. Board stages map to **real** statuses (no invented state).
- **Quotation 360** ([quotations/[id]/page.tsx](../../apps/web/app/crm/quotations/%5Bid%5D/page.tsx)): RecordChrome + Sales 360 journey rail + revisions + canonical pricing view.

### D.5 Contracts
- **Register** ([contracts-register-client.tsx](../../apps/web/components/contracts-register-client.tsx)): chain (tender ← contract → project), bond expiry watch, next-best-action banner, status transitions.

### D.6 Business logic — genuinely strong

**Quotation state machine** ([modules/crm/src/domain/quotation.ts](../../modules/crm/src/domain/quotation.ts)):
- draft → internal_review → approved → sent → under_negotiation → accepted / rejected / expired / cancelled (+ revised).
- **Governance gate**: a quote **cannot be sent unapproved** (`send` requires `approved`); approval locks the immutable Commercial Baseline; the internal pricing build-up is **frozen from `approved` onward** (read/export/print only). Re-pricing = a new revision (carries lines/pricing/estimation forward as a fresh draft).
- **Money is exact** (big.js, half-up policy) — VAT on 0.70 is 0.04, not 0.03.

**Quotation readiness gate** ([quotation-readiness.ts](../../modules/crm/src/domain/quotation-readiness.ts)): ownership rules always (tender-route deals quote through the tender; lost deals can't quote), plus the **Q→P→E→B evidence chain** (approved scope + approved estimate + frozen pricing) enforced **only once a deal is governed** by a Pre-Award package — legacy deals grandfathered so nothing pre-flow breaks.

**Tender submission** ([submission.ts](../../modules/tendering/src/domain/submission.ts)): an **immutable fact** written at the submitted gate with a **value snapshot**, so later BOQ edits can't rewrite what was offered. A resubmission is a second fact, not an edit.

### D.7 The automated chain (verified reactors)
[cross-module-subscriber.ts](../../apps/api/src/events/cross-module-subscriber.ts):
- `quotation.accepted` → award opportunity **Won**
- `tender.awarded` → auto-create **contract** + close opportunity Won
- `contract.signed` → auto-create **project** (+ WBS/CBS seed)
- `project.completed` → complete contract + growth signal

---

## E. Consolidated gap register (prioritized)

| # | Gap | Suite | Severity | Evidence |
|---|---|---|---|---|
| G1 | **CONFIRMED BROKEN JOURNEY — a tender cannot be won through the UI.** Both "Won" controls — the register's "Won ✓" and Tender 360's "Mark Won (Awarded)" — PATCH `/status` with `{status:'won'}`. The backend **rejects that by design** (ADR-0021): `changeStatus` throws *"A tender can only be won through the governed award command… via award()"*. The governed path `POST /tendering/tenders/:id/award` (awardedValue + currency + date) **exists in the SDK but is called by no web page or component**. So every "Mark Won" click 409s and there is **no award-evidence form anywhere**. Compounding it, `tender-detail` reads `d.error` while the API returns `message`, so the user often sees only the generic *"Failed to update status."* **Fix:** replace the "Won" buttons with an award-evidence capture modal that calls `award()`. | Sales | **HIGH (confirmed)** | [tenders-client.tsx:218](../../apps/web/components/tenders-client.tsx); [tender-detail.tsx:118-134,371](../../apps/web/components/tender-detail.tsx); [tender.service.ts:198-210](../../modules/tendering/src/tender.service.ts); [generated.ts:4868](../../packages/sdk/src/generated.ts) |
| G2 | **Raw user IDs surface as owners** (`ownerId`, `assignedTo` shown verbatim, `u-…`) in Leads, Tenders, and owner filters — no display-name resolution. A real end-user polish gap across the suite. | Sales | Medium | leads-workspace.tsx:120-122, tenders-client.tsx:211 |
| G3 | **External comms cannot complete a journey**: email is internal-only, WhatsApp unconnected. No customer email/WhatsApp is sendable from AURA until providers are configured. | Communication | Medium (by design) | communication/page.tsx:278; whatsapp-inbox.tsx:34 |
| G4 | **Tasks & My Day self-flagged PARTIALLY IMPLEMENTED** — scope of the gap is undocumented. | My Work | Medium | suites.ts:48 |
| G5 | **Bespoke tables, not the shared `aura-data-table`** (Leads list, Tenders, Contracts hand-roll `<table>`), and fixed `maxWidth`/grid layouts with **no responsive treatment** — the suite is desktop-only. | Sales | Medium | leads-workspace.tsx:179; tenders-client.tsx:157 |
| G6 | **Quotation board carries a dead `negotiation` branch** alongside `under_negotiation` — the domain only emits `under_negotiation`, so the extra status is defensive dead code (harmless, but signals drift risk). | Sales | Low | quotations-workspace.tsx:69 |
| G7 | **`apps/api/api-local.err`** stray error log untracked in the tree — must not get committed. | — | Low | git status |
| G8 | **Sales suite self-rates every capability `IMPLEMENTED`** while Communication honestly flags partials — optimistic given the in-flight IA merge. | Sales | Low | suites.ts:74-80 |
| G9 | **Hidden Pre-Award/Commercial keep live `entryHref`s** (`/tendering`, `/contracts`) — reachable by URL, absent from nav; dead-link risk if anything still links to those suite records. | Sales | Low | suites.ts:83-105 |
| G10 | **Full test run needs a higher `testTimeout`** — 4 FS-scanning fitness tests flake under parallel load at the 5s default. | — | Low (tooling) | this session's run |

---

## F. Improvement backlog (what we can make better)

**Highest leverage**
1. **Resolve owner IDs to names** everywhere in Sales (a shared `useUsers()`/server join). Removes the single most visible "unfinished" tell (G2).
2. **Award-evidence capture on win** (G1): replace the bare "Won ✓" with a short evidence step (LOA/award ref + date) that feeds the governed `award()` path — closes the biggest workflow-integrity risk.
3. **Adopt `aura-data-table` + a responsive pass** for the three register tables (G5) — consistency + mobile usability in one move.

**Experience polish**
4. Inline actions on My Work attention items (complete/snooze/reassign) (§B).
5. "Connect a channel" CTAs on Email/WhatsApp so the enablement path is visible at the wall (§C).
6. One-line *reason* on every attention/at-risk item (why it surfaced), not just a value/date.

**Workflow completeness**
7. Make "attach message → record" a first-class action in chat/mail threads (the reverse of the already-working record→message deep-links).
8. Document the Tasks/My Day partial scope and close it (G4).

**Hygiene**
9. Raise vitest `testTimeout` (G10); gitignore/delete `api-local.err` (G7); reconcile the `negotiation` dead branch (G6); re-verify Sales capability self-ratings post-merge (G8); sweep for links into hidden Pre-Award/Commercial routes (G9).

---

## G. Bottom line

- **My Work** — solid; only Tasks/My Day carry an honest partial flag.
- **Communication** — well-built with correct degraded-data discipline; external providers unconnected **by design**, so no outbound customer comms yet.
- **Sales & Commercial** — the strongest suite: a real, governed, event-driven Signal→Contract→Project chain with a proper quotation state machine and exact money. The gaps are **polish and one integrity check** (owner-name resolution, award-evidence-on-win, shared tables/responsive), not missing capability.

**One confirmed broken journey stands out:** G1 — the tender **cannot be won through the UI** because both "Won" buttons hit a path the backend rejects, and the governed `award()` endpoint has no frontend. The backend integrity is *correct*; the frontend never got the award-evidence form. That is the first thing to fix and it is the kind of path-asymmetry a static review catches but a happy-path demo hides.

**Remaining verification:** a live browser click-through of one Direct-Sale + one Tender journey for the /100 per the weekly-E2E convention — offered as a next step.
