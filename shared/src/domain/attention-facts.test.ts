import { describe, it, expect } from 'vitest';
import { opportunityAttention, resolveNextActionFrom, attentionFactsOfOpportunity, type AttentionFacts } from './crm';

// CHARACTERIZATION of the Next-Action Invariant after moving it onto one factual input contract.
// This migration changed the rule's INPUT SHAPE only. Same inputs must produce the same gap codes,
// in the same order, with the same semantics — no new rules, no severity changes.
//
// There were no unit tests on this rule before the migration; these lock the behaviour being
// preserved so any future drift is visible.

const f = (over: Partial<AttentionFacts> = {}): AttentionFacts => ({ stage: 'qualification', ...over });
const NOW = new Date('2026-08-26T10:00:00.000Z');

describe('opportunityAttention — terminal deals are exempt (unchanged)', () => {
  for (const stage of ['won', 'lost']) {
    it(`${stage} → not active, no gaps, never needsAttention`, () => {
      const a = opportunityAttention(f({ stage, ownerId: null }), NOW);
      expect(a).toEqual({ active: false, gaps: [], needsAttention: false });
    });
  }
});

describe('opportunityAttention — gap codes and ORDER are preserved', () => {
  it('an empty active deal reports all three, in the original order', () => {
    const a = opportunityAttention(f(), NOW);
    expect(a.gaps).toEqual(['no-next-action', 'no-owner', 'no-due-date']);
    expect(a.active).toBe(true);
    expect(a.needsAttention).toBe(true);
  });

  it('an owner removes only no-owner', () => {
    expect(opportunityAttention(f({ ownerId: 'u-1' }), NOW).gaps).toEqual(['no-next-action', 'no-due-date']);
  });

  it('a future due date removes no-due-date and does NOT add overdue', () => {
    const a = opportunityAttention(f({ ownerId: 'u-1', activitySubject: 'Call', activityDueDate: '2026-12-01' }), NOW);
    expect(a.gaps).toEqual([]);
    expect(a.needsAttention).toBe(false);
  });

  it('a past due date reports overdue INSTEAD of no-due-date', () => {
    const a = opportunityAttention(f({ ownerId: 'u-1', activitySubject: 'Call', activityDueDate: '2020-01-01' }), NOW);
    expect(a.gaps).toEqual(['overdue']);
  });

  it('BOUNDARY: due today is not overdue', () => {
    const a = opportunityAttention(f({ ownerId: 'u-1', activitySubject: 'Call', activityDueDate: '2026-08-26' }), NOW);
    expect(a.gaps).toEqual([]);
  });

  it('a whitespace-only subject still counts as no next action', () => {
    expect(opportunityAttention(f({ ownerId: 'u-1', activitySubject: '   ' }), NOW).gaps).toContain('no-next-action');
  });
});

describe('resolveNextActionFrom — activity wins, columns are the fallback (unchanged)', () => {
  it('the scheduled activity beats the legacy columns', () => {
    const r = resolveNextActionFrom(f({ activitySubject: 'Call Layla', activityDueDate: '2026-09-01', activityOwnerId: 'u-2', ownerId: 'u-1', plannedSubject: 'Old typed step', plannedDueDate: '2026-01-01' }));
    expect(r).toEqual({ subject: 'Call Layla', dueDate: '2026-09-01', ownerId: 'u-2', fromActivity: true });
  });

  it('THE FALLBACK THIS MIGRATION EXISTED TO PRESERVE: with nothing scheduled, the columns are used', () => {
    const r = resolveNextActionFrom(f({ ownerId: 'u-1', plannedSubject: 'Typed step', plannedDueDate: '2026-02-02' }));
    expect(r).toEqual({ subject: 'Typed step', dueDate: '2026-02-02', ownerId: 'u-1', fromActivity: false });
  });

  it('the activity assignee owns the work; the deal owner is the fallback', () => {
    expect(resolveNextActionFrom(f({ activitySubject: 'x', ownerId: 'u-1' })).ownerId).toBe('u-1');
    expect(resolveNextActionFrom(f({ activitySubject: 'x', activityOwnerId: 'u-9', ownerId: 'u-1' })).ownerId).toBe('u-9');
  });

  it('a deal relying on its columns is NOT flagged as missing a next action', () => {
    // Had the migration dropped the fallback, this deal would have gained two false gaps.
    const a = opportunityAttention(f({ ownerId: 'u-1', plannedSubject: 'Typed step', plannedDueDate: '2026-12-01' }), NOW);
    expect(a.gaps).toEqual([]);
  });
});

describe('attentionFactsOfOpportunity — the adapter carries every input through', () => {
  it('maps an opportunity row and its activity facts onto the contract', () => {
    const facts = attentionFactsOfOpportunity(
      { stage: 'proposal', ownerId: 'u-1', nextAction: 'Typed', nextActionDueDate: '2026-03-03' },
      { nextActionSubject: 'Scheduled', nextActionDueIso: '2026-04-04', nextActionOwnerId: 'u-2' },
    );
    expect(facts).toEqual({
      stage: 'proposal', ownerId: 'u-1',
      activitySubject: 'Scheduled', activityDueDate: '2026-04-04', activityOwnerId: 'u-2',
      plannedSubject: 'Typed', plannedDueDate: '2026-03-03',
    });
  });

  it('a bare row (the web pipeline case) still resolves from its columns', () => {
    const a = opportunityAttention(attentionFactsOfOpportunity({ stage: 'qualification', ownerId: 'u-1', nextAction: 'Step', nextActionDueDate: '2026-12-01' }), NOW);
    expect(a.gaps).toEqual([]);
  });
});
