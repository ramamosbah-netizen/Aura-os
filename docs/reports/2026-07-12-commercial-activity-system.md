# Commercial Activity System

**Date:** 2026-07-12 · **Branch:** `feat/commercial-activity-system`
**Why:** Activities logged interactions and tasks, but the commercial loop needs
more: capture *what happened*, book *the next step*, and surface *relationships
going quiet*. This closes the "log the call → outcome → follow-up" loop and adds
inactivity detection so nothing slips.

## 1. Outcomes (migration 0154)
`Activity` gains `outcome` — what happened, captured when a call/meeting is logged
or a task is completed. One additive nullable column (guarded @DOWN); store
COLS/insert/map + `completeActivity(a, at, outcome)` + `ActivityService.complete`
extended.

## 2. Complete → outcome → follow-up
`POST /crm/activities/:id/complete` now accepts `{ outcome?, followUp? }`. It
records the outcome and, when a follow-up is given, creates a new task **linked to
the same record** (relatedType/relatedId/relatedName carried over) — the warm-
relationship loop in one action. The action BFF forwards the body.

## 3. `GET /crm/activities/command` — the attention view
New `ActivityCommandController` (literal route before `:id`). Beyond agenda counts
(open/overdue/due-today/due-week/unassigned/completed-30d) it detects
**relationship inactivity**: computes the last touch per related record from the
activity stream, then flags active accounts idle ≥ 30 days (or never touched) and
open opportunities idle ≥ 14 days (or never worked) — worst first.

## 4. Activities page → command center
- **Needs-attention panel**: the inactivity cards, each linking to the account /
  Opportunity 360.
- **Outcome-on-complete**: ✓ Done opens an inline panel — record the outcome, tick
  "Schedule a follow-up" to add a linked task (type / subject / due date), then
  Complete. Outcomes render on the activity (→ green line).
- Related links now point at the real **Contact 360** and **Opportunity 360**
  (were stubs). Outcome added to CSV export.

## 5. Verification (live, dev DB, :4310/:3310)
Logged a call on Acme → completed with outcome + a follow-up task → the follow-up
was auto-created linked to Acme (due +5d) and the outcome persisted. `command`
returned the agenda counts and the inactivity list (accounts never touched + an
untouched open opp). Browser: attention panel with 360 links, inline outcome
capture, outcome shown on completed rows, follow-up in the agenda. crm tests 19/19
· crm + api + web builds green · migration gate green (154, @DOWN) · SDK
regenerated (686 ops).

## 6. Next in the sequence
The **Sales Pipeline Command Center** — portfolio KPIs and weighted forecast,
pipeline aging, stalled opportunities, owner performance, at-risk deals.
