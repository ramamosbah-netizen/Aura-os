import { describe, it, expect } from 'vitest';
import { makeOpportunity, type Opportunity } from './crm';
import { buildDealFacts, type DealFactsInput, type DealFacts } from './deal-facts';
import { missingFacts, nextBestAction, shouldPromptQuoteOnWon } from './deal-rules';

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
