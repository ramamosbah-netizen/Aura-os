# DealFacts — contract proposal (Opportunity 360)

**Date:** 2026-08-26 · **Status:** APPROVED with 3 contract changes (applied below) · **Scope:** domain contract only

Direction of derivation is fixed and one-way:

```
Raw data -> DealFacts -> Deterministic Rules -> Assessment/Insights -> UI
```

DealFacts is built from the DOMAIN and its sources, never from what the 360 wants to render. If a
field only exists because a panel wants it, it does not belong here.

## Classification rule

| Class | Allowed in DealFacts? |
|---|---|
| Raw persisted fact | yes |
| Normalized / derived fact (deterministic, provenance documented) | yes |
| Business conclusion (score, health, verdict, recommendation, attention, readiness label, UI wording) | **NO** |

## Inventory — what Opportunity 360 reads today

Source: `apps/api/src/crm/opportunity-360.controller.ts` fan-out (account, stakeholders, tenders,
quotations, contracts, projects, activities) + the opportunity aggregate.

### ACCEPTED — raw persisted facts

| Source field | DealFacts field | Transformation | Null / unknown semantics | Current consumer |
|---|---|---|---|---|
| `opportunity.id/title/stage` | `lifecycle.id/title/stage` | none | stage never null | header, every rule |
| `opportunity.value` | `commercial.headlineValue` | none — renamed to stop it reading as a contracted figure | `0` is a real typed 0, NOT unknown | KPI "Value" |
| `opportunity.closeDate` | `lifecycle.expectedCloseDate` | none | `null` = never set (kept null) | KPI, health |
| `opportunity.ownerId` | `lifecycle.ownerId` | none | `null` = unassigned (kept null) | attention rule |
| `opportunity.executionType` / `requiresTender` / `tenderId` | `lifecycle.route`, `lifecycle.tenderId` | none | `tenderId` null = direct route | route split |
| `opportunity.budget/authority/need/timelineConfirmed` | `qualification.dimensions[]` | via `qualificationFromFlags` (audited adapter) | `false` -> `UNKNOWN`, never "No" | qualification card |
| `opportunity.buyingStage` | `strategy.customerBuyingStage` | none | **`null` = not assessed** — must not collapse to a stage | buying journey |
| `opportunity.competitors` | `strategy.competitors` = `{ state, items }` | split on comma, trimmed, empties dropped | blank -> `state: 'UNKNOWN'`. **`KNOWN_NONE` is unreachable from this data** — AURA has no way to record "there are no competitors", so absence stays UNKNOWN. (Rejected `competitorsRecorded: false`: it would assert a *recording action* nothing persists.) | competitors card |
| `opportunity.lossReason` / `winReason` | `outcome.lossReason` / `winReason` | none | null preserved | win/loss card |
| `requirements[]` | `commercial.requirementCount` | count | `0` = none captured (a real count) | readiness |
| `stakeholders[]` (contacts on the account) | `stakeholders.people[]` (id, name, role, influence, isPrimary, hasEmail, hasPhone) | contact-details presence normalized to booleans; **no** "reachable" verdict | empty array = none on file | stakeholder card |
| `activities[]` | `engagement.lastActivityAt`, `engagement.openActivityCount`, `engagement.nextOpenActivity` | next-open selection via existing `nextOpenActivityByRecord` | `null` = nothing scheduled (NOT "overdue") | timeline, next action |

### ACCEPTED — normalized / derived facts (provenance documented)

| Derived field | Deterministic derivation | Provenance | Null semantics |
|---|---|---|---|
| `outcome` (`OPEN`/`LEGACY_WON`/`GOVERNED_WON`/`LOST`) | `resolveDealOutcome(opportunity)` — REUSED, not re-derived | `stage` + `awardSource` | never null |
| `outcome.awardDocumented` | from the resolver | `awardSource != null && stage==='won'` | never null |
| `commercial.awardValue` **(excl. VAT)** | `outcome.awardValue` | accepted quotation -> Commercial Baseline subtotal | `null` when no documented award, **and null stays null when provenance exists but no value** (visible inconsistency) |
| `commercial.quotedTotal` **(incl. VAT)** | sum of `quotation.total` for provenance-linked quotes | quotation rows | `null` when no quotation exists (NOT 0) |
| `commercial.acceptedQuotation` | the quote whose id matches `awardedQuotationId` | award provenance | `null` when none |
| `downstream.contract` = `{ exists, value }` | sum of non-cancelled `contract.value` **normalized at the DealFacts boundary only** | contract rows | `exists:false, value:null` when there is no contract (NOT 0). The controller's local `contractSum` is deliberately NOT changed — consumer audit: it is a local const with exactly two consumers in one method, so no global behaviour shifts in this slice |
| `commercial.pricingFrozenAt` / `scopeApprovedAt` / `estimateApprovedAt` | pre-award package governance timestamps | package chain | `null` = that step has not happened |
| `downstream.contract` / `.project` | existence + id via the provenance links already computed | tender or `convertedContractId` | `null` = not created |
| `awardEvidence.customerPoOrLoa` | **no storage exists** | — | `NOT_CAPTURED` — distinct from `UNKNOWN`. AURA has no field for it, so it must not look like "we checked and could not tell" |

### REJECTED — business conclusions (stay in the rules layer)

| Candidate | Why it is a conclusion |
|---|---|
| `attention.gaps` / `needsAttention` | a judgement about what needs doing |
| `health.score` / `band` / `state` | a verdict |
| `qualification.band` (EARLY/DEVELOPING/STRONG) | a readiness LABEL — the dimensions and counts are facts; the band is a rule output |
| `stageGate.allowed` / `gaps` | a gate decision (its EVIDENCE — hasStakeholder, hasQuotation, quotationSubmitted — is factual and IS included) |
| "Next Best Action" | a recommendation (the underlying `nextOpenActivity` is a fact and IS included) |
| `progression[]` steps with labels/hrefs | UI composition |
| Any sentence a user reads | wording belongs to the assessment layer |

## Proposed shape (facts only, scoped by domain)

```
DealFacts
├── lifecycle      id, title, stage, route, tenderId, ownerId, expectedCloseDate
├── outcome        state, awardDocumented, awardSource, awardedQuotationId, awardValue, awardedAt
├── qualification  dimensions[] (status + evidence), confirmed/unknown/concern/blocker counts, unevidenced
├── stakeholders   people[] (role, influence, isPrimary, hasEmail, hasPhone)
├── commercial     headlineValue, requirementCount, scopeApprovedAt, estimateApprovedAt,
│                  pricingFrozenAt, quotedTotal(incl VAT), acceptedQuotation, awardValue(excl VAT)
├── strategy       customerBuyingStage, competitors { state, items }, winPlanFieldsPresent
├── engagement     lastActivityAt, openActivityCount, nextOpenActivity
├── awardEvidence  customerPoOrLoa: NOT_CAPTURED (no storage exists yet)
└── downstream     contract { exists, value }, project { exists, id }
```

## Money separation (enforced by naming, per the agreed convention)

`quotedTotal` (incl. VAT) · `awardValue` (excl. VAT) · `contractValue`. No field is called `value`
except `headlineValue`, which is explicitly the salesperson's forecast figure and feeds nothing.

## Null discipline

No field manufactures `0`, `false` or `''` to be easier to consume. Three distinct absences are kept
apart via one epistemic vocabulary:

| Status | Meaning |
|---|---|
| `NOT_CAPTURED` | AURA has no field or evidence mechanism for this at all |
| `UNKNOWN` | the concept IS captured, but the value is not known |
| `KNOWN_ABSENT` | verified absent |
| `KNOWN_PRESENT` | evidenced present |

A legitimate monetary **`0` is preserved as `0`** — the fabricated zero being removed is the one that
came from *absence* of a contract, not a real zero-value figure. Tests pin both directions.

## Contract tests planned

open · lost · legacy-won · governed-won · missing values throughout · partial qualification ·
inconsistent/stale financials (award provenance with null value; a contract whose value differs from
the award; a quotation total present with no award).

## Explicitly out of scope for this slice

Deal Depth, Health semantics, removal of the remaining client-side rules, and all Program A work.
