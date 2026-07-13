# AURA CRM — Final Execution Blueprint & Gap Map

**Date:** 2026-07-13 · **Branch:** claude/aura-commercial-os-layers-07ce4b · **Head:** d1a5264 (PR #85 merged)
**Latest migration:** 0155 · **Directive:** "FINAL ENTERPRISE CRM BUILD DIRECTIVE" (Wave 0 discovery output)

> Verified against the live tree, not from the directive. The directive assumes a thin CRM; the
> repo is already a mature 5-page commercial system. This is an **evolution delta**, not a rebuild.

---

## 1. Current-state map (what exists)

### Domain (framework-free)
| Concern | Location | State |
|---|---|---|
| Account | `shared/src/domain/*` + `modules/crm/src/domain/account.ts`, `account.service.ts`, `postgres/in-memory-account-store` | RelationshipStage, commercial profile, portfolio rollup, Account 360 |
| Contact | `modules/crm/src/domain/contact.ts` + services/stores | **stakeholderRole/strength/reports-to on Contact** (account-level buying role), Contact 360 |
| Lead | `shared/src/domain/crm.ts:6` (`Lead`, `LeadStatus`, `LeadSource`) + `lead.service.ts`, stores | CRUD + convert-to-opportunity; **no attention, no SLA, no Lead Center** |
| Opportunity | `shared/src/domain/crm.ts:22` + `opportunity.service.ts`, stores | Stage machine, BANT, competitors, source, lossReason, forecast, pipeline command center |
| Activity | `modules/crm/src/domain/activity.ts` + `activity.service.ts`, stores | type/status/outcome/relatedName, complete/cancel/reopen, Work Center + `/activities/command` |
| Quotation | `modules/crm/src/domain/quotation.ts` + services | Lifecycle, revisions, convert-to-contract |
| Attention engine | `modules/crm/src/attention.ts` | **SHARED** thresholds (account 30d / opp 14d / quote 7d), `lastActivityByRecord`, `isQuiet` |
| Next-Action Invariant | `shared/src/domain/crm.ts:173` `opportunityAttention()` | Owner + NextAction + DueDate on active stages; overdue detection; terminal-exempt |

### Migrations (CRM-relevant)
0005 accounts · 0044 leads+opps · 0065 quotations · 0080 opp↔account · 0097 contacts · 0098 activities ·
0144 account commercial profile · 0145 opp pipeline fields · 0146 quotation lifecycle · 0147 activity related_name ·
0151 account relationship stage · 0152 contact stakeholder · 0153 opp qualification (BANT) · 0154 activity outcome ·
0155 opp next_action_due_date **(the "PR #78" invariant — MERGED)**

### Web IA (5 pages, LOCKED per memory `crm-final-ia`)
Accounts (+360/print) · Contacts (+360) · Leads · Sales Pipeline (opportunities +360) · Activities.
Ambient `CrmAdvisor` panel on every page. Routes: `api/crm/{accounts,contacts,leads,opportunities,activities,quotations,timeline,intelligence}`.
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
| Lead attention `leadAttention()` | ❌ | no SLA/stale/no-next-action gaps for leads |
| Lead Center (Inbox/Mine/Needs-Attention/Nurture) | ❌ | single `/crm/leads` list only |
| Qualify & Convert (transactional, lineage, dedupe) | 🟡 | convert exists; **no dedupe/identity resolution, no lineage assertions** |
| Signal model + Opportunity Radar (Wave 8) | ❌ | no `signal` entity/table/radar |
| Opportunity Stakeholder (opp-scoped) | 🟡 | buying role lives on **Contact** (account-level), not per-opportunity |
| Deal Team | ❌ | none |
| Commitment engine | ❌ | none |
| Decisions / Assumptions / Open Questions | ❌ | none |
| Customer Buying Journey (our stage ↔ buying stage) | ❌ | only our stage |
| Pursue/No-Pursue & Bid/No-Bid | ❌ | none |
| Health engine (dimensional, explainable) | ❌ | attention only, no health score |
| Risk engine (opportunity risks) | ❌ | none |
| Forecast engine + snapshots | 🟡 | forecast route + weighted pipeline; **no snapshots/slippage history** |
| Pipeline Command Center | ✅ | KPIs, weighted, aging, stalled, at-risk (PR #76) |
| Installed base / white-space / growth signals (Wave 9) | ❌ | none (AMC module separate) |
| Source attribution lineage end-to-end | 🟡 | opp→tender→contract→project links exist; **no signal/lead first-touch chain** |
| Duplicate/identity resolution | ❌ | none |
| Intelligence layer (recommendations w/ evidence) | 🟡 | CrmAdvisor + intelligence/alerts; not full NBA/win-prob model |

---

## 3. Execution sequence (repo-anchored waves)

Wave 1 (Activity) & Wave 2 (Timeline) are **substantially done**. Re-sequenced by real delta:

| Order | Slice | Adds | Migration | Risk |
|---|---|---|---|---|
| **S1** ✅ | **Lead OS foundation** | shared `leadAttention()` + Lead Center needs-attention view + SLA fields | 0156 | done (PR #86) |
| **S2** ✅ | **Qualify & Convert hardening** | shared `resolveIdentity()` (name/email/phone → EXACT/PROBABLE/POSSIBLE), transactional idempotent `LeadConversionService`, lineage + "cannot convert twice" | 0157 | done |
| S3 | Signal model + Opportunity Radar | `aura_crm_signals` (source/type/state/lineage), promote→lead | +1 | med |
| S4 | Opportunity depth | OpportunityStakeholder (opp-scoped) + Deal Team + Commitments | +2 | med |
| S5 | Decisions/Assumptions/Open-Questions register | 1 lightweight table (polymorphic) | +1 | low |
| S6 | Buying Journey + Pursue/Bid decision | buying_stage on opp + decision fields | +1 | low |
| S7 | Health + Risk engines (explainable) | shared `opportunityHealth()`/`opportunityRisks()` + risk table | +1 | med |
| S8 | Forecast snapshots + slippage | `aura_crm_forecast_snapshots` | +1 | low |
| S9 | Account growth signals (reactors) | contract-expiry/project-complete → deduped Signal | 0 (reuses S3) | med |

**Rule:** every deterministic rule (`leadAttention`, `opportunityHealth`, `opportunityRisks`) lives in
`shared/src/domain/crm.ts` (or a sibling), consumed by API+UI+tests — never duplicated. Attention stays in
`modules/crm/src/attention.ts`. AI never mutates authoritative truth.

---

## 4. Immediate next slice — S1: Lead Operating System foundation

**Smallest safe vertical slice** (Wave 3 foundation; Wave 1/2 already exist):

1. `shared/src/domain/crm.ts`: add `leadAttention(lead, lastTouch, now)` → `{ active, gaps[], needsAttention, severity }`.
   Gaps: `UNASSIGNED | NO_NEXT_ACTIVITY | FOLLOW_UP_OVERDUE | STALE | QUALIFICATION_STALLED`.
   Reuse `attention.ts` `isQuiet`/`daysSince` for staleness. Mirror `opportunityAttention` shape.
2. Migration (0156, additive nullable): `assigned_to`, `assigned_at`, `sla_first_response_hours`, `next_activity_due` on `aura_crm_leads`.
3. `lead.service.ts`: expose attention over lead list (compose with activity last-touch, like pipeline does).
4. Web: `/crm/leads` gains **Needs Attention** tab/filter (reuse pipeline attention UI pattern).
5. Tests: `leadAttention` unit (each gap + terminal exemption) + in-memory E2E (assign → stale → surfaces).

Verify: package build (`shared`, `crm`) + web typecheck + new unit/E2E. One focused PR.

---

## 5. Invariants to test (carry forward)
Active opp requires Owner+NextAction+DueDate ✅(exists) · terminal exempt ✅ · lead convert preserves lineage(S2) ·
lead not converted twice(S2) · completed activity requires completedAt ✅ · cross-tenant refs forbidden ✅(RLS) ·
signal promotion preserves attribution(S3) · growth reactors idempotent(S9) · timeline no dup(✅) · high-impact mutations authorized.
