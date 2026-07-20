import { describe, expect, it } from 'vitest';
import { lastActivityByRecord, nextOpenActivityByRecord } from './attention';
import type { Activity } from './domain/activity';

const activity = (over: Partial<Activity> = {}): Activity => ({
  id: 'act-1', tenantId: 't1', companyId: null, type: 'call', subject: 'Intro call', notes: null,
  relatedType: 'lead', relatedId: 'lead-1', relatedName: 'Ali', dueDate: null,
  status: 'open', startedAt: null, completedAt: null, outcome: null, assigneeId: 'u1',
  createdAt: '2026-07-01T00:00:00Z', createdBy: 'u1', ...over,
});

describe('lastActivityByRecord — the status rule', () => {
  it('does NOT count a cancelled activity as a touch', () => {
    // The live regression: a lead whose only recent activity was created then cancelled must stay
    // stale, or anyone can clear a STALE gap without ever contacting the customer.
    const m = lastActivityByRecord([
      activity({ id: 'old', status: 'completed', completedAt: '2026-01-01T00:00:00Z' }),
      activity({ id: 'probe', status: 'cancelled', createdAt: '2026-07-20T00:00:00Z' }),
    ]);
    expect(m.get('lead-1')).toBe('2026-01-01T00:00:00Z');
  });

  it('leaves a record untouched when every activity on it was cancelled', () => {
    const m = lastActivityByRecord([activity({ status: 'cancelled' })]);
    expect(m.has('lead-1')).toBe(false);
  });

  it('counts completed (at completedAt) and open/in-progress (at createdAt)', () => {
    expect(lastActivityByRecord([
      activity({ status: 'completed', createdAt: '2026-07-01T00:00:00Z', completedAt: '2026-07-05T00:00:00Z' }),
    ]).get('lead-1')).toBe('2026-07-05T00:00:00Z');

    for (const status of ['open', 'in_progress'] as const) {
      expect(lastActivityByRecord([activity({ status })]).get('lead-1')).toBe('2026-07-01T00:00:00Z');
    }
  });
});

describe('the two projections agree that cancelled does not count', () => {
  it('a cancelled activity is invisible to both last-touch and next-action', () => {
    const cancelled = [activity({ status: 'cancelled', dueDate: '2026-07-25' })];
    expect(lastActivityByRecord(cancelled).has('lead-1')).toBe(false);
    expect(nextOpenActivityByRecord(cancelled).has('lead-1')).toBe(false);
  });
});
