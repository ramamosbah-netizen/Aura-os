# AURA OS — Work · Communication · Sales & Commercial Suite Audit

**Date:** 2026-08-30
**Scope:** Four suites — My Work, Communication, Sales & Commercial, and the (now-folded) Commercial post-award surface.
**Method:** Static read of the live working tree at commit `85fdbc70` (branch `main`, **63 files uncommitted** — a Sales IA consolidation is in flight; see §6). Every endpoint cited was confirmed present in the API controller tree. **No live E2E journey run was performed this session** — so this is a *structure & completeness* audit, not a scored journey run. A live run is offered at the end.

---

## 0. How these suites are built (architecture)

They are **IA composition layers, not backend modules** ([apps/web/lib/suites.ts:28-41](../../apps/web/lib/suites.ts)). Each suite is a "front door": `entryHref` opens its Home; `owns(pathname)` keeps it highlighted on deep record pages; `owns` sets are kept **mutually exclusive** so exactly one suite claims any path. My Work and Communication are *work centers* pinned above the business suites — they compose data from every suite but own no domain state. This is sound: labels/grouping change without touching routes, APIs, or permissions.

| Section | Suites |
|---|---|
| Work (centers) | My Work, Communication |
| Control | Business Command Center |
| Business | **Sales & Commercial**, Project Delivery, Supply Chain, Finance, Assets & Service, People, Intelligence |
| System | Admin Center |
| Hidden-from-primary | Pre-Award, Commercial (routable compatibility metadata only) |

---

## 1. My Work — personal execution center

**Verdict: Stable and honest.** A genuine cross-suite attention hub, not a link launcher.

| Surface | Route | Backing | State |
|---|---|---|---|
| Home | `/my-work` | my-day, `/api/inbox`, `/api/notifications`, `/api/views`, `/api/comms/unread` | ✅ 5 live sources composed via `SuiteDashboardShell` |
| My Day | `/my-work/my-day` | `/api/work-items`, `/api/crm/my-day`, inbox, notifications | ✅ Deeper command center, Dubai-TZ aware |
| Tasks | `/my-work/tasks` | work-items | ⚠️ Self-rated **PARTIALLY IMPLEMENTED** |
| Approvals | `/my-work/approvals` | inbox + `/api/documents/shared-with-me` | ✅ |
| Favorites | `/my-work/favorites` | `/api/views` | ✅ |
| Command Center | `/my-work/command-center` | — | ✅ present |

**Strengths**
- Honest degradation throughout: `null → "—"`, explicit "feed unavailable" copy, no fabricated counts ([my-work-dashboard.tsx:139-145](../../apps/web/components/my-work-dashboard.tsx)).
- Deliberate de-duplication: Files/Contacts/Communication tiles were *removed* because each duplicated a sidebar destination, documented in code ([my-work-dashboard.tsx:59-72](../../apps/web/components/my-work-dashboard.tsx)).

**Gaps**
- Tasks & My Day carry a `PARTIALLY IMPLEMENTED` flag in the taxonomy ([suites.ts:48](../../apps/web/lib/suites.ts)) — the one honest incompleteness marker here. Worth confirming what remains (recurring tasks? task creation UI?).

---

## 2. Communication — one shared center, 7 views

**Verdict: Well-built; external providers intentionally unconnected and shown honestly.** ([apps/web/app/my-work/communication/page.tsx](../../apps/web/app/my-work/communication/page.tsx))

| View | UI status | Backing | Assessment |
|---|---|---|---|
| Overview | Live | counts from all live sources | ✅ nothing estimated |
| Chat | **Live** | `/api/comms/channels`, persisted, survives restart | ✅ full ([internal-chat.tsx], 624 ln) |
| Meetings | **Live** | `/api/comms/meetings` — Schedule→Minutes→Actions→Close | ✅ full lifecycle ([meetings-workspace.tsx]) |
| Shared Files | **Live** | `/api/comms/files` (chat + WhatsApp media projection) | ✅ |
| Unread | **Live** | `/api/comms/unread/items` across chat/mail/whatsapp | ✅ single actionable list |
| Email | **Internal only** | `/api/comms/mail` | ⚠️ M365/Gmail *not configured* — stated plainly, nothing simulated ([page.tsx:278]) |
| WhatsApp | **Not connected** | `/api/comms/whatsapp/*` + SSE `/stream` | ⚠️ Full component **built & ready** (reconnect backoff, CRM-link, read receipts) — only Meta Cloud API creds missing ([whatsapp-inbox.tsx]) |

**Route inventory confirmed:** 44 comms routes exist including `channels`, `mail`, `threads`, `meetings` (`:id/close`, `:id/items`), `whatsapp` (`threads/:id/reply|read|link`, `stream`), `drafts`, `message/:id/schedule|send|cancel|forward`.

**Strongest trait**
- Channels use `fetchJson` (not `getJson`) so a **403 is distinguishable from an empty list** — it will not render "no conversations" when visibility rules (C1) actually hid them ([page.tsx:110-124]). This is the correct degraded-data discipline and is applied consistently.

**Gaps / follow-ups**
- Email is internal-only and WhatsApp is unconnected. This is *honest and by design*, not a defect — but no real outbound-mail or WhatsApp business journey is completable until an admin connects M365/Gmail and the Meta Cloud API. Flag only when a journey requires them.
- Mail scheduling/forwarding routes exist server-side; confirm the UI exercises them (Email view is internal-only today).

---

## 3. Sales & Commercial — deepest suite, mid-consolidation

**Verdict: The most mature suite by far — 27 CRM controllers + tendering + contracts — currently undergoing a deliberate "3 suites → 1" IA merge that is coded but uncommitted (§6).**

### 3.1 Journey completability — VERIFIED wired end-to-end

The Signal→Contract chain is genuinely automated through event reactors, each annotated with explicit idempotency reasoning ([apps/api/src/events/cross-module-subscriber.ts](../../apps/api/src/events/cross-module-subscriber.ts)):

| Event | Reactor | Delivery |
|---|---|---|
| `tendering.tender.created` | auto-create opportunity | best-effort (create→link not atomic) |
| `crm.quotation.accepted` | award opportunity **Won** | retryable |
| `tendering.tender.awarded` | auto-create contract **+** close opportunity Won | retryable |
| `tendering.tender.lost` | close opportunity Lost | retryable |
| `crm.commercial_baseline.locked` | link post-award commercial basis | retryable |
| `contracts.contract.signed` | **auto-create project** (+ WBS/CBS seed) | retryable |
| `projects.project.completed` | complete contract + growth signal | retryable / best-effort |
| `contracts.contract.completed` | renewal signal to Radar | best-effort |

This means: winning a tender closes its opportunity and spawns a contract; signing a contract spawns a project. The chain is real, not a set of disconnected registers.

### 3.2 Surface inventory (all endpoints confirmed present)

| Page | Route | API |
|---|---|---|
| Overview (cockpit) | `/crm/overview` | pipeline, quotations, opportunities, leads, signals/radar/summary |
| Radar | `/crm/radar` | `/api/crm/signals/radar` (11 signal routes) |
| Leads | `/crm/leads` | `/api/crm/leads` (14 routes incl. convert) |
| Opportunities | `/crm/pipeline` | `/api/crm/opportunities` (12) + depth (14); old tabs 301-redirect to Radar/Forecast/Analytics |
| Tenders | `/tendering/tenders` | `/api/tendering/tenders`; shows deadline, source, pricing progress, downstream quote→contract |
| Estimation | `/tendering/pricing` | `/api/tendering/tenders/pricing/sheets` (+ CSV export) |
| Forecast | `/crm/forecast` | opportunities/leads/accounts via `SalesInsightWorkspace` |
| Analytics | `/crm/analytics` | single composed surface (`allAnalytics`); legacy `?view=` values still accepted |
| Customers | `/crm/customers` | accounts portfolio + contacts, paged |
| Campaigns | `/crm/campaigns` | `/api/crm/campaigns` (5) |
| Quotations | `/crm/quotations` | `/api/crm/quotations` (16) — overview + paged register (list/board) |
| Commercial Decisions | `/crm/commercial` | composes quotations, contracts, pricing sheets, evidence, requirements, pricing summary |
| Contracts | `/contracts/contracts` | `/api/contracts/contracts`; signing auto-creates project |
| Reports | `/crm/reports` | 301 → `/crm/analytics?view=performance` (consolidated) |
| Market Intelligence | `/crm/market-intelligence` | pricing reference catalogue |

### 3.3 Strengths
- Cockpit reads **only live** read models; KPIs, at-risk queue and AI brief all degrade to `—`/offline copy ([sales-dashboard.tsx:140-151](../../apps/web/components/sales-dashboard.tsx)).
- Consistent 360 pattern (Lead/Opportunity/Account/Contact/Quotation) with a shared read-only journey rail.
- Redirect-based consolidation (Reports→Analytics, old pipeline tabs→dedicated pages) removes duplicate UI while preserving bookmarks.

### 3.4 Gaps / risks
- **Self-rating optimism:** the Sales suite marks *every* capability `IMPLEMENTED` ([suites.ts:74-80](../../apps/web/lib/suites.ts)), unlike Communication which honestly flags partials. Given the in-flight IA change, "all green" is optimistic and should be re-verified after commit.
- **Event-level retry debt** (known, [[outbox-event-level-retry-debt]]): the outbox retries at the *event* level, so a `retryable` reactor is only safe if **all** co-subscribers on that event are idempotent. `tender.awarded` and `quotation.accepted` each fan out to multiple sinks — this invariant must hold or a retry double-writes.
- **Won governance** ([[tender-award-evidence-adr0021]]): a tender win is governed by customer award evidence; `commercialBasis` is reportedly absent from web + SDK, so an "awaiting basis" state may be invisible in the UI. Confirm the Contracts/Commercial surfaces show it.

---

## 4. Commercial (post-award) — folded into Sales & Commercial

`/crm/commercial` is a **decision workspace**, not a second cockpit ([apps/web/app/crm/commercial/page.tsx](../../apps/web/app/crm/commercial/page.tsx)): linked views onto quotations/contracts/pricing-sheets/evidence/requirements, every record still owned by its origin domain. Contracts, certificates, clauses, bonds, obligations all have controllers (`contracts/*`). The standalone "Commercial" suite is now `hiddenFromPrimary` — its records surface inside Sales & Commercial.

---

## 5. Cross-cutting findings

| # | Finding | Severity | Evidence |
|---|---|---|---|
| 1 | Sales IA merge is **uncommitted** — 63 dirty files + 4 untracked fitness tests + untracked `sales-360-journey.tsx`. Run typecheck/test/build/lint before commit. | **Medium** | `git status`; [[pre-push-gate-checklist]] |
| 2 | `apps/api/api-local.err` untracked in tree — stray local error log; gitignore or delete, don't commit. | Low | `git status` |
| 3 | Sales suite self-rates all capabilities `IMPLEMENTED` while Communication flags partials; re-verify post-merge. | Low | suites.ts:74-80 |
| 4 | Hidden Pre-Award/Commercial keep live `entryHref`s (`/tendering`, `/contracts`) — reachable by URL, absent from nav; dead-link risk if anything still links to those suite records. | Low (verify) | suites.ts:83-105 |
| 5 | Event-level outbox retry requires all co-subscribers idempotent — invariant to hold as reactors are added. | Medium (known) | cross-module-subscriber.ts:286-296 |
| 6 | Email (M365/Gmail) and WhatsApp (Meta Cloud API) unconnected — **by design, shown honestly**. No outbound-comms journey until connected. | Info | communication page.tsx:278; whatsapp-inbox.tsx:34 |

---

## 6. Active work in flight (2026-08-30, uncommitted)

A **Sales & Commercial global-IA consolidation** is mid-edit:
- Three legacy suites collapsed into one primary `sales` suite; it now `owns` `/crm`, `/tendering`, `/contracts`, `/subcontracts`, `/projects/variations`.
- `pre-award` + `commercial` set `hiddenFromPrimary: true`, `owns: () => false`.
- New shared read-only `sales-360-journey.tsx` rail; Analytics collapsed to a **single surface** (no tab navigator); Quotation 360 switched to canonical pricing-sheet `lines`.
- 4 new fitness tests guard the above: `sales-global-ia`, `analytics-single-surface`, `quotation-pricing-contract`, `commercial-decisions-composition`.
- Parallel Project-Delivery work (PD5a contract→project immutable handover, migration `0272`) is also uncommitted but out of this audit's scope.

**Recommendation:** verify the four fitness tests + typecheck green, then commit the Sales IA merge as its own slice before layering more on top.

---

## 7. Bottom line

- **My Work** — solid; only Tasks/My Day carry a partial flag.
- **Communication** — well-built with correct degraded-data discipline; external providers unconnected by design.
- **Sales & Commercial** — deepest and most complete suite, with a genuinely automated Signal→Contract→Project chain; currently mid-consolidation and **needs the uncommitted merge verified and committed**.
- **Commercial** — correctly folded in as a decision workspace.

**No live journey run was performed.** For a scored journey number (per the weekly-E2E convention, [[journey-audits]]), a live Direct-Sale + Tender run against a disposable DB is required — I can run that next if you want the /100.
