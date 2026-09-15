import { describe, expect, it } from 'vitest';
import {
  conflictCovers,
  conflictIsOwned,
  decideConflict,
  resolutionForInterval,
  takeConflictOwnership,
  type ResourceConflictResolution,
} from './resource-conflict-resolution';
import type { ResourceRef } from './resource-ref';

/**
 * The rule underneath all of these: recording who is on a conflict, and what they did, never
 * changes whether the conflict is there. Feasibility stays derived.
 */

const crane: ResourceRef = { resourceType: 'asset', canonicalResourceId: 'CR-01' };

const owned = (over: Partial<Parameters<typeof takeConflictOwnership>[0]> = {}) =>
  takeConflictOwnership({ tenantId: 't1', resource: crane, from: '2026-07-06', to: '2026-07-10', ownerId: 'u-tm', ...over });

describe('taking a conflict on', () => {
  it('records the named owner, the period and who assigned it', () => {
    const entry = owned({ assignedBy: 'u-planner' });
    expect(entry).toMatchObject({
      resource: crane, from: '2026-07-06', to: '2026-07-10',
      ownerId: 'u-tm', assignedBy: 'u-planner', status: 'owned', decision: null, decidedAt: null,
    });
    expect(conflictIsOwned(entry)).toBe(true);
  });

  it('refuses an unowned, unresourced or backwards ownership', () => {
    expect(() => owned({ ownerId: '  ' })).toThrow(/named person/);
    expect(() => owned({ resource: { resourceType: 'asset', canonicalResourceId: '' } })).toThrow(/valid resource/);
    expect(() => owned({ from: '2026-07-10', to: '2026-07-06' })).toThrow(/end on or after/);
    expect(() => owned({ from: '10-07-2026' })).toThrow(/YYYY-MM-DD/);
  });
});

describe('deciding it', () => {
  it('keeps a fix and an accepted exposure apart, because they are different outcomes', () => {
    const fixed = decideConflict(owned(), { status: 'resolved', decision: 'moved the lift to Thursday', actorId: 'u-tm' });
    expect(fixed).toMatchObject({ status: 'resolved', decision: 'moved the lift to Thursday', decidedBy: 'u-tm' });

    const lived = decideConflict(owned(), { status: 'accepted', decision: 'second crane hired for the day', actorId: 'u-tm' });
    expect(lived.status).toBe('accepted');
  });

  it('requires saying what was decided', () => {
    expect(() => decideConflict(owned(), { status: 'resolved', decision: '   ' })).toThrow(/what was decided/);
  });

  it('cannot be decided twice', () => {
    const done = decideConflict(owned(), { status: 'resolved', decision: 'moved the lift' });
    expect(() => decideConflict(done, { status: 'accepted', decision: 'again' })).toThrow(/already been decided/);
  });

  it('changes nothing about the period or the resource it was taken on for', () => {
    const entry = owned();
    const done = decideConflict(entry, { status: 'resolved', decision: 'replaced with the spare' });
    expect(done).toMatchObject({ resource: crane, from: entry.from, to: entry.to, assignedAt: entry.assignedAt });
  });
});

describe('which entry speaks for a booking', () => {
  const at = (over: Partial<ResourceConflictResolution>): ResourceConflictResolution => ({ ...owned(), ...over });

  it('matches on overlap rather than containment', () => {
    const week = at({ from: '2026-07-06', to: '2026-07-10' });
    expect(resolutionForInterval([week], { from: '2026-07-07', to: '2026-07-07' })?.id).toBe(week.id);
    expect(resolutionForInterval([week], { from: '2026-07-01', to: '2026-07-31' })?.id).toBe(week.id);
    expect(resolutionForInterval([week], { from: '2026-08-01', to: '2026-08-02' })).toBeNull();
  });

  it('prefers what is being handled now over what was decided before', () => {
    const past = at({ id: 'past', status: 'resolved', decision: 'sorted last month', assignedAt: '2026-06-01T00:00:00.000Z' });
    const now = at({ id: 'now', assignedAt: '2026-07-01T00:00:00.000Z' });
    expect(resolutionForInterval([past, now], { from: '2026-07-06', to: '2026-07-10' })?.id).toBe('now');
  });

  it('falls back to the most recent decision when nothing is open', () => {
    const older = at({ id: 'older', status: 'resolved', decision: 'a', assignedAt: '2026-05-01T00:00:00.000Z' });
    const newer = at({ id: 'newer', status: 'accepted', decision: 'b', assignedAt: '2026-06-01T00:00:00.000Z' });
    expect(resolutionForInterval([older, newer], { from: '2026-07-06', to: '2026-07-10' })?.id).toBe('newer');
  });

  it('says nothing when nothing was ever taken on', () => {
    expect(resolutionForInterval([], { from: '2026-07-06', to: '2026-07-10' })).toBeNull();
  });
});

describe('conflictCovers', () => {
  it('is inclusive at both ends', () => {
    const entry = owned();
    expect(conflictCovers(entry, '2026-07-06')).toBe(true);
    expect(conflictCovers(entry, '2026-07-10')).toBe(true);
    expect(conflictCovers(entry, '2026-07-05')).toBe(false);
    expect(conflictCovers(entry, '2026-07-11')).toBe(false);
  });
});
