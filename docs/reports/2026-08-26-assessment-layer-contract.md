# Assessment layer — contract proposal (Opportunity 360)

**Date:** 2026-08-26 · **Status:** PROPOSAL — nothing implemented (an earlier draft was deleted for
breaking boundaries 1 and 3) · **Scope:** contract only

## Pipeline and ownership

```
DealFacts ──► Deterministic Rules ──► Rule Results / Findings ──► Assessment ──► UI
   facts            conclude               typed, with provenance     aggregates    words
                                                                     + coverage     + tone
```

- **Rules** conclude. Each finding is emitted by exactly one named rule.
- **Assessment** aggregates rule results and decides COVERAGE. It concludes nothing of its own.
- **UI** maps codes to wording and presentation. It decides no business question.

Assessment must never take a conclusion that did not come from a rule over DealFacts — that is the
two-sources-of-truth door, and it is the reason the draft was thrown away.

## 1. Completeness audit — client-side business conclusions

Searched `opportunity-360-client.tsx` and its panels (deal-depth, commercial, buying-journey,
win-plan) for thresholds, qualification counts, health state, lifecycle, award provenance and
missing-evidence derivations.

| # | Client derivation | Current expression | Semantic owner | Proposed code | UI consumer |
|---|---|---|---|---|---|
| 1 | health band | `:225-229` won/lost/`needsAttention`/`score < 2`/else | **rule** `dealBandCode` | `WON·LOST·AT_RISK·EARLY·ON_TRACK` | RecordHealth chip |
| 2 | "weakly qualified" finding | `:370` `status==='open' && score < 2` | **rule** `qualificationCoverageLow` | finding `QUALIFICATION_COVERAGE_LOW` | insights rail |
| 3 | qualification KPI tone | `:342` `status==='open' && score < 2 ? 'warn'` | **rule** (threshold) + UI (tone) | consumes #2's boolean | KPI tile |
| 4 | header BANT badge tone | `:392` same threshold, `: 'good'` otherwise | **rule** (threshold) + UI (tone) | consumes #2's boolean | header badge |
| 5 | **win probability override** *(NOT on the original list)* | `:215` + repeated inline at `:341` and `:392` — `won ? 100 : lost ? 0 : winProbability` | **rule** `effectiveWinProbability` | `{ percent, basis: 'OUTCOME'\|'FORECAST' }` | situation line, 2 KPIs |

### Classified as NOT business conclusions (stay in the UI)

| Item | Why |
|---|---|
| `OUTCOME` meta map `:205-208` (label/colour/tone per status) | maps an already-resolved state to presentation |
| `winPct` KPI tone `:341` (`won ? 'good' : 'neutral'`) | presentation of a resolved state |
| QUALIFY hint text `:244` (`Only n/4 confirmed`) | wording over data the rule already returned |
| tender button gating `:328-333` | orchestration/navigation, not a business verdict |
| `deal-depth-panel` `scoreColor` (`>=80/>=50`), `win-plan-panel` coverage colour (`>=100/>=50`) | map an already-computed number to a colour; the domain has no band for these |

**Answering the KPI-tone question directly:** #3 and #4 are **not** presentational. They re-run the
business threshold `score < 2` to decide *whether the deal is weakly qualified*, then colour it. The
threshold moves to the rule; the boolean→tone mapping stays in the UI.

## 2. Finding contract

Every finding carries its provenance so a consumer can explain it without re-running anything.

```
Finding = {
  code:     FindingCode
  severity: 'ATTENTION' | 'INFO'      // characterized from today's tones, NOT redesigned
  source:   RuleId                    // which rule concluded it
  data?:    structured evidence       // numbers/ids/codes — never a sentence
}
```

| FindingCode | Owner rule | Required DealFacts | Payload | Severity | Coverage effect | UI consumer today |
|---|---|---|---|---|---|---|
| `QUALIFICATION_COVERAGE_LOW` | `qualificationCoverageLow` | `qualification.confirmed`, `outcome.terminal` | `{confirmed, total}` | ATTENTION *(was `warn`)* | marks `QUALIFICATION` assessed | insights `:370`, KPI `:342`, badge `:392` |
| `AWARD_NOT_EVIDENCED` | `awardEvidenceRule` | `outcome.state` | `{state:'LEGACY_WON'}` | ATTENTION *(was `warn`)* | marks `CUSTOMER_AWARD_EVIDENCE` assessed | insights `:373` |
| `WON_NOT_QUOTED` | `shouldPromptQuoteOnWon` *(exists)* | `outcome.won/awardDocumented`, `downstream.contract.value` | — | **INFO** *(was `accent` — deliberately NOT promoted)* | none | insights `:371` |
| `OUTCOME_OPEN` | `outcomeRule` | `outcome.terminal` | — | INFO *(was `neutral`)* | none | insights `:372` |
| `COMPETITIVE_DEAL` | `competitorRule` | `strategy.competitors` | `{items}` | INFO *(was `neutral`)* | none | insights `:374` |
| `NEXT_ACTION` | `nextOpenActivityRule` | `engagement.nextOpenActivity` | `{subject, dueDate?}` | INFO *(was `accent`)* | marks `NEXT_ACTION` assessed | insights `:369` |
| `ATTENTION_GAPS` | **`opportunityAttention` — BLOCKED, see §4** | — | `{gaps:[codes]}` | ATTENTION *(was `warn`)* | marks `DEAL_ATTENTION` assessed | insights `:368`, band `:227` |

Severities are **characterized** from the current tones (`warn`/`bad` → ATTENTION, `accent`/`neutral`
→ INFO), so `attentionCount` and therefore the five-state verdict are unchanged by centralizing.

## 3. Coverage codes replace English strings

Today `required`/`assessed` are reader-facing strings, which puts English wording inside the domain
contract. Replaced by:

```
type AssessmentCheckCode =
  | 'QUALIFICATION' | 'NEXT_ACTION' | 'DEAL_ATTENTION'
  | 'CUSTOMER_AWARD_EVIDENCE' | 'CONTRACT_HANDOVER'
  | 'VALIDITY_DATES' | 'PRICING_MARGIN' | 'APPROVAL_WORKFLOW'   // quotation 360
  | 'CONTACT_CHANNEL' | 'FIRST_RESPONSE_SLA'                     // lead 360
```

**This requires splitting the shipped `assessment-state` module** (`b37c5840`): `resolveAssessment`
stays in the domain and becomes generic over the code type; `describeAssessment` — which interpolates
identifiers into a sentence — moves to the UI with a `code → label` map. **The five-state semantics
do not change**; only the identifiers do. Cost: all three consumers (lead / opportunity / quotation
360) must switch to codes, since they currently pass English.

## 4. BLOCKED — `ATTENTION_GAPS` has no DealFacts-owned rule

`opportunityAttention` (`shared/src/domain/crm.ts:557`) is an existing rule, but it consumes a raw
opportunity plus activity facts, **not DealFacts**. That leaves two bad options and one good one:

- inject its output into `assessDeal(facts, gaps)` → **the two-sources door, refused** (boundary 1);
- re-implement it over DealFacts → a **second copy** of the very rule we are de-duplicating;
- **migrate `opportunityAttention` onto DealFacts** so it has one owner.

Its gaps are all derivable from DealFacts already (`lifecycle.stage/terminal`, `lifecycle.ownerId`,
`engagement.nextOpenActivity.subject/dueDate`), so the migration is mechanical — but it has **two
consumers** (`opportunity-360.controller.ts:194` and `relationship-intelligence.controller.ts:95`)
that must move together. **Decision needed** before `ATTENTION_GAPS` can be owned properly; until
then it is the one finding that cannot migrate cleanly.

## 5. Health stays separate

`AssessmentState` (was it checked? did we find anything? can we verify?) and `DealHealthState`
(operational condition: ON_TRACK / AT_RISK / BLOCKED / STALE / CLOSED) answer different questions and
are **not** merged. No `overallState` is introduced.

The record-shell band (#1) is a **third, distinct** notion — a coarse chip the 360 shows. It cannot
consume `DealHealthState`, because that engine needs risks, commitments and committee coverage which
the 360 client does not load. It therefore stays its own rule (`dealBandCode`) with its own vocabulary,
documented as distinct from both. **Flagging for confirmation**: the alternative is to have the 360
call the depth endpoint for a canonical health state, which is an extra round trip and a wider change.

## 6. Semantic issue found, deliberately NOT fixed here

`:392` — the header BANT badge is `badgeTone: 'good'` for any non-open deal, so a **won deal showing
0/4 renders a green badge**. That is `CLOSED ≠ healthy` in miniature. Correcting it is a semantic
change and belongs in its own commit with its own test, not smuggled into this migration.

## Invariants preserved

`UNKNOWN ≠ negative` · `NOT_CAPTURED ≠ UNKNOWN` · `LEGACY_WON ≠ GOVERNED_WON` · `CLOSED ≠ ON_TRACK` ·
partial coverage ≠ healthy · `0 ≠ null`.

## Out of scope

Health scoring, Deal Depth value selection, lifecycle semantics, DealFacts shape.
