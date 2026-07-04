# Enterprise Command Center — homepage rebuild

**Date:** 2026-07-03 · **Branch:** `feat/command-center` · **Commit:** `08f2a60`

## Goal

Replace the widget-grid workspace with a homepage that answers one question:
**"What requires my attention right now, and what should I do next?"** —
Awareness → Intelligence → Prioritization → Action.

## What shipped

### Framework-free core — `@aura/shared/command-center` (7 unit tests)

- **`attention.ts`** — `buildAttentionFeed(decisions, ledgers, {now})` produces
  one ranked, severity-tagged feed:
  - Each pending decision (from the host `InboxService`, 13 kinds) is scored by
    **action weight** (Pay/Decide/Certify outrank Approve/Review), **log-scaled
    money value**, and **age**.
  - **Derived risk items** from project ledgers: over-invoiced project =
    `critical`, over-committed = `high` (surfaced even though they're not in the
    inbox).
  - Severity bands: score ≥70 critical, ≥45 high, else normal.
  - `summarizeAttention()` (counts + value at stake) and `recommendedActions()`
    (top-N imperative "do next").
- **`health.ts`** — `computeBusinessHealth()` → explainable 0–100 score with
  **named drivers** (decision backlog, aging approvals, budget variance, win
  rate) and a band (strong/stable/at-risk/critical). Starts at 100, subtracts
  transparent penalties.

### Web

- **`command-center.tsx`** — the homepage view:
  - Hero: time-aware greeting + **business-health ring** + attention summary
    chips (critical / high / total / value at stake).
  - **AI Daily Briefing** via the existing `POST /api/intelligence/insights`
    seam; degrades to a clear message with no model key.
  - **"Needs your attention"** — the ranked feed with severity bars, action
    chips, values, and inline `Open →` deep-links to the exact record.
  - **"What to do next"** — top-3 recommended actions.
  - Right rail snapshots: **Operations**, **Financial**, **Risk & Compliance**,
    **Quick Actions** (9 create shortcuts), **Live spine**.
- **`role-dashboard-shell.tsx`** — Command Center is the default perspective;
  CEO / CFO / PM dashboards preserved as switchable perspectives.
- **`page.tsx`** — greets the signed-in user (prettified from the session
  subject); drops the now-redundant PR/subcontract/claim fetches (the inbox
  already aggregates them).

## Architecture / reuse

- No new API endpoints. Reuses `InboxService`, intelligence `pipeline` +
  `projects` ledgers, and the `AiService` briefing seam.
- Scoring/health is pure and headless in `@aura/shared` → unit-tested and
  reusable server-side later (e.g. digest emails, mobile).
- No cross-module joins; Constitution Law #1 intact.

## Backward compatibility

- CEO/CFO/PM perspectives unchanged. The `/inbox`, `/events`, `/search`
  surfaces are untouched and linked from the snapshots. `RoleDashboardShell`
  prop set trimmed to what the perspectives actually consume.

## Verified live (demo data)

- Business health **90 / Strong**; ranked feed of 12 (Decide 2.1M → Pay 95K →
  Certify 180K → Approve 430K …) with 5 high / 3 normal in the top 8.
- 3 next-actions; 9 quick actions; AI briefing rendered via local fallback.
- All four perspectives switch cleanly; first `Open →` deep-linked to the real
  tender record. Zero console errors. 116 shared tests pass; web tsc + eslint +
  prod build green.

## Remaining / next

- One-click inline actions (Approve/Pay from the feed) once the workflow engine
  is adopted — today the feed deep-links to the record page to act.
- Richer AI: anomaly detection, cost-optimization, procurement recommendations
  (Phase-2 intelligence) can register as additional attention sources.
- Per-role attention weighting (a technician vs. a CFO see different top items)
  once RBAC role claims are surfaced to the homepage.
