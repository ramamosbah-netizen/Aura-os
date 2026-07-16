import { describe, expect, it } from 'vitest';
import {
  UNATTRIBUTED,
  sourceToMarginFunnel,
  type SourceFunnelInput,
} from './source-funnel';

const base: SourceFunnelInput = {
  leads: [], opportunities: [], tenders: [], quotations: [], baselines: [], contracts: [],
  projects: [], costs: [],
};

const opp = (over: Partial<SourceFunnelInput['opportunities'][number]> = {}) => ({
  id: 'opp-1', leadId: null, source: null, stage: 'won', value: 100_000, ...over,
});
const bySource = (f: ReturnType<typeof sourceToMarginFunnel>) =>
  Object.fromEntries(f.sources.map((s) => [s.source, s]));

describe('attribution — the origin wins over the copy', () => {
  it('takes the lead\'s source over the opportunity\'s restatement of it', () => {
    const f = sourceToMarginFunnel({
      ...base,
      leads: [{ id: 'l1', source: 'referral', convertedOpportunityId: 'opp-1' }],
      opportunities: [opp({ leadId: 'l1', source: 'campaign' })],
    });
    // One deal, attributed once — to where it actually came from.
    expect(f.sources.map((s) => s.source)).toEqual(['referral']);
  });

  it('falls back to the deal\'s own source for a direct sale, and to "unknown" for neither', () => {
    const f = sourceToMarginFunnel({
      ...base,
      opportunities: [
        opp({ id: 'direct', source: 'existing_client' }),
        opp({ id: 'orphan' }),
        // A dangling leadId (lead gone) must not vanish the deal — fall back, never drop.
        opp({ id: 'dangling', leadId: 'nope', source: 'campaign' }),
      ],
    });
    const s = bySource(f);
    expect(Object.keys(s).sort()).toEqual(['campaign', 'existing_client', UNATTRIBUTED].sort());
    expect(f.totals.opportunities).toBe(3);
  });

  it('a lead with a blank source is unknown, not an empty-string source', () => {
    const f = sourceToMarginFunnel({
      ...base,
      leads: [{ id: 'l1', source: '   ', convertedOpportunityId: 'opp-1' }],
      opportunities: [opp({ leadId: 'l1' })],
    });
    expect(f.sources.map((s) => s.source)).toEqual([UNATTRIBUTED]);
  });
});

describe('the three paths from a won deal to its contract', () => {
  const won = [opp({ id: 'o-tender' }), opp({ id: 'o-quote' }), opp({ id: 'o-baseline' })];

  it('walks the tender, direct-quotation and baseline paths alike', () => {
    const f = sourceToMarginFunnel({
      ...base,
      opportunities: won,
      tenders: [{ id: 't1', sourceOpportunityId: 'o-tender' }],
      baselines: [{ id: 'b1', sourceOpportunityId: 'o-baseline' }],
      quotations: [{ sourceOpportunityId: 'o-quote', convertedContractId: 'c2' }],
      contracts: [
        { id: 'c1', tenderId: 't1', commercialBaselineId: null, value: 300_000 },
        { id: 'c2', tenderId: null, commercialBaselineId: null, value: 200_000 },
        { id: 'c3', tenderId: null, commercialBaselineId: 'b1', value: 500_000 },
      ],
    });
    expect(f.totals.contractValue).toBe(1_000_000);
    expect(f.coverage.wonNotContracted).toBe(0);
  });

  it('counts a contract reached by two paths once', () => {
    const f = sourceToMarginFunnel({
      ...base,
      opportunities: [opp({ id: 'o1' })],
      tenders: [{ id: 't1', sourceOpportunityId: 'o1' }],
      baselines: [{ id: 'b1', sourceOpportunityId: 'o1' }],
      // Same contract, reachable via its tender AND its baseline.
      contracts: [{ id: 'c1', tenderId: 't1', commercialBaselineId: 'b1', value: 400_000 }],
    });
    expect(f.totals.contractValue).toBe(400_000);
    expect(f.sources[0].contracted).toBe(1);
  });
});

describe('§29 honesty — an undelivered win has no margin, and that is not zero', () => {
  it('reports a win with no contract as unmeasured, never as 0% margin', () => {
    const f = sourceToMarginFunnel({
      ...base,
      opportunities: [opp({ id: 'o1', source: 'referral', value: 800_000 })],
    });
    const s = f.sources[0];
    expect(s.won).toBe(1);
    expect(s.contracted).toBe(0);
    expect(s.actualMargin).toBeNull();
    expect(s.marginPercent).toBeNull();
    expect(s.actualCost).toBeNull();
    expect(s.measurementNote).toBe('1 win(s) not yet contracted — margin unknown');
    expect(f.coverage).toMatchObject({ wonNotContracted: 1, measuredPercent: 0 });
  });

  it('a contract with a project but NO recorded cost is unmeasured — no CBS rows is not zero cost', () => {
    const f = sourceToMarginFunnel({
      ...base,
      opportunities: [opp({ id: 'o1', source: 'referral' })],
      quotations: [{ sourceOpportunityId: 'o1', convertedContractId: 'c1' }],
      contracts: [{ id: 'c1', tenderId: null, commercialBaselineId: null, value: 500_000 }],
      projects: [{ id: 'p1', contractId: 'c1', status: 'in_progress' }],
      costs: [{ projectId: 'p1', actualCost: 0, hasCostRecord: false }],
    });
    const s = f.sources[0];
    expect(s.contracted).toBe(1);
    expect(s.measured).toBe(0);
    expect(s.actualMargin).toBeNull();
    expect(s.measurementNote).toBe('1 contract(s) with no recorded cost — margin unknown');
    expect(f.coverage.contractedNotMeasured).toBe(1);
  });

  it('a genuinely zero cost IS measured — recorded zero and no record are different facts', () => {
    const f = sourceToMarginFunnel({
      ...base,
      opportunities: [opp({ id: 'o1', source: 'referral', value: 100_000 })],
      quotations: [{ sourceOpportunityId: 'o1', convertedContractId: 'c1' }],
      contracts: [{ id: 'c1', tenderId: null, commercialBaselineId: null, value: 100_000 }],
      projects: [{ id: 'p1', contractId: 'c1', status: 'completed' }],
      costs: [{ projectId: 'p1', actualCost: 0, hasCostRecord: true }],
    });
    expect(f.sources[0].measured).toBe(1);
    expect(f.sources[0].actualMargin).toBe(100_000);
    expect(f.sources[0].marginPercent).toBe(100);
  });

  it('margin speaks only for the measured subset, and says so', () => {
    const f = sourceToMarginFunnel({
      ...base,
      opportunities: [
        opp({ id: 'o1', source: 'referral', value: 400_000 }),
        opp({ id: 'o2', source: 'referral', value: 600_000 }), // won, undelivered
      ],
      quotations: [{ sourceOpportunityId: 'o1', convertedContractId: 'c1' }],
      contracts: [{ id: 'c1', tenderId: null, commercialBaselineId: null, value: 400_000 }],
      projects: [{ id: 'p1', contractId: 'c1', status: 'completed' }],
      costs: [{ projectId: 'p1', actualCost: 300_000, hasCostRecord: true }],
    });
    const s = f.sources[0];
    expect(s.won).toBe(2);
    expect(s.wonValue).toBe(1_000_000);
    // The margin is 100k on 400k — NOT on the 1M won. The revenue it is a margin ON is named.
    expect(s.measuredRevenue).toBe(400_000);
    expect(s.actualMargin).toBe(100_000);
    expect(s.marginPercent).toBe(25);
    expect(s.measurementNote).toBe('margin covers 1 of 2 win(s); the rest are not delivered or costed yet');
    expect(f.coverage.measuredPercent).toBe(50);
  });

  it('sums cost across every project on a contract', () => {
    const f = sourceToMarginFunnel({
      ...base,
      opportunities: [opp({ id: 'o1', source: 'referral' })],
      quotations: [{ sourceOpportunityId: 'o1', convertedContractId: 'c1' }],
      contracts: [{ id: 'c1', tenderId: null, commercialBaselineId: null, value: 1_000_000 }],
      projects: [
        { id: 'p1', contractId: 'c1', status: 'completed' },
        { id: 'p2', contractId: 'c1', status: 'completed' },
      ],
      costs: [
        { projectId: 'p1', actualCost: 300_000, hasCostRecord: true },
        { projectId: 'p2', actualCost: 250_000, hasCostRecord: true },
      ],
    });
    expect(f.sources[0].actualCost).toBe(550_000);
    expect(f.sources[0].actualMargin).toBe(450_000);
  });
});

describe('rates and ranking', () => {
  it('an undecided source has no win rate — null, not 0%', () => {
    const f = sourceToMarginFunnel({
      ...base,
      opportunities: [opp({ id: 'o1', source: 'campaign', stage: 'proposal' })],
    });
    expect(f.sources[0].winRate).toBeNull();
    expect(f.sources[0].open).toBe(1);
    expect(f.sources[0].measurementNote).toBe('no wins yet — nothing to measure');
  });

  it('win rate is won / decided — open deals never dilute it', () => {
    const f = sourceToMarginFunnel({
      ...base,
      opportunities: [
        opp({ id: 'o1', source: 'referral', stage: 'won' }),
        opp({ id: 'o2', source: 'referral', stage: 'lost' }),
        opp({ id: 'o3', source: 'referral', stage: 'proposal' }),
        opp({ id: 'o4', source: 'referral', stage: 'proposal' }),
      ],
    });
    expect(f.sources[0].winRate).toBe(50);
  });

  it('ranks by measured margin, and an unmeasured source never outranks a measured one', () => {
    const f = sourceToMarginFunnel({
      ...base,
      opportunities: [
        opp({ id: 'o1', source: 'small_but_real', value: 100_000 }),
        opp({ id: 'o2', source: 'huge_but_unproven', value: 9_000_000 }),
      ],
      quotations: [{ sourceOpportunityId: 'o1', convertedContractId: 'c1' }],
      contracts: [{ id: 'c1', tenderId: null, commercialBaselineId: null, value: 100_000 }],
      projects: [{ id: 'p1', contractId: 'c1', status: 'completed' }],
      costs: [{ projectId: 'p1', actualCost: 60_000, hasCostRecord: true }],
    });
    expect(f.sources.map((s) => s.source)).toEqual(['small_but_real', 'huge_but_unproven']);
    expect(f.sources[1].actualMargin).toBeNull();
  });
});

describe('determinism and emptiness', () => {
  it('no deals ⇒ an empty funnel, not a wall of zeros', () => {
    const f = sourceToMarginFunnel(base);
    expect(f.sources).toEqual([]);
    expect(f.totals.actualMargin).toBeNull();
    expect(f.coverage.measuredPercent).toBeNull();
  });

  it('is pure: same facts ⇒ same funnel', () => {
    const input = { ...base, opportunities: [opp({ source: 'referral' })] };
    expect(sourceToMarginFunnel(input)).toEqual(sourceToMarginFunnel(input));
  });
});
