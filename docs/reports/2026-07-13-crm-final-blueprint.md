# AURA CRM — Final Execution Blueprint & Gap Map

**Date:** 2026-07-13 · **Branch:** main · **Through:** PR #96 (S9 — all slices merged)
**Latest migration:** 0162 · **Directive:** "FINAL ENTERPRISE CRM BUILD DIRECTIVE" (Wave 0 discovery output)

> Verified against the live tree, not from the directive. The directive assumes a thin CRM; the
> repo is already a mature 5-page commercial system. This is an **evolution delta**, not a rebuild.
>
> **Status 2026-07-13:** **all slices S1–S9 shipped** (PRs #86–#96). The acquisition loop runs full circle —
> Signal → Lead → Opportunity (depth · decisions · journey · health · forecast) → Won → delivered → Signal.
> No CRM slices remain; the only open platform row is RLS enforcement (deferred to first cloud deploy).

---

## 1. Current-state map (what exists)

### Domain (framework-free)
| Concern | Location | State |
|---|---|---|
| Account | `shared/src/domain/*` + `modules/crm/src/domain/account.ts`, `account.service.ts`, `postgres/in-memory-account-store` | RelationshipStage, commercial profile, portfolio rollup, Account 360 |
| Contact | `modules/crm/src/domain/contact.ts` + services/stores | **stakeholderRole/strength/reports-to on Contact** (account-level buying role), Contact 360 |
| Lead | `shared/src/domain/crm.ts:6` + `lead.service.ts`, `LeadConversionService`, stores | CRUD, **`leadAttention()` SLA/stale gaps (S1)**, **transactional idempotent convert w/ lineage + `resolveIdentity` dedupe (S2)** |
| Signal | `shared/src/domain/signal.ts` + `SignalService`, stores | **Acquisition entity (S3):** 11 sources/14 types/6 states, idempotent-on-dedupeKey, promote→lead w/ attribution; Opportunity Radar |
| Opportunity | `shared/src/domain/crm.ts:22` + `opportunity.service.ts`, stores | Stage machine, BANT, competitors, source, lossReason, forecast, pipeline command center, **buying_stage + pursuit_* (S6)** |
| Opportunity depth | `shared/src/domain/opportunity-depth.ts` + `OpportunityDepthService`, depth store | **(S4)** Stakeholders (+ `stakeholderCoverage`), Deal Team, Commitments (+ `commitmentSummary`); **(S5)** polymorphic deal register (+ `registerSummary`); **(S7)** `assessOpportunityHealth` roll-up — all on `depthFor()` |
| Buying journey | `shared/src/domain/buying-journey.ts` | **(S6)** `buyingJourneyAlignment` (our stage ↔ buyer's), `scorePursuit`/`recommendPursuit` |
| Health engine | `shared/src/domain/opportunity-health.ts` | **(S7)** pure `assessOpportunityHealth()` — 4 dimensions × band (🟢🟠🔴) + reasons, floored by worst |
| Activity | `modules/crm/src/domain/activity.ts` + `activity.service.ts`, stores | type/status/outcome/relatedName, complete/cancel/reopen, Work Center + `/activities/command` |
| Quotation | `modules/crm/src/domain/quotation.ts` + services | Lifecycle, revisions, convert-to-contract |
| Attention engine | `modules/crm/src/attention.ts` | **SHARED** thresholds (account 30d / opp 14d / quote 7d), `lastActivityByRecord`, `isQuiet` |
| Next-Action Invariant | `shared/src/domain/crm.ts:173` `opportunityAttention()` | Owner + NextAction + DueDate on active stages; overdue detection; terminal-exempt |

### Migrations (CRM-relevant)
0005 accounts · 0044 leads+opps · 0065 quotations · 0080 opp↔account · 0097 contacts · 0098 activities ·
0144 account commercial profile · 0145 opp pipeline fields · 0146 quotation lifecycle · 0147 activity related_name ·
0151 account relationship stage · 0152 contact stakeholder · 0153 opp qualification (BANT) · 0154 activity outcome ·
0155 opp next_action_due_date **(the "PR #78" invariant)** ·
**0156 lead SLA/assignment (S1) · 0157 lead convert lineage (S2) · 0158 `aura_crm_signals` (S3) · 0159 opp stakeholders/deal-team/commitments (S4) · 0160 `aura_crm_deal_register` (S5) · 0161 opp buying_stage + pursuit_* (S6) · 0162 `aura_crm_forecast_snapshots` (S8)** · _S7 (health) + S9 (growth reactors) added no migration_

### Web IA (5 pages, LOCKED per memory `crm-final-ia`)
Accounts (+360/print) · Contacts (+360) · Leads · Sales Pipeline (opportunities +360) · Activities.
Ambient `CrmAdvisor` panel on every page. Routes: `api/crm/{accounts,contacts,leads,opportunities,activities,quotations,timeline,intelligence,signals}`.
Leads page now carries the **Lead Command** + **Opportunity Radar** panels (S1/S3); Opp 360 carries **Buying Journey** (S6), **Deal Depth** (S4/S5) and the **Deal Health** card (S7) — all within the locked 5-page IA (no new pages).
Unified Timeline (`api/crm/timeline`) standardized on 360s. Relationship-Intelligence alerts folded into the 5 pages.

---

## 2. Gap map — directive target vs. repo

Legend: ✅ done · 🟡 partial · ❌ missing

| # | Directive capability | Status | Evidence / Gap |
|---|---|---|---|
| Activity engine (Wave 1) | ✅ | full domain + Work Center + command view. Types lack SITE_VISIT/DEMO/etc (additive) |
| My Work / Activities Work Center | 🟡 | `/activities/command` exists; **not per-user "my overdue/today/this-week"** buckets |
| Unified Timeline (Wave 2) | ✅ | `api/crm/timeline` on 360s; event-driven consumption partial |
| Next-Action Invariant (#78) | ✅ | `opportunityAttention()` shared, deterministic — **preserve as-is** |
| Shared attention engine | ✅ | `attention.ts` single source (PR #85) |
| Lead attention `leadAttention()` | ✅ | **S1** — UNASSIGNED/SLA_BREACHED/NO_NEXT_ACTIVITY/FOLLOW_UP_OVERDUE/STALE/QUALIFICATION_STALLED + severity (mig 0156) |
| Lead Center (Inbox/Mine/Needs-Attention/Nurture) | ✅ | **S1** — Lead Command panel (All/Mine/Needs Attention/Nurture) on `/crm/leads`, within the locked 5-page IA |
| Qualify & Convert (transactional, lineage, dedupe) | ✅ | **S2** — `resolveIdentity()` EXACT/PROBABLE/POSSIBLE + `LeadConversionService` (one tx, idempotent, lineage, cannot-convert-twice) (mig 0157) |
| Signal model + Opportunity Radar (Wave 8) | ✅ | **S3** — `aura_crm_signals` + `SignalService` (idempotent dedupe, promote→lead w/ attribution) + Radar cockpit (mig 0158) |
| Opportunity Stakeholder (opp-scoped) | ✅ | **S4** — `OpportunityStakeholder` (12 roles) + `stakeholderCoverage()` gaps/score (mig 0159) |
| Deal Team | ✅ | **S4** — `OpportunityDealMember` (10 roles) (mig 0159) |
| Commitment engine | ✅ | **S4** — `Commitment` OURS/THEIRS + `commitmentSummary` overdue/broken (mig 0159) |
| Decisions / Assumptions / Open Questions | ✅ | **S5** — polymorphic `aura_crm_deal_register` + `registerSummary` risk hook (mig 0160) |
| Customer Buying Journey (our stage ↔ buying stage) | ✅ | **S6** — `buyingJourneyAlignment` flags running ahead of the buyer → pipeline at-risk (mig 0161) |
| Pursue/No-Pursue & Bid/No-Bid | ✅ | **S6** — `scorePursuit`/`recommendPursuit` (9 dimensions) + recorded decision (kept for NO_PURSUE) (mig 0161) |
| Health engine (dimensional, explainable) | ✅ | **S7** — `assessOpportunityHealth()` folds 4 signals → per-dimension band + reasons, floored by worst (no mig) |
| Risk engine (opportunity risks) | ✅ | **S7** — the health `reasons[]` are the explainable risk list; drivers per dimension |
| Forecast engine + snapshots | ✅ | **S8** — append-only `aura_crm_forecast_snapshots` + `captureForecast`/`diffForecast` slippage; capture/history API + slippage card (mig 0162) |
| Pipeline Command Center | ✅ | KPIs, weighted, aging, stalled, at-risk (PR #76); at-risk now includes buying-journey misalignment (S6) |
| Installed base / white-space / growth signals (Wave 9) | ✅ | **S9** — `project.completed`/`contract.completed` → deduped EXPANSION/RENEWAL_DUE Signal on the S3 Radar (reactor, no mig) |
| Source attribution lineage end-to-end | ✅ | **S2/S3** — signal→lead first-touch chain now stamped (signalId→lead.source→opp), plus opp→tender→contract→project |
| Duplicate/identity resolution | ✅ | **S2** — `resolveIdentity()` (name/email/phone, public-domain aware, personMode) |
| Intelligence layer (recommendations w/ evidence) | 🟡 | CrmAdvisor + intelligence/alerts + explainable health reasons (S7); not yet full NBA/win-prob model |

---

## 3. Execution sequence (repo-anchored waves)

Wave 1 (Activity) & Wave 2 (Timeline) are **substantially done**. Re-sequenced by real delta:

| Order | Slice | Adds | Migration | Risk |
|---|---|---|---|---|
| **S1** ✅ | **Lead OS foundation** | shared `leadAttention()` + Lead Center needs-attention view + SLA fields | 0156 | done (PR #86) |
| **S2** ✅ | **Qualify & Convert hardening** | shared `resolveIdentity()` (name/email/phone → EXACT/PROBABLE/POSSIBLE), transactional idempotent `LeadConversionService`, lineage + "cannot convert twice" | 0157 | done |
| **S3** ✅ | **Signal model + Opportunity Radar** | `aura_crm_signals` (source/type/state/lineage + dedupeKey), triage + transactional idempotent promote→lead, Radar cockpit | 0158 | done |
| **S4** ✅ | **Opportunity depth** | OpportunityStakeholder (+ coverage engine) + Deal Team + Commitments (+ overdue summary); Deal Depth panel on Opp 360 | 0159 | done |
| **S5** ✅ | **Decisions/Assumptions/Open-Questions register** | 1 polymorphic `aura_crm_deal_register` table + `registerSummary` risk hook; folded into Deal Depth | 0160 | done |
| **S6** ✅ | **Buying Journey + Pursue/Bid decision** | buying_stage + pursuit_* on opp; `buyingJourneyAlignment` (misalignment → pipeline at-risk) + `scorePursuit`/`recommendPursuit`; Journey panel on Opp 360 | 0161 | done |
| **S7** ✅ | **Health + Risk engine (explainable)** | pure `assessOpportunityHealth()` folds the 4 signals (S4 coverage, S4 commitments, S5 register, S6 journey) into a per-dimension band (🟢🟠🔴) + reasons; overall floored by the worst dimension; rides on `GET :id/depth`; Deal Health card on Opp 360 | 0 (composition) | done |
| **S8** ✅ | **Forecast snapshots + slippage** | append-only `aura_crm_forecast_snapshots` (per-period, batch-grouped) + pure `captureForecast`/`diffForecast`; `ForecastSnapshotService` capture/history; `forecast/{snapshot,history}` API; slippage card on the Pipeline Command Center | 0162 | done |
| **S9** ✅ | **Account growth signals (reactors)** | `projectCompletionSignal`/`contractCompletionSignal` (shared) → `SignalService.create` on `projects.project.completed` / `contracts.contract.completed`; deduped (`growth-from-{project,contract}:<id>`) EXPANSION + RENEWAL_DUE Signals land on the S3 Radar — closes the acquisition loop back onto the installed base | 0 (reuses S3) | done |

**Rule:** every deterministic rule (`leadAttention`, `opportunityHealth`, `opportunityRisks`) lives in
`shared/src/domain/crm.ts` (or a sibling), consumed by API+UI+tests — never duplicated. Attention stays in
`modules/crm/src/attention.ts`. AI never mutates authoritative truth.

---

## 4. Status — S1–S9 complete (2026-07-13)

**All nine slices are shipped** (§3, PRs #86–#96). The CRM Commercial-OS arc runs full circle:

> **Signal → Lead → Opportunity** (depth · decisions · journey · health · forecast) **→ Won → delivered → Signal** again.

S9 (account growth reactors) closed the loop: a completed project/contract emits a deduped growth Signal
back onto the S3 Radar, so the installed base feeds the top of the funnel with no new evidence-gathering.

The only open platform register row is **RLS enforcement** (deferred to the first cloud deploy — see the
build-status memory). No CRM slices remain in this plan.

---

## 5. Invariants to test (carry forward)
Active opp requires Owner+NextAction+DueDate ✅ · terminal exempt ✅ · lead convert preserves lineage ✅(S2) ·
lead not converted twice ✅(S2) · completed activity requires completedAt ✅ · cross-tenant refs forbidden ✅(RLS) ·
signal promotion preserves attribution ✅(S3) · commitment/register overdue surfaces in health ✅(S4/S5/S7) ·
deal health floored by worst dimension ✅(S7) · forecast slippage vs prior snapshot ✅(S8) · growth reactors idempotent on dedupeKey ✅(S9) · timeline no dup ✅ · high-impact mutations authorized ✅.
