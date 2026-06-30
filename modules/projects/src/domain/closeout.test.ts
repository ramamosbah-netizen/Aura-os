import { describe, it, expect } from 'vitest';
import { makeProjectCloseout, setCloseoutItem, finalizeCloseout, allCloseoutItemsDone, DEFAULT_CLOSEOUT_ITEMS } from './closeout';

const base = { tenantId: 't1', projectId: 'p1', projectName: 'Marina Tower' };

describe('project closeout domain', () => {
  it('seeds the default checklist, in_progress, nothing done', () => {
    const c = makeProjectCloseout(base);
    expect(c.status).toBe('in_progress');
    expect(c.items).toHaveLength(DEFAULT_CLOSEOUT_ITEMS.length);
    expect(c.items.every((i) => !i.done)).toBe(true);
    expect(c.handoverDate).toBeNull();
  });

  it('accepts a custom checklist + validates projectId', () => {
    expect(makeProjectCloseout({ ...base, items: ['A', 'B'] }).items).toHaveLength(2);
    expect(() => makeProjectCloseout({ ...base, projectId: '' })).toThrow('projectId is required');
  });

  it('setCloseoutItem toggles by index, range-checked', () => {
    const c = setCloseoutItem(makeProjectCloseout(base), 0, true);
    expect(c.items[0].done).toBe(true);
    expect(() => setCloseoutItem(c, 99, true)).toThrow('out of range');
  });

  it('cannot finalize with pending items', () => {
    const c = makeProjectCloseout({ ...base, items: ['A', 'B'] });
    expect(allCloseoutItemsDone(c)).toBe(false);
    expect(() => finalizeCloseout(c, '2026-06-30')).toThrow('not done');
  });

  it('finalize completes, records handover + computes DLP end (handover + months)', () => {
    let c = makeProjectCloseout({ ...base, items: ['A', 'B'] });
    c = setCloseoutItem(c, 0, true);
    c = setCloseoutItem(c, 1, true);
    const done = finalizeCloseout(c, '2026-06-30', 12);
    expect(done.status).toBe('completed');
    expect(done.handoverDate).toBe('2026-06-30');
    expect(done.dlpEndDate).toBe('2027-06-30'); // +12 months
    expect(() => finalizeCloseout(done, '2026-07-01')).toThrow('already completed');
  });

  it('validates handover date + dlpMonths', () => {
    let c = makeProjectCloseout({ ...base, items: ['A'] });
    c = setCloseoutItem(c, 0, true);
    expect(() => finalizeCloseout(c, '30-06-2026')).toThrow('YYYY-MM-DD');
  });
});
