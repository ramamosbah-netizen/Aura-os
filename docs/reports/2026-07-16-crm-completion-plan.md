# CRM Completion Sprint — the plan, verified against the live tree

> **✅ COMPLETE — 2026-07-16.** All nine C-slices (C1–C9) are merged to `main`. The CRM is in
> Feature Freeze. Closing declaration: [2026-07-16-crm-feature-freeze.md](2026-07-16-crm-feature-freeze.md).

**Date:** 2026-07-16 · **Decision:** the ONLY current goal is finishing CRM 100%, then Feature Freeze.
**Baseline:** `main` after PR#119 (health dimensions) merged; PR#120 (forecast categories) green/open.

The user's 10-sprint completion plan, checked line-by-line against code. Most of it is ALREADY
BUILT — the honest remaining work is nine C-slices. Each slice = one branch/PR, same recipe as
the G-wave (migration where needed, domain, API, UI, e2e, live-DB verify, SDK drift check).

## Sprint-by-sprint state

| Sprint | State | Remaining |
|---|---|---|
| 1 · Lead OS | ✅ ~95% (S1/S2, G3, G4, Lead Center views) | lifecycle statuses (G8), acceptedAt (G9) → **C1** |
| 2 · Opportunity OS | ✅ ~85% (radar, health 5-dim, journey, competitors, risks, deal team, forecast cats, AI prob, stage gates) | Win Plan (G16) → **C2** · Installed Base + White Space (§26) → **C3** |
| 3 · Activity OS | ✅ engine + My Work (G1/G2) | types WhatsApp/site-visit/… (G10) + IN_PROGRESS lifecycle (G11) → **C1** · calendar view → **C4** |
| 4 · Account 360 | ✅ (G6 graph, party types, financials, dossier) | assets/AMC tab surface → rides with **C3** |
| 5 · Sales Intelligence | ✅ ~80% (pipeline cockpit, forecast+slippage, sources, 22 rel-signals) | source→margin funnel (G15) → **C5** |
| 6 · Sales Workspace | ❌ not built | "My Day" page → **C4** |
| 7 · Executive CRM | ◐ partial (pipeline command, CEO dashboard exists) | exec CRM dashboard (win/loss, team perf, strategic accts) → **C6** |
| 8 · CRM Automation | ❌ (admin notify-rules exist, not CRM-wired) | auto-assign, SLA escalation, follow-up automation → **C7** |
| 9 · CRM AI | ◐ (AI win prob, deterministic scoring, rule-based NBA) | opportunity summary, email draft, meeting summary → **C8** |
| 10 · Polish | — | perms review, perf, mobile pass, final QA → **C9** (last) |

## The C-slices, in build order

1. **C1 — lifecycle completion (G8+G9+G10+G11)**: lead statuses `verified/assigned/qualifying`,
   `acceptedAt` + ASSIGNMENT_NOT_ACCEPTED (the 7th §8 reason), activity types
   `follow_up/whatsapp/site_visit/technical_discovery/demo/presentation/reminder`,
   activity `in_progress` + `startedAt`. One migration (0175), additive.
2. **C2 — Win Plan (G16/§14)**: decision criteria, differentiation, win strategy on the deal.
3. **C3 — Installed Base & White-Space (§26)**: per-account systems register → UPGRADE /
   WHITE_SPACE / AMC signals on the S3 radar; Account 360 tab.
4. **C4 — Sales Workspace "My Day"**: one page composing my leads/opps/activities/meetings.
5. **C5 — source→margin funnel (G15/§29)**: Source → Wins → Contract Value → Actual Margin.
6. **C6 — Executive CRM dashboard (§7 exec)**.
7. **C7 — CRM automation**: auto-assignment, SLA escalation, follow-up reminders (reactors).
8. **C8 — CRM AI extras**: opportunity summary, email drafting (existing ai infra, advisory only).
9. **C9 — polish + final QA + Feature Freeze declaration.**

After C9: CRM = Feature Freeze; only usage-discovered fixes. Then Tender OS per the 10-OS roadmap.
