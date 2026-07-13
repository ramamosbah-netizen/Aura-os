import { describe, expect, it } from 'vitest';
import { assessOpportunityHealth, dealHealthBand, type DealHealthInputs } from './opportunity-health';
import type { StakeholderCoverage, CommitmentSummary } from './opportunity-depth';
import type { RegisterSummary } from './deal-register';
import type { BuyingAlignment } from './buying-journey';

// Healthy baselines for each signal — a deal with nothing wrong.
const okCoverage: StakeholderCoverage = { count: 4, gaps: [], score: 100, needsAttention: false };
const okCommitments: CommitmentSummary = { open: 1, overdue: 0, fulfilled: 3, broken: 0, needsAttention: false };
const okRegister: RegisterSummary = {
  decisions: 2, assumptions: 2, openQuestions: 0, open: 0,
  unvalidatedAssumptions: 0, invalidatedAssumptions: 0, overdue: 0, needsAttention: false,
};
const aligned: BuyingAlignment = { assessed: true, aligned: true, gap: 0, severity: null, reason: null };
const notAssessed: BuyingAlignment = { assessed: false, aligned: true, gap: 0, severity: null, reason: null };

const inputs = (o: Partial<DealHealthInputs>): DealHealthInputs => ({
  coverage: okCoverage, commitments: okCommitments, register: okRegister, alignment: aligned, ...o,
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

describe('assessOpportunityHealth', () => {
  it('a clean deal is HEALTHY with score 100 and no reasons', () => {
    const h = assessOpportunityHealth(inputs({}));
    expect(h.band).toBe('HEALTHY');
    expect(h.score).toBe(100);
    expect(h.reasons).toEqual([]);
    expect(h.needsAttention).toBe(false);
  });

  it('excludes the journey dimension from the roll-up when it is not assessed', () => {
    const h = assessOpportunityHealth(inputs({ alignment: notAssessed }));
    const journey = h.dimensions.find((d) => d.key === 'journey');
    expect(journey?.applicable).toBe(false);
    // Still HEALTHY on the remaining three applicable dimensions.
    expect(h.band).toBe('HEALTHY');
  });

  it('surfaces coverage gaps as relationship reasons', () => {
    const cov: StakeholderCoverage = { count: 1, gaps: ['NO_DECISION_MAKER', 'SINGLE_THREADED_RELATIONSHIP'], score: 55, needsAttention: true };
    const h = assessOpportunityHealth(inputs({ coverage: cov }));
    const rel = h.dimensions.find((d) => d.key === 'relationship');
    expect(rel?.reasons).toContain('no decision-maker identified');
    expect(rel?.reasons).toContain('single-threaded relationship');
  });

  it('a broken promise pushes the commitments dimension down', () => {
    const cs: CommitmentSummary = { open: 1, overdue: 0, fulfilled: 0, broken: 3, needsAttention: true };
    const h = assessOpportunityHealth(inputs({ commitments: cs }));
    const dim = h.dimensions.find((d) => d.key === 'commitments');
    expect(dim?.score).toBe(25); // 100 - 3*25
    expect(dim?.reasons[0]).toBe('3 broken promises');
  });

  it('an invalidated assumption is material register risk', () => {
    const rs: RegisterSummary = { ...okRegister, invalidatedAssumptions: 1, needsAttention: true };
    const h = assessOpportunityHealth(inputs({ register: rs }));
    const dim = h.dimensions.find((d) => d.key === 'register');
    expect(dim?.score).toBe(75);
    expect(dim?.reasons).toContain('1 invalidated assumption');
  });

  it('running well ahead of the buyer makes the journey CRITICAL', () => {
    const ahead: BuyingAlignment = { assessed: true, aligned: false, gap: 2, severity: 'HIGH', reason: 'we are well ahead of the customer’s buying process' };
    const h = assessOpportunityHealth(inputs({ alignment: ahead }));
    const dim = h.dimensions.find((d) => d.key === 'journey');
    expect(dim?.band).toBe('CRITICAL');
    expect(dim?.score).toBe(25);
  });

  it('overall band is never rosier than the worst dimension — one critical signal dominates', () => {
    // Everything perfect except no stakeholders at all (coverage score 0).
    const cov: StakeholderCoverage = { count: 0, gaps: ['NO_STAKEHOLDERS'], score: 0, needsAttention: true };
    const h = assessOpportunityHealth(inputs({ coverage: cov }));
    expect(h.band).toBe('CRITICAL');
    expect(h.needsAttention).toBe(true);
    // The mean stays high (three of four dims are 100), but the band is floored by the worst.
    expect(h.score).toBeGreaterThan(70);
    // Worst-dimension reasons lead the flattened list.
    expect(h.reasons[0]).toBe('no stakeholders mapped');
  });
});
