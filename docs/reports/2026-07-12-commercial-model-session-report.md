# AURA OS — Commercial Operating Model: Session Report

**Date:** 2026-07-12
**Scope:** Turn the CRM/deal-chain from a set of records into a **relationship-driven
commercial operating model**. Six shipped PRs (#71–#76), five domain migrations
(0150-era → 0154), five new read-model endpoints, four new 360 pages, plus the
pipeline command center.

---

## 1. Outcome at a glance

The commercial spine is now end-to-end, each hop a real "360":

```
Account  →  People (Stakeholders)  →  Opportunity  →  [Tender | Direct]  →  Quotation  →  Contract  →  Project
  360           360                      360            (provenance-linked progression)
```

| # | PR | Title | State |
|---|----|-------|-------|
| 1 | #71 | New Account form — full commercial profile + BFF passthrough fix | merged |
| 2 | #72 | Accounts Portfolio + Account 360 command center | merged |
| 3 | #73 | Contacts & Stakeholders 360 | merged |
| 4 | #74 | Opportunity 360 command center | merged |
| 5 | #75 | Commercial Activity System — outcomes, follow-ups, inactivity | merged |
| 6 | #76 | Sales Pipeline Command Center | open (CI green/pending) |

Every PR was **built (all packages), unit-tested (crm 19/19), migration-gated,
live-smoked on a real API+DB, browser-verified, and SDK-regenerated** before merge.

---

## 2. What each PR delivered

### #72 — Accounts Portfolio + Account 360 (migration 0151)
- **Relationship Stage** replaces the lead funnel: `prospect → qualified →
  active_customer → strategic · dormant · inactive` (0151 rebuilds the CHECK and
  maps `lead→prospect`, `active→active_customer`).
- **`GET /crm/accounts/portfolio`** — one-pass tenant roll-up per account (active
  deals, pipeline, contracts + value, projects, outstanding/overdue AR, last
  activity) with **derived health**: 🔴 overdue AR · 🟠 no owner / stale / stage
  lags contracts · 🟢 healthy.
- Accounts page → **portfolio manager**: 8 executive KPIs, smart views (All / My /
  Prospects / Active / Strategic / At Risk / Dormant), commercial table with
  one-click stage-promote + Assign-to-me.
- Account 360 reorganized: health line with the reason, Export ▾/More ▾, two-group
  snapshot (Commercial | Delivery & Finance), a **Commercial Portfolio** strip
  showing both deal routes, and a composite Overview.
- Fix: `PATCH /crm/accounts/:id` silently dropped `ownerId` (assign-owner was a
  no-op) — added to DTO + update map + a session-stamped BFF.

### #73 — Contacts & Stakeholders 360 (migration 0152)
- Contacts become **stakeholders**: `stakeholderRole` (decision_maker / influencer
  / technical / commercial / finance / executive_sponsor / user),
  `relationshipStrength` (champion → detractor), and `reportsTo` for the account
  hierarchy.
- **`GET /crm/contacts/:id/summary`** — the person + their account + the account's
  deal chain + their activity timeline + last interaction + the stakeholder map
  (manager / reports / peers).
- **Contact 360** page (`/crm/contacts/[id]`): inline role/strength editing,
  stakeholder map, deals, activity.
- Contacts list → **stakeholder register** (role/relationship columns, smart views
  by role, decision-maker/champion/unmapped KPIs). Account 360 Contacts tab is now
  the account stakeholder map.

### #74 — Opportunity 360 (migration 0153)
- Opportunity gains **BANT qualification** (budget/authority/need/timeline),
  `competitors`, `source`, `lossReason`.
- **`GET /crm/opportunities/:id/summary`** — qualification score, stakeholders,
  direct-vs-tender route, and the **progression it spawned** by following the
  provenance links (`sourceOpportunityId → sourceTenderId → tenderId → contractId`):
  opportunity → tender? → quotation → contract → project.
- **Opportunity 360** page: inline stage control, clickable progression strip,
  BANT checkboxes, competitor chips, stakeholders, win/loss intelligence.
- Verified the chain live: winning a deal spawned a tender stamped with
  `sourceOpportunityId` and the progression flipped **Tender → reached**.

### #75 — Commercial Activity System (migration 0154)
- Activity gains `outcome`. **Complete → outcome → follow-up**: completing an
  activity records what happened and can auto-create a linked follow-up task.
- **`GET /crm/activities/command`** — agenda counts **plus relationship
  inactivity**: active accounts idle ≥30d (or never touched) and open opps idle
  ≥14d, from the per-record last-touch computed off the activity stream.
- Activities page → command center: a **Needs-attention** panel (links to the
  360s), inline outcome capture with optional follow-up, outcomes on rows, related
  links now hit the real Contact/Opportunity 360s.

### #76 — Sales Pipeline Command Center (no schema change)
- **`GET /crm/opportunities/pipeline`** — portfolio KPIs (open value, weighted
  forecast, 90-day win rate, avg deal size/age), weighted forecast by close month,
  pipeline aging buckets, stalled deals, **owner performance**, and **at-risk deals
  with rule-based recommendations** (close passed / quiet / weak qualification / no
  decision-maker mapped — using BANT + stakeholder roles).
- A new default **Command** tab on the Sales Pipeline renders the whole cockpit.

---

## 3. Migrations

| Migration | Table | Change |
|-----------|-------|--------|
| 0151 | `aura_crm_accounts` | relationship-stage enum (CHECK rebuild + data map) |
| 0152 | `aura_crm_contacts` | `stakeholder_role`, `relationship_strength`, `reports_to_id/name` |
| 0153 | `aura_crm_opportunities` | BANT booleans + `competitors`, `source`, `loss_reason` |
| 0154 | `aura_crm_activities` | `outcome` |

All additive/guarded with `@DOWN`; the CI restore-drill seed (`seed-demo.mjs`) was
updated for the 0151 enum after it surfaced a CHECK failure.

---

## 4. New read-model endpoints (composition, no new stores)

| Endpoint | Returns |
|----------|---------|
| `GET /crm/accounts/portfolio` | per-account commercial roll-up + derived health |
| `GET /crm/contacts/:id/summary` | stakeholder 360 (account chain + map + timeline) |
| `GET /crm/opportunities/:id/summary` | deal 360 (qualification + provenance progression + win/loss) |
| `GET /crm/activities/command` | agenda + relationship-inactivity detection |
| `GET /crm/opportunities/pipeline` | pipeline KPIs, forecast, aging, stalled, owner perf, at-risk |

Each is a literal route registered **before** its `:id` sibling; all compose
existing module services (opportunities × tenders × quotations × contracts ×
projects × invoices × activities × contacts) in memory — no schema growth.

---

## 5. Engineering notes / gotchas handled

- **BFF passthrough bug** (accounts POST) whitelisted 4 fields and silently dropped
  the commercial profile — fixed to full passthrough.
- **`ownerId` never persisted** — missing from the account UpdateDto + update map;
  fixed, so Assign-owner works.
- **Sparse-PATCH discipline** kept (filter undefined) on every extended service.
- **Provenance composition** — chain stores only filter by `accountId`, so the
  360s list-by-account then filter by the provenance ids in memory.
- **`ActivityStatus` is `open|completed|cancelled`** (not `done`) — caught at build.
- **Insert column drift** — opportunity insert grew to `$1..$23`; activity to
  `$1..$16`; both kept in COLS order.
- Each ship: SDK regenerated (drift gate) — 683 → 687 operations across the wave.

---

## 6. Reports written this session (in `docs/reports/`)

- `2026-07-12-accounts-portfolio.md`
- `2026-07-12-contacts-stakeholders-360.md`
- `2026-07-12-opportunity-360.md`
- `2026-07-12-commercial-activity-system.md`
- `2026-07-12-pipeline-command-center.md`
- `2026-07-12-commercial-model-session-report.md` (this document)

---

## 7. Remaining / not-in-scope follow-ons

- Documents tab on the 360s (needs a DMS roll-up seam).
- `accountId` column on finance invoices (today matched by customer-name snapshot).
- Demo-seed UUID account ids; `tendering.rate.*` keys in the module-settings UI.
- RLS enforcement — still the last platform task, deferred to the first cloud deploy.
