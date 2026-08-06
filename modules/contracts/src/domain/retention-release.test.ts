import { describe, it, expect } from 'vitest';
import {
  assertReleasable,
  assertRetentionReleaseTransition,
  makeRetentionRelease,
  retentionPosition,
  suggestedReleaseAmount,
  type RetentionRelease,
} from './retention-release';

const base = { tenantId: 't', contractId: 'c', sequence: 1, amount: 25_000 };
const at = (r: RetentionRelease, status: RetentionRelease['status'], amount = r.amount): RetentionRelease => ({
  ...r,
  status,
  amount,
});

describe('retention-release domain', () => {
  it('creates a draft release with a sequenced reference', () => {
    const r = makeRetentionRelease({ ...base, sequence: 2 });
    expect(r.status).toBe('draft');
    expect(r.reference).toBe('RET-002');
    expect(r.kind).toBe('practical_completion');
    expect(r.amount).toBe(25_000);
  });

  it('rejects a non-positive amount, an unknown kind and a malformed date', () => {
    expect(() => makeRetentionRelease({ ...base, amount: 0 })).toThrow(/must be positive/i);
    expect(() => makeRetentionRelease({ ...base, kind: 'nope' as never })).toThrow(/invalid retention release kind/i);
    expect(() => makeRetentionRelease({ ...base, releaseDate: '01-01-2026' })).toThrow(/YYYY-MM-DD/);
  });

  it('positions held / released / pending — drafts reserve so two cannot claim the same balance', () => {
    const draft = makeRetentionRelease(base);
    const approved = at(makeRetentionRelease({ ...base, sequence: 2 }), 'approved', 30_000);
    const rejected = at(makeRetentionRelease({ ...base, sequence: 3 }), 'rejected', 99_000);
    const p = retentionPosition(100_000, [draft, approved, rejected]);
    expect(p).toEqual({ retentionHeld: 100_000, released: 30_000, pending: 25_000, releasable: 45_000 });
  });

  it('refuses handing back more than was ever withheld', () => {
    const p = retentionPosition(50_000, [at(makeRetentionRelease(base), 'approved', 50_000)]);
    expect(p.releasable).toBe(0);
    expect(() => assertReleasable(p, 1_000)).toThrow(/exceeds the 0 still releasable/i);
    expect(() => assertReleasable(p, 0.005)).not.toThrow(); // sub-fils drift tolerated
  });

  it('suggests half at practical completion and the balance at end of DLP', () => {
    const p = retentionPosition(100_000, []);
    expect(suggestedReleaseAmount(p, 'practical_completion')).toBe(50_000);
    const afterPc = retentionPosition(100_000, [at(makeRetentionRelease(base), 'approved', 50_000)]);
    expect(suggestedReleaseAmount(afterPc, 'defects_liability')).toBe(50_000);
  });

  it('makes a decided release terminal — approving twice would bill the tranche twice', () => {
    expect(() => assertRetentionReleaseTransition('draft', 'approved', 'RET-001')).not.toThrow();
    expect(() => assertRetentionReleaseTransition('approved', 'approved', 'RET-001')).toThrow(/already approved/i);
    expect(() => assertRetentionReleaseTransition('rejected', 'approved', 'RET-001')).toThrow(/already rejected/i);
  });
});
