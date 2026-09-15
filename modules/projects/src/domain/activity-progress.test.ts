import { describe, expect, it } from 'vitest';
import {
  clearActivityProgressOverride,
  overrideActivityProgress,
  progressDisagreesWithEvidence,
  resolveActivityProgress,
} from './activity-progress';

/**
 * Three facts that must never wear each other's clothes: what was measured, what somebody claims
 * instead, and a number typed where nothing was measured at all.
 */

const task = (over: Partial<Parameters<typeof resolveActivityProgress>[0]> = {}) => ({
  percentComplete: 0,
  progressOverride: null as number | null,
  progressOverrideReason: null as string | null,
  progressOverrideAt: null as string | null,
  progressOverrideBy: null as string | null,
  ...over,
});

describe('where an activity’s progress comes from', () => {
  it('reads the measurement when the work package is quantity-controlled', () => {
    // The stored number is ignored: the ledger is the authority, and a copy would be a copy as of
    // the last refresh.
    const progress = resolveActivityProgress(task({ percentComplete: 80 }), 20);
    expect(progress).toMatchObject({ effective: 20, source: 'evidence', evidence: 20, override: null });
  });

  it('calls a number with no measurement behind it a DECLARATION, not evidence', () => {
    const progress = resolveActivityProgress(task({ percentComplete: 45 }), null);
    expect(progress).toMatchObject({ effective: 45, source: 'declared', evidence: null, override: null });
  });

  it('never promotes a stale override into one when the measurement is gone', () => {
    const stale = task({ percentComplete: 10, progressOverride: 90, progressOverrideReason: 'from before', progressOverrideAt: '2026-01-01T00:00:00.000Z' });
    // No evidence to override, so the override is not in force and the plain number stands.
    expect(resolveActivityProgress(stale, null)).toMatchObject({ source: 'declared', effective: 10, override: null });
  });

  it('lets a stated figure stand over the measurement, and keeps both visible', () => {
    const overridden = task({ percentComplete: 0, progressOverride: 45, progressOverrideReason: 'panels installed, not yet measured', progressOverrideAt: '2026-07-01T00:00:00.000Z', progressOverrideBy: 'u-pm' });
    const progress = resolveActivityProgress(overridden, 20);
    expect(progress).toMatchObject({ effective: 45, source: 'override', evidence: 20 });
    expect(progress.override).toMatchObject({ value: 45, reason: 'panels installed, not yet measured', by: 'u-pm' });
    // The disagreement is nameable, which is the point of keeping the measurement beside it.
    expect(progressDisagreesWithEvidence(progress)).toBe(true);
  });

  it('is not a disagreement when the stated figure matches what was measured', () => {
    const same = task({ progressOverride: 20, progressOverrideReason: 'confirmed against site', progressOverrideAt: '2026-07-01T00:00:00.000Z' });
    expect(progressDisagreesWithEvidence(resolveActivityProgress(same, 20))).toBe(false);
  });

  it('ignores an override with no reason or no timestamp — it is not one', () => {
    const half = task({ percentComplete: 5, progressOverride: 45, progressOverrideReason: null, progressOverrideAt: '2026-07-01T00:00:00.000Z' });
    expect(resolveActivityProgress(half, 20).source).toBe('evidence');
    const undated = task({ percentComplete: 5, progressOverride: 45, progressOverrideReason: 'why', progressOverrideAt: null });
    expect(resolveActivityProgress(undated, 20).source).toBe('evidence');
  });
});

describe('stating a figure against the evidence', () => {
  it('records the value, the reason and who said it', () => {
    const stated = overrideActivityProgress(task(), { value: 45, reason: '  panels installed, awaiting measure  ', actorId: 'u-pm' }, 20);
    expect(stated).toMatchObject({
      progressOverride: 45, progressOverrideReason: 'panels installed, awaiting measure', progressOverrideBy: 'u-pm',
    });
    expect(Date.parse(stated.progressOverrideAt)).not.toBeNaN();
  });

  it('refuses where there is nothing to override', () => {
    // Not an override — a declaration wearing a signature it did not earn.
    expect(() => overrideActivityProgress(task(), { value: 45, reason: 'ahead of measure' }, null))
      .toThrow(/nothing to override/);
  });

  it('requires a reason, and a figure that is a percentage', () => {
    expect(() => overrideActivityProgress(task(), { value: 45, reason: '   ' }, 20)).toThrow(/requires a reason/);
    expect(() => overrideActivityProgress(task(), { value: 120, reason: 'why' }, 20)).toThrow(/between 0 and 100/);
    expect(() => overrideActivityProgress(task(), { value: -1, reason: 'why' }, 20)).toThrow(/between 0 and 100/);
    expect(() => overrideActivityProgress(task(), { value: Number.NaN, reason: 'why' }, 20)).toThrow(/between 0 and 100/);
  });

  it('is withdrawn cleanly, provenance and all', () => {
    const stated = overrideActivityProgress(task(), { value: 45, reason: 'ahead of measure', actorId: 'u-pm' }, 20);
    const cleared = clearActivityProgressOverride(stated);
    expect(cleared).toMatchObject({
      progressOverride: null, progressOverrideReason: null, progressOverrideAt: null, progressOverrideBy: null,
    });
    // …and the measurement speaks again.
    expect(resolveActivityProgress(cleared, 20)).toMatchObject({ source: 'evidence', effective: 20 });
    expect(() => clearActivityProgressOverride(cleared)).toThrow(/nothing to withdraw/);
  });
});
