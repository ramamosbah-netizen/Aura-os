import { describe, it, expect } from 'vitest';
import { makeOpportunity, type Opportunity } from './crm';
import { buildDealFacts, competitorsFromText, type DealFactsInput } from './deal-facts';

// DealFacts contract tests. The tree carries FACTS ONLY — the assertions below pin the boundary
// (no bands, no health, no gate decisions, no findings) and the null discipline that keeps the
// system from claiming more than it knows.

const opp = (over: Partial<Opportunity> = {}): Opportunity => ({
  ...makeOpportunity({ tenantId: 't1', title: 'Marina Gate ELV', value: 0, executionType: 'direct_sale' }),
  ...over,
});

const input = (over: Partial<DealFactsInput> = {}): DealFactsInput => ({
  opportunity: opp(),
  requirementCount: 0,
  stakeholders: [],
  quotations: [],
  contracts: [],
  projects: [],
  ...over,
});

describe('lifecycle states — open, lost, legacy won, governed won', () => {
  it('OPEN deal', () => {
    const f = buildDealFacts(input());
    expect(f.outcome.state).toBe('OPEN');
    expect(f.outcome.terminal).toBe(false);
    expect(f.outcome.awardDocumented).toBe(false);
    expect(f.commercial.awardValue).toBeNull();
  });

  it('LOST deal keeps its reason and claims no award value', () => {
    const f = buildDealFacts(input({ opportunity: opp({ stage: 'lost', lossReason: 'Price' }) }));
    expect(f.outcome.state).toBe('LOST');
    expect(f.outcome.lossReason).toBe('Price');
    expect(f.commercial.awardValue).toBeNull();
  });

  it('LEGACY_WON — won with no provenance, so no award value even if a stale figure is stored', () => {
    const f = buildDealFacts(input({ opportunity: opp({ stage: 'won', contractedValue: 999999 }) }));
    expect(f.outcome.state).toBe('LEGACY_WON');
    expect(f.outcome.awardDocumented).toBe(false);
    expect(f.commercial.awardValue).toBeNull();
  });

  it('GOVERNED_WON — award provenance carries the value', () => {
    const f = buildDealFacts(input({
      opportunity: opp({ stage: 'won', awardSource: 'quotation_accepted', awardedQuotationId: 'q-1', contractedValue: 33986.67 }),
    }));
    expect(f.outcome.state).toBe('GOVERNED_WON');
    expect(f.outcome.awardDocumented).toBe(true);
    expect(f.commercial.awardValue).toBe(33986.67);
    expect(f.commercial.acceptedQuotationId).toBe('q-1');
  });

  it('award provenance reuses the resolver — it is not re-derived here', () => {
    // stage won + source set is the ONLY way awardDocumented becomes true.
    const f = buildDealFacts(input({ opportunity: opp({ stage: 'proposal', awardSource: 'quotation_accepted', contractedValue: 500 }) }));
    expect(f.outcome.awardDocumented).toBe(false);
    expect(f.commercial.awardValue).toBeNull();
  });
});

describe('THE ZERO RULE — a real 0 survives; a fabricated 0 becomes null', () => {
  it('no contract → value null, not 0 (this is the Deal Depth false-zero)', () => {
    const f = buildDealFacts(input());
    expect(f.downstream.contract.exists).toBe(false);
    expect(f.downstream.contract.value).toBeNull();
  });

  it('a contract genuinely worth 0 keeps its 0 — we are not deleting legitimate zeros', () => {
    const f = buildDealFacts(input({ contracts: [{ id: 'c-1', status: 'active', value: 0 }] }));
    expect(f.downstream.contract.exists).toBe(true);
    expect(f.downstream.contract.value).toBe(0);
    expect(f.downstream.contract.value).not.toBeNull();
  });

  it('no quotation → quotedTotal null; a quotation totalling 0 → 0', () => {
    expect(buildDealFacts(input()).commercial.quotedTotal).toBeNull();
    expect(buildDealFacts(input({ quotations: [{ id: 'q-1', total: 0, status: 'draft' }] })).commercial.quotedTotal).toBe(0);
  });

  it('a headline value of 0 is a real typed 0, not unknown', () => {
    expect(buildDealFacts(input({ opportunity: opp({ value: 0 }) })).commercial.headlineValue).toBe(0);
  });

  it('cancelled contracts are excluded, and all-cancelled reads as no contract (null, not 0)', () => {
    const f = buildDealFacts(input({ contracts: [{ id: 'c-1', status: 'cancelled', value: 5000 }] }));
    expect(f.downstream.contract.exists).toBe(false);
    expect(f.downstream.contract.value).toBeNull();
  });
});

describe('money stays semantically separate', () => {
  it('quoted total (incl VAT), award value (excl VAT) and contract value are three distinct fields', () => {
    const f = buildDealFacts(input({
      opportunity: opp({ stage: 'won', awardSource: 'quotation_accepted', awardedQuotationId: 'q-1', contractedValue: 33986.67, value: 250000 }),
      quotations: [{ id: 'q-1', total: 35686, status: 'accepted' }],
      contracts: [{ id: 'c-1', status: 'active', value: 40000 }],
    }));
    expect(f.commercial.quotedTotal).toBe(35686);      // incl. VAT
    expect(f.commercial.awardValue).toBe(33986.67);    // excl. VAT
    expect(f.downstream.contract.value).toBe(40000);   // a later, independently mutable figure
    expect(f.commercial.headlineValue).toBe(250000);   // the forecast, feeding nothing
  });

  it('INCONSISTENT DATA: award provenance with a null value stays null — never 0, never the contract sum', () => {
    const f = buildDealFacts(input({
      opportunity: opp({ stage: 'won', awardSource: 'quotation_accepted', awardedQuotationId: 'q-1', contractedValue: null }),
      contracts: [{ id: 'c-1', status: 'active', value: 40000 }],
    }));
    expect(f.outcome.awardDocumented).toBe(true);
    expect(f.commercial.awardValue).toBeNull();
    expect(f.downstream.contract.value).toBe(40000);
  });
});

describe('competitors — absence can never mean "there are none"', () => {
  it('blank/null stays UNKNOWN', () => {
    for (const v of [null, '', '   ', ',, ;']) expect(competitorsFromText(v).state).toBe('UNKNOWN');
    expect(competitorsFromText(null).items).toEqual([]);
  });

  it('names present → KNOWN_PRESENT', () => {
    const c = competitorsFromText('Rival ELV LLC, Acme Systems');
    expect(c.state).toBe('KNOWN_PRESENT');
    expect(c.items).toEqual(['Rival ELV LLC', 'Acme Systems']);
  });

  it('KNOWN_NONE is UNREACHABLE from today\'s data — AURA cannot record "no competitors"', () => {
    const states = [null, '', 'a', 'a,b'].map((v) => competitorsFromText(v).state);
    expect(states).not.toContain('KNOWN_NONE');
  });
});

describe('epistemic honesty', () => {
  it('customer PO/LOA is NOT_CAPTURED — no storage exists, so it must not read as "we checked"', () => {
    expect(buildDealFacts(input()).awardEvidence.customerPoOrLoa.status).toBe('NOT_CAPTURED');
  });

  it('buyingStage null means never assessed and is not collapsed into a stage', () => {
    expect(buildDealFacts(input()).strategy.customerBuyingStage).toBeNull();
  });

  it('no scheduled activity → null, which is not the same as overdue', () => {
    const f = buildDealFacts(input());
    expect(f.engagement.nextOpenActivity).toBeNull();
    expect(f.engagement.lastActivityAt).toBeNull();
  });

  it('partial qualification stays partial — states only, and no band is emitted', () => {
    const f = buildDealFacts(input({ opportunity: opp({ needConfirmed: true }) }));
    expect(f.qualification.confirmed).toBe(1);
    expect(f.qualification.unknown).toBe(3);
    expect(f.qualification.dimensions.find((d) => d.key === 'need')!.status).toBe('CONFIRMED');
    expect('band' in f.qualification).toBe(false);
  });

  it('stakeholder contact details are PRESENCE facts, not a reachability verdict', () => {
    const f = buildDealFacts(input({
      stakeholders: [{ id: 's-1', name: 'Layla', email: null, phone: '  ', isPrimary: true, stakeholderRole: 'decision_maker' }],
    }));
    expect(f.stakeholders.people[0]).toMatchObject({ hasEmail: false, hasPhone: false, isPrimary: true, role: 'decision_maker' });
  });
});

describe('THE BOUNDARY — conclusions must never appear in the fact tree', () => {
  it('carries no health, band, gate decision, attention finding, recommendation or wording', () => {
    const f = buildDealFacts(input({ opportunity: opp({ stage: 'won', awardSource: 'manual_override', contractedValue: 1 }) }));
    const json = JSON.stringify(f);
    for (const forbidden of ['health', 'score', 'band', 'needsAttention', 'gaps', 'nextBestAction', 'readiness', 'ON_TRACK', 'recommend']) {
      expect(json).not.toContain(forbidden);
    }
  });

  it('top-level shape is exactly the agreed domain subtrees', () => {
    expect(Object.keys(buildDealFacts(input())).sort()).toEqual([
      'awardEvidence', 'commercial', 'downstream', 'engagement', 'lifecycle', 'outcome', 'qualification', 'stakeholders', 'strategy',
    ]);
  });
});
