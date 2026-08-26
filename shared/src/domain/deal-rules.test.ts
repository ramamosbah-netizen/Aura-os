import { describe, it, expect } from 'vitest';
import { makeOpportunity, type Opportunity } from './crm';
import { resolveDealOutcome } from './opportunity-outcome';
import { buildDealFacts, type DealFactsInput, type DealFacts } from './deal-facts';
import { missingFacts, nextBestAction, shouldPromptQuoteOnWon, resolveDealValue, dealValueInputsOf, resolveEffectiveWinProbability } from './deal-rules';

// Deterministic rules over DealFacts. Two kinds of test are kept deliberately separate:
//   CHARACTERIZATION — the previous behaviour is intentionally PRESERVED
//   SEMANTIC         — the previous behaviour is intentionally CORRECTED
// Mixing them is how a silent behaviour change gets called a refactor.

const opp = (over: Partial<Opportunity> = {}): Opportunity => ({
  ...makeOpportunity({ tenantId: 't1', title: 'Marina Gate ELV', value: 0, executionType: 'direct_sale' }),
  ...over,
});
const facts = (over: Partial<DealFactsInput> = {}): DealFacts => buildDealFacts({
  opportunity: opp(), stakeholders: [], quotations: [], contracts: [], projects: [], ...over,
});
const withActivity = { engagement: { nextOpenActivity: { subject: 'Call Layla', dueDate: '2026-09-01', assigneeId: 'u-1' } } };
const governedWon = opp({ stage: 'won', awardSource: 'quotation_accepted', awardedQuotationId: 'q-1', contractedValue: 33986.67 });
const legacyWon = opp({ stage: 'won' });

describe('missingFacts — CHARACTERIZATION of the previous client rule', () => {
  it('an empty open deal reports every gap, in the original order', () => {
    expect(missingFacts(facts())).toEqual(['BUDGET', 'AUTHORITY', 'NEED', 'TIMELINE', 'STAKEHOLDERS', 'NEXT_ACTION', 'CLOSE_DATE']);
  });

  it('a confirmed dimension drops out', () => {
    expect(missingFacts(facts({ opportunity: opp({ needConfirmed: true }) }))).not.toContain('NEED');
  });

  it('stakeholders / next action / close date drop out when present', () => {
    const f = facts({
      opportunity: opp({ closeDate: '2026-12-01' }),
      stakeholders: [{ id: 's-1', name: 'Layla' }],
      ...withActivity,
    });
    const m = missingFacts(f);
    expect(m).not.toContain('STAKEHOLDERS');
    expect(m).not.toContain('NEXT_ACTION');
    expect(m).not.toContain('CLOSE_DATE');
  });

  it('a CLOSED deal reports nothing — unanswered questions become history, not work', () => {
    expect(missingFacts(facts({ opportunity: legacyWon }))).toEqual([]);
    expect(missingFacts(facts({ opportunity: opp({ stage: 'lost' }) }))).toEqual([]);
  });

  it('UNKNOWN never reads as answered — absence propagates honestly', () => {
    // Every dimension is UNKNOWN on a fresh deal; all four must appear as missing.
    const m = missingFacts(facts());
    expect(m).toEqual(expect.arrayContaining(['BUDGET', 'AUTHORITY', 'NEED', 'TIMELINE']));
  });
});

describe('nextBestAction — OPEN deals: CHARACTERIZATION (order and threshold preserved)', () => {
  it('a scheduled activity wins over everything', () => {
    expect(nextBestAction(facts({ ...withActivity }))).toBe('WORK_NEXT_STEP');
  });

  it('BOUNDARY: fewer than 2 confirmed -> QUALIFY; exactly 2 -> past it', () => {
    expect(nextBestAction(facts({ opportunity: opp({ needConfirmed: true }) }))).toBe('QUALIFY'); // 1
    const two = opp({ needConfirmed: true, budgetConfirmed: true }); // 2 — threshold boundary
    expect(nextBestAction(facts({ opportunity: two }))).toBe('MAP_DECISION_MAKER');
  });

  it('with 2+ confirmed and a stakeholder mapped -> LOG_NEXT_STEP', () => {
    const f = facts({ opportunity: opp({ needConfirmed: true, budgetConfirmed: true }), stakeholders: [{ id: 's-1', name: 'Layla' }] });
    expect(nextBestAction(f)).toBe('LOG_NEXT_STEP');
  });

  it('a LOST deal proposes nothing', () => {
    expect(nextBestAction(facts({ opportunity: opp({ stage: 'lost' }) }))).toBe('NONE');
  });
});

describe('nextBestAction — WON deals: SEMANTIC CORRECTION (deliberate, not a refactor)', () => {
  it('OLD BEHAVIOUR WAS WRONG: a governed win no longer asks for a quotation it already has', () => {
    // Previously: any won non-tender deal -> "Generate quotation", even one won BECAUSE its
    // quotation was accepted. Verified live on the E2E deal before this change.
    const key = nextBestAction(facts({ opportunity: governedWon }));
    expect(key).not.toBe('GENERATE_QUOTATION');
    expect(key).toBe('CONVERT_TO_CONTRACT');
  });

  it('governed win WITH a contract -> NONE (the chain is complete as far as we can tell)', () => {
    const f = facts({ opportunity: governedWon, contracts: [{ id: 'c-1', status: 'active', value: 40000 }] });
    expect(nextBestAction(f)).toBe('NONE');
  });

  it('PRESERVED: a win with NO provenance still offers to generate the quotation', () => {
    expect(nextBestAction(facts({ opportunity: legacyWon }))).toBe('GENERATE_QUOTATION');
  });

  it('PRESERVED: the tender route is excluded, read from the RAW requiresTender flag', () => {
    expect(nextBestAction(facts({ opportunity: opp({ stage: 'won', requiresTender: true }) }))).toBe('NONE');
  });

  it('never proposes capturing a PO/LOA — AURA has nowhere to record one (NOT_CAPTURED)', () => {
    const f = facts({ opportunity: governedWon });
    expect(f.awardEvidence.customerPoOrLoa.status).toBe('NOT_CAPTURED');
    expect(nextBestAction(f)).toBe('CONVERT_TO_CONTRACT'); // a capability that actually exists
  });

  it('CONTRADICTORY DATA: award documented but value null still routes on provenance, not money', () => {
    const f = facts({ opportunity: opp({ stage: 'won', awardSource: 'quotation_accepted', contractedValue: null }) });
    expect(f.commercial.awardValue).toBeNull();
    expect(nextBestAction(f)).toBe('CONVERT_TO_CONTRACT');
  });

  it('STALE DATA: a legacy win carrying an orphan contractedValue is still treated as unevidenced', () => {
    const f = facts({ opportunity: opp({ stage: 'won', contractedValue: 999999 }) });
    expect(f.outcome.awardDocumented).toBe(false);
    expect(nextBestAction(f)).toBe('GENERATE_QUOTATION');
  });
});

describe('shouldPromptQuoteOnWon — migrated onto DealFacts', () => {
  it('never prompts a documented award', () => {
    expect(shouldPromptQuoteOnWon(facts({ opportunity: governedWon }))).toBe(false);
  });

  it('prompts a legacy win with no contract', () => {
    expect(shouldPromptQuoteOnWon(facts({ opportunity: legacyWon }))).toBe(true);
  });

  it('does not prompt a legacy win that already has a contract — including one worth a real 0', () => {
    expect(shouldPromptQuoteOnWon(facts({ opportunity: legacyWon, contracts: [{ id: 'c-1', status: 'active', value: 0 }] }))).toBe(false);
  });

  it('never prompts an open or lost deal', () => {
    expect(shouldPromptQuoteOnWon(facts())).toBe(false);
    expect(shouldPromptQuoteOnWon(facts({ opportunity: opp({ stage: 'lost' }) }))).toBe(false);
  });
});

describe('rule purity — conclusions carry no UI', () => {
  it('outputs are codes only: no wording, hrefs, colours or handlers', () => {
    const f = facts({ opportunity: governedWon });
    expect(typeof nextBestAction(f)).toBe('string');
    expect(JSON.stringify(missingFacts(f))).not.toMatch(/href|onClick|var\(--|Generate the|please/i);
  });
});

describe('resolveDealValue — lifecycle-aware, NOT a blanket field swap', () => {
  const V = (over = {}) => resolveDealValue({ awardDocumented: false, awardValue: null, headlineValue: null, ...over });

  it('SEMANTIC CORRECTION: a documented award speaks with the AWARD value, not the headline', () => {
    // The live defect: Deal Depth fed opp.value (0) into the health engine's `value <= 0` check,
    // so a deal awarded at 33,986.67 was scored as "no deal value recorded".
    expect(V({ awardDocumented: true, awardValue: 33986.67, headlineValue: 0 })).toEqual({ amount: 33986.67, basis: 'AWARD' });
  });

  it('CHARACTERIZED: before an award the headline forecast is still the value', () => {
    expect(V({ headlineValue: 250000 })).toEqual({ amount: 250000, basis: 'HEADLINE' });
  });

  it('CHARACTERIZED: a win with NO provenance keeps the headline — nothing authoritative to promote', () => {
    expect(V({ awardDocumented: false, awardValue: null, headlineValue: 120000 })).toEqual({ amount: 120000, basis: 'HEADLINE' });
  });

  it('a stale contractedValue on an unevidenced win is never promoted (it is not even an input)', () => {
    expect(V({ awardDocumented: false, awardValue: 999999, headlineValue: 10 })).toEqual({ amount: 10, basis: 'HEADLINE' });
  });

  it('INCONSISTENT: award documented but no value -> NONE, never 0 and never the headline', () => {
    expect(V({ awardDocumented: true, awardValue: null, headlineValue: 250000 })).toEqual({ amount: null, basis: 'NONE' });
  });

  it('THE ZERO RULE holds: a real 0 keeps its basis; only true absence is NONE', () => {
    expect(V({ headlineValue: 0 })).toEqual({ amount: 0, basis: 'HEADLINE' });
    expect(V({ awardDocumented: true, awardValue: 0, headlineValue: 5 })).toEqual({ amount: 0, basis: 'AWARD' });
    expect(V({})).toEqual({ amount: null, basis: 'NONE' });
  });

  it('contract value is not an input — the two measures never merge', () => {
    expect(Object.keys(dealValueInputsOf(facts({ opportunity: governedWon, contracts: [{ id: 'c-1', status: 'active', value: 99999 }] }))).sort())
      .toEqual(['awardDocumented', 'awardValue', 'headlineValue']);
  });

  it('reads straight off DealFacts via the adapter', () => {
    expect(resolveDealValue(dealValueInputsOf(facts({ opportunity: governedWon })))).toEqual({ amount: 33986.67, basis: 'AWARD' });
  });
});

describe('resolveEffectiveWinProbability — stored, effective and forecast are different facts', () => {
  const outcomeOf = (o: Opportunity) => resolveDealOutcome(o);
  const P = (o: Opportunity, storedProbability: number) =>
    resolveEffectiveWinProbability({ outcome: outcomeOf(o), storedProbability });
  const open = opp({ stage: 'proposal' });

  it('GOVERNED_WON + any stored number -> 100 / WON_OUTCOME', () => {
    expect(P(governedWon, 60)).toEqual({ value: 100, basis: 'WON_OUTCOME' });
  });

  it('LEGACY_WON + any stored number -> 100 / WON_OUTCOME (provenance does not change certainty)', () => {
    expect(P(legacyWon, 20)).toEqual({ value: 100, basis: 'WON_OUTCOME' });
  });

  it('LOST + any stored number -> 0 / LOST_OUTCOME', () => {
    expect(P(opp({ stage: 'lost' }), 80)).toEqual({ value: 0, basis: 'LOST_OUTCOME' });
  });

  it('OPEN + 0 -> 0 / STORED_PROBABILITY (a real stored 0)', () => {
    expect(P(open, 0)).toEqual({ value: 0, basis: 'STORED_PROBABILITY' });
  });

  it('OPEN + 65 -> 65 / STORED_PROBABILITY', () => {
    expect(P(open, 65)).toEqual({ value: 65, basis: 'STORED_PROBABILITY' });
  });

  it('THE POINT OF THE BASIS: open-at-100 and won-at-100 are the same number, different facts', () => {
    expect(P(open, 100)).toEqual({ value: 100, basis: 'STORED_PROBABILITY' });
    expect(P(governedWon, 100)).toEqual({ value: 100, basis: 'WON_OUTCOME' });
  });

  it('OPEN + 150 -> passed through visibly (characterization of representable bad data)', () => {
    expect(P(open, 150)).toEqual({ value: 150, basis: 'STORED_PROBABILITY' });
  });

  it('OPEN + -10 -> passed through visibly (NOT validation approval)', () => {
    expect(P(open, -10)).toEqual({ value: -10, basis: 'STORED_PROBABILITY' });
  });

  it('the rule never rewrites the stored value', () => {
    const input = { outcome: outcomeOf(governedWon), storedProbability: 60 };
    resolveEffectiveWinProbability(input);
    expect(input.storedProbability).toBe(60);
  });
});
