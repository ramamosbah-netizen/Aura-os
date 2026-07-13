import { describe, it, expect } from 'vitest';
import {
  makeStakeholder, stakeholderCoverage,
  makeCommitment, fulfilCommitment, transitionCommitment, commitmentIsOverdue, commitmentSummary,
  type OpportunityStakeholder,
} from './opportunity-depth';

const sh = (over: Partial<OpportunityStakeholder>): OpportunityStakeholder => ({
  ...makeStakeholder({ tenantId: 't1', opportunityId: 'o1', contactName: 'X' }),
  ...over,
});

describe('stakeholderCoverage', () => {
  it('empty ⇒ NO_STAKEHOLDERS, score 0', () => {
    const c = stakeholderCoverage([]);
    expect(c.gaps).toEqual(['NO_STAKEHOLDERS']);
    expect(c.score).toBe(0);
    expect(c.needsAttention).toBe(true);
  });

  it('a single influencer is single-threaded + missing key roles', () => {
    const c = stakeholderCoverage([sh({ role: 'INFLUENCER' })]);
    expect(c.gaps).toEqual(expect.arrayContaining(['NO_DECISION_MAKER', 'NO_ECONOMIC_BUYER', 'NO_CHAMPION', 'SINGLE_THREADED_RELATIONSHIP']));
  });

  it('full committee ⇒ no gaps, score 100', () => {
    const c = stakeholderCoverage([
      sh({ role: 'DECISION_MAKER' }),
      sh({ role: 'ECONOMIC_BUYER' }),
      sh({ role: 'CHAMPION', isChampion: true }),
    ]);
    expect(c.gaps).toEqual([]);
    expect(c.score).toBe(100);
    expect(c.needsAttention).toBe(false);
  });

  it('decisionPower flag satisfies NO_DECISION_MAKER', () => {
    const c = stakeholderCoverage([
      sh({ role: 'OTHER', decisionPower: true }),
      sh({ role: 'ECONOMIC_BUYER' }),
      sh({ isChampion: true }),
    ]);
    expect(c.gaps).not.toContain('NO_DECISION_MAKER');
  });

  it('a blocker with no champion is flagged unmanaged', () => {
    const c = stakeholderCoverage([sh({ role: 'DECISION_MAKER' }), sh({ role: 'ECONOMIC_BUYER' }), sh({ role: 'BLOCKER' })]);
    expect(c.gaps).toContain('BLOCKER_UNMANAGED');
    expect(c.gaps).toContain('NO_CHAMPION');
  });
});

describe('commitment lifecycle', () => {
  const open = () => makeCommitment({ tenantId: 't1', relatedId: 'o1', direction: 'OURS', description: 'Submit quote Thu', dueAt: '2026-07-20' });

  it('starts OPEN', () => {
    expect(open().status).toBe('OPEN');
  });
  it('fulfil sets FULFILLED + timestamp', () => {
    const f = fulfilCommitment(open(), 'sent PDF');
    expect(f.status).toBe('FULFILLED');
    expect(f.fulfilledAt).toBeTruthy();
    expect(f.evidence).toBe('sent PDF');
  });
  it('cannot fulfil twice', () => {
    expect(() => fulfilCommitment(fulfilCommitment(open()), 'x')).toThrow(/cannot be fulfilled/);
  });
  it('can break an open commitment', () => {
    expect(transitionCommitment(open(), 'BROKEN').status).toBe('BROKEN');
  });

  it('overdue = OPEN and past due', () => {
    const now = new Date('2026-07-25T00:00:00Z');
    expect(commitmentIsOverdue(open(), now)).toBe(true);
    expect(commitmentIsOverdue(fulfilCommitment(open()), now)).toBe(false); // fulfilled is never overdue
  });

  it('summary tallies open/overdue/fulfilled/broken and flags attention', () => {
    const now = new Date('2026-07-25T00:00:00Z');
    const list = [
      open(), // overdue
      fulfilCommitment(makeCommitment({ tenantId: 't1', relatedId: 'o1', direction: 'OURS', description: 'a' })),
      transitionCommitment(makeCommitment({ tenantId: 't1', relatedId: 'o1', direction: 'THEIRS', description: 'b' }), 'BROKEN'),
    ];
    const s = commitmentSummary(list, now);
    expect(s).toMatchObject({ open: 1, overdue: 1, fulfilled: 1, broken: 1, needsAttention: true });
  });
});
