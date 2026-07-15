import { describe, expect, it } from 'vitest';
import {
  assessOpportunityHealth, dealHealthBand,
  type DealHealthInputs, type ExecutionFacts,
} from './opportunity-health';
import type { StakeholderCoverage, CommitmentSummary } from './opportunity-depth';
import type { RegisterSummary } from './deal-register';
import type { BuyingAlignment } from './buying-journey';
import { makeRisk, setRiskStatus } from './opportunity-risk';

// Healthy baselines for each signal — a deal with nothing wrong.
const NOW = new Date('2026-07-15T12:00:00Z');
const okCoverage: StakeholderCoverage = { count: 4, gaps: [], score: 100, needsAttention: false };
const okCommitments: CommitmentSummary = { open: 1, overdue: 0, fulfilled: 3, broken: 0, needsAttention: false };
const okRegister: RegisterSummary = {
  decisions: 2, assumptions: 2, openQuestions: 0, open: 0,
  unvalidatedAssumptions: 0, invalidatedAssumptions: 0, overdue: 0, needsAttention: false,
};
const aligned: BuyingAlignment = { assessed: true, aligned: true, gap: 0, severity: null, reason: null };
const notAssessed: BuyingAlignment = { assessed: false, aligned: true, gap: 0, severity: null, reason: null };
const okExecution: ExecutionFacts = {
  hasOwner: true, hasNextAction: true,
  nextActionDueIso: '2026-07-20T12:00:00Z', lastActivityIso: '2026-07-14T12:00:00Z',
};

const inputs = (o: Partial<DealHealthInputs>): DealHealthInputs => ({
  stage: 'negotiation',
  execution: okExecution,
  coverage: okCoverage,
  commercial: { value: 500_000, closeDateIso: '2026-09-30' },
  competitorsNamed: true,
  alignment: aligned,
  commitments: okCommitments,
  register: okRegister,
  now: NOW,
  ...o,
});

describe('dealHealthBand', () => {
  it('maps scores to bands at the 70/45 thresholds', () => {
    expect(dealHealthBand(100)).toBe('HEALTHY');
    expect(dealHealthBand(70)).toBe('HEALTHY');
    expect(dealHealthBand(69)).toBe('AT_RISK');
    expect(dealHealthBand(45)).toBe('AT_RISK');
    expect(dealHealthBand(44)).toBe('CRITICAL');
    expect(dealHealthBand(0)).toBe('CRITICAL');
  });
});

describe('assessOpportunityHealth — the five vision dimensions', () => {
  it('a clean deal is ON_TRACK / HEALTHY with score 100 and no reasons', () => {
    const h = assessOpportunityHealth(inputs({}));
    expect(h.state).toBe('ON_TRACK');
    expect(h.band).toBe('HEALTHY');
    expect(h.score).toBe(100);
    expect(h.reasons).toEqual([]);
    expect(h.needsAttention).toBe(false);
    expect(h.dimensions.map((d) => d.key)).toEqual(['execution', 'relationship', 'commercial', 'competitive', 'decision']);
  });

  it('execution folds ownership, next action, activity recency and promises', () => {
    const h = assessOpportunityHealth(inputs({
      execution: { hasOwner: false, hasNextAction: false, nextActionDueIso: null, lastActivityIso: null },
      commitments: { open: 1, overdue: 1, fulfilled: 0, broken: 1, needsAttention: true },
    }));
    const ex = h.dimensions.find((d) => d.key === 'execution')!;
    expect(ex.band).toBe('CRITICAL');
    expect(ex.reasons).toEqual(expect.arrayContaining([
      'no owner assigned', 'no next action', 'no activity ever logged', '1 broken promise', '1 overdue commitment',
    ]));
  });

  it('commercial flags a valueless deal and a passed close date', () => {
    const h = assessOpportunityHealth(inputs({ commercial: { value: 0, closeDateIso: '2026-07-01' } }));
    const com = h.dimensions.find((d) => d.key === 'commercial')!;
    expect(com.reasons).toEqual(expect.arrayContaining(['no deal value recorded', 'expected close date has passed']));
    expect(com.band).toBe('CRITICAL');
  });

  it('competitive: unjudged early, a finding at proposal, evidence when named or risked', () => {
    // Early stage, nothing recorded → not applicable, not punished.
    const early = assessOpportunityHealth(inputs({ stage: 'discovery', competitorsNamed: false }));
    expect(early.dimensions.find((d) => d.key === 'competitive')!.applicable).toBe(false);

    // Proposal stage with an unknown field IS a finding.
    const blind = assessOpportunityHealth(inputs({ stage: 'proposal', competitorsNamed: false }));
    const comp = blind.dimensions.find((d) => d.key === 'competitive')!;
    expect(comp.applicable).toBe(true);
    expect(comp.reasons).toContain('competitive landscape unknown at this stage');
    expect(comp.band).toBe('AT_RISK');
  });

  it('decision folds journey misalignment and the register', () => {
    const ahead: BuyingAlignment = { assessed: true, aligned: false, gap: 2, severity: 'HIGH', reason: 'we are well ahead of the buyer' };
    const h = assessOpportunityHealth(inputs({
      alignment: ahead,
      register: { ...okRegister, invalidatedAssumptions: 1, needsAttention: true },
    }));
    const dec = h.dimensions.find((d) => d.key === 'decision')!;
    expect(dec.band).toBe('CRITICAL'); // 100 - 60 - 25 = 15
    expect(dec.reasons).toEqual(expect.arrayContaining(['we are well ahead of the buyer', '1 invalidated assumption']));
  });

  it('decision is excluded when there is nothing to judge', () => {
    const h = assessOpportunityHealth(inputs({
      alignment: notAssessed,
      register: { decisions: 0, assumptions: 0, openQuestions: 0, open: 0, unvalidatedAssumptions: 0, invalidatedAssumptions: 0, overdue: 0, needsAttention: false },
    }));
    expect(h.dimensions.find((d) => d.key === 'decision')!.applicable).toBe(false);
    expect(h.band).toBe('HEALTHY');
  });

  it('an explicit open risk weighs on its home dimension with the risk title as evidence', () => {
    const risk = makeRisk({ tenantId: 't1', opportunityId: 'o1', type: 'COMPETITIVE', title: 'Incumbent undercutting', likelihood: 'high', impact: 'high' });
    const h = assessOpportunityHealth(inputs({ risks: [risk] }));
    const comp = h.dimensions.find((d) => d.key === 'competitive')!;
    expect(comp.score).toBeLessThan(100);
    expect(comp.reasons.join(' ')).toContain('Incumbent undercutting');
  });

  it('overall band is never rosier than the worst dimension — one critical signal dominates', () => {
    const cov: StakeholderCoverage = { count: 0, gaps: ['NO_STAKEHOLDERS'], score: 0, needsAttention: true };
    const h = assessOpportunityHealth(inputs({ coverage: cov }));
    expect(h.band).toBe('CRITICAL');
    expect(h.state).toBe('AT_RISK');
    expect(h.score).toBeGreaterThan(70); // mean stays high; the band is floored by the worst
    expect(h.reasons[0]).toBe('no stakeholders mapped');
  });
});

describe('assessOpportunityHealth — the five states', () => {
  it('BLOCKED: an unmitigated critical risk names itself', () => {
    let risk = makeRisk({ tenantId: 't1', opportunityId: 'o1', type: 'COMMERCIAL', title: 'Payment terms rejected', likelihood: 'high', impact: 'high' }); // high×high → CRITICAL
    const h = assessOpportunityHealth(inputs({ risks: [risk] }));
    expect(h.state).toBe('BLOCKED');
    expect(h.stateReason).toContain('Payment terms rejected');

    // Mitigating it un-blocks (still unhealthy, but being worked).
    risk = setRiskStatus(risk, 'MITIGATING');
    expect(assessOpportunityHealth(inputs({ risks: [risk] })).state).not.toBe('BLOCKED');
  });

  it('BLOCKED: an unmanaged blocker in the buying committee', () => {
    const cov: StakeholderCoverage = { count: 3, gaps: ['BLOCKER_UNMANAGED'], score: 60, needsAttention: true };
    const h = assessOpportunityHealth(inputs({ coverage: cov }));
    expect(h.state).toBe('BLOCKED');
    expect(h.stateReason).toContain('blocker');
  });

  it('STALE: quiet past the threshold with nothing scheduled — distinct from AT_RISK', () => {
    const h = assessOpportunityHealth(inputs({
      execution: { ...okExecution, lastActivityIso: '2026-05-01T12:00:00Z', nextActionDueIso: null, hasNextAction: false },
    }));
    expect(h.state).toBe('STALE');
    expect(h.stateReason).toContain('no activity in');
  });

  it('a future next action keeps a quiet deal out of STALE', () => {
    const h = assessOpportunityHealth(inputs({
      execution: { ...okExecution, lastActivityIso: '2026-05-01T12:00:00Z' }, // due 2026-07-20 still ahead
    }));
    expect(h.state).not.toBe('STALE');
  });

  it('terminal deals are history, not work: exempt from execution and never needsAttention', () => {
    const h = assessOpportunityHealth(inputs({
      stage: 'won',
      execution: { hasOwner: false, hasNextAction: false, nextActionDueIso: null, lastActivityIso: null },
    }));
    expect(h.dimensions.find((d) => d.key === 'execution')!.applicable).toBe(false);
    expect(h.state).toBe('ON_TRACK');
    expect(h.needsAttention).toBe(false);
  });
});
