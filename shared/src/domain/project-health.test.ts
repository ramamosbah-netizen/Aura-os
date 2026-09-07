import { describe, expect, it } from 'vitest';
import {
  assessProjectHealth,
  type HealthSignal,
  type HealthSignalState,
  type HealthSeverity,
} from './project-health';

const ALL_STATES: HealthSignalState[] = ['CLEAR', 'WATCH', 'AT_RISK', 'CRITICAL', 'UNKNOWN', 'NOT_APPLICABLE'];
const SEVERITIES: HealthSeverity[] = ['CLEAR', 'WATCH', 'AT_RISK', 'CRITICAL'];
const RANK: Record<HealthSeverity, number> = { CLEAR: 0, WATCH: 1, AT_RISK: 2, CRITICAL: 3 };

const sig = (id: string, state: HealthSignalState, over: Partial<HealthSignal> = {}): HealthSignal => ({
  id,
  domain: 'quality',
  state,
  ...over,
});

/**
 * Every arrangement of three signals — 216 of them. Small enough to be exhaustive, which is the
 * point: an invariant asserted over a handful of chosen examples is a coincidence, and these
 * invariants are the whole contract between severity and coverage.
 */
const everyTriple = (): HealthSignalState[][] => {
  const out: HealthSignalState[][] = [];
  for (const a of ALL_STATES) for (const b of ALL_STATES) for (const c of ALL_STATES) out.push([a, b, c]);
  return out;
};

const assess = (states: HealthSignalState[]) =>
  assessProjectHealth(states.map((s, i) => sig(`s${i}`, s)));

describe('cross-domain project health', () => {
  describe('the two axes are independent', () => {
    it('never lets UNKNOWN change a severity that was actually judged', () => {
      // The defect this module exists to avoid, stated as a law rather than a case. Adding an
      // unreadable provider is a statement about evidence; it cannot make a project better or
      // worse than what was measured.
      for (const known of ALL_STATES) {
        const base = assess([known]);
        for (const extra of [1, 2, 3]) {
          const withUnknowns = assess([known, ...Array<HealthSignalState>(extra).fill('UNKNOWN')]);
          expect(withUnknowns.severity, `${known} + ${extra} UNKNOWN`).toBe(base.severity);
        }
      }
    });

    it('never lets a known finding hide an unknown', () => {
      // The other direction, and the one the existing precedence chain gets wrong: ATTENTION
      // outranks UNABLE_TO_VERIFY there, so the unknown vanishes from the headline.
      for (const known of SEVERITIES) {
        const both = assess([known, 'UNKNOWN']);
        expect(both.severity, `${known} survives`).toBe(known);
        expect(both.coverage, `UNKNOWN survives alongside ${known}`).toBe('PARTIAL');
      }
    });

    it('produces every combination the model needs, and only those', () => {
      expect(assess(['CLEAR'])).toMatchObject({ severity: 'CLEAR', coverage: 'COMPLETE', reassuring: true });
      expect(assess(['CLEAR', 'UNKNOWN'])).toMatchObject({ severity: 'CLEAR', coverage: 'PARTIAL', reassuring: false });
      expect(assess(['WATCH'])).toMatchObject({ severity: 'WATCH', coverage: 'COMPLETE' });
      expect(assess(['AT_RISK', 'UNKNOWN'])).toMatchObject({ severity: 'AT_RISK', coverage: 'PARTIAL' });
      expect(assess(['CRITICAL'])).toMatchObject({ severity: 'CRITICAL', coverage: 'COMPLETE' });
      expect(assess(['CRITICAL', 'UNKNOWN'])).toMatchObject({ severity: 'CRITICAL', coverage: 'PARTIAL' });
    });
  });

  describe('monotonicity', () => {
    it('never improves the aggregate when a signal is added', () => {
      // Exhaustive over every triple and every possible addition: adding information can raise
      // severity or leave it, never lower it. A fourth signal cannot make a project look better.
      for (const triple of everyTriple()) {
        const before = assess(triple).severity;
        for (const added of ALL_STATES) {
          const after = assess([...triple, added]).severity;
          expect(RANK[after], `${triple.join('+')} then +${added}`).toBeGreaterThanOrEqual(RANK[before]);
        }
      }
    });

    it('never turns PARTIAL coverage back into COMPLETE by adding a signal', () => {
      // Coverage is monotone in the same direction: once something required is unreadable, adding
      // more reports cannot un-miss it.
      for (const triple of everyTriple()) {
        if (assess(triple).coverage !== 'PARTIAL') continue;
        for (const added of ALL_STATES) {
          expect(assess([...triple, added]).coverage, `${triple.join('+')} then +${added}`).toBe('PARTIAL');
        }
      }
    });

    it('orders the aggregate by the worst readable signal, whatever the order they arrive in', () => {
      for (const triple of everyTriple()) {
        const readable = triple.filter((s): s is HealthSeverity => s in RANK);
        const expected = readable.reduce<HealthSeverity>((w, s) => (RANK[s] > RANK[w] ? s : w), 'CLEAR');
        expect(assess(triple).severity, triple.join('+')).toBe(expected);
        // Order must not matter: the same multiset gives the same verdict.
        expect(assess([...triple].reverse()).severity, `${triple.join('+')} reversed`).toBe(expected);
      }
    });

    it('escalates through each step', () => {
      expect(assess(['WATCH', 'AT_RISK']).severity).toBe('AT_RISK');
      expect(assess(['AT_RISK', 'CRITICAL']).severity).toBe('CRITICAL');
      expect(assess(['CLEAR', 'WATCH']).severity).toBe('WATCH');
    });
  });

  describe('restoring an unreadable provider', () => {
    it('changes coverage only, when the restored provider finds nothing', () => {
      const down = assess(['CLEAR', 'UNKNOWN']);
      expect(down).toMatchObject({ severity: 'CLEAR', coverage: 'PARTIAL' });

      const restored = assess(['CLEAR', 'CLEAR']);
      expect(restored).toMatchObject({ severity: 'CLEAR', coverage: 'COMPLETE', reassuring: true });
    });

    it('changes severity too, when the restored provider finds something', () => {
      // The unknown was concealing a real condition. Both axes move, and the severity is the
      // provider's, not an inference this module made while it was dark.
      const restored = assess(['CLEAR', 'CRITICAL']);
      expect(restored).toMatchObject({ severity: 'CRITICAL', coverage: 'COMPLETE', reassuring: false });
    });

    it('leaves a known critical exactly where it was', () => {
      expect(assess(['CRITICAL', 'UNKNOWN'])).toMatchObject({ severity: 'CRITICAL', coverage: 'PARTIAL' });
      expect(assess(['CRITICAL', 'CLEAR'])).toMatchObject({ severity: 'CRITICAL', coverage: 'COMPLETE' });
    });
  });

  describe('applicability is not ignorance', () => {
    it('never lets NOT_APPLICABLE degrade coverage', () => {
      // A supply-only project has nothing to commission. If that read as UNKNOWN it would sit at
      // PARTIAL forever, PARTIAL would come to mean "normal", and the axis would be worthless on
      // the day a provider actually failed.
      for (const triple of everyTriple()) {
        if (triple.includes('UNKNOWN')) continue;
        expect(assess(triple).coverage, triple.join('+')).toBe('COMPLETE');
      }
    });

    it('never lets NOT_APPLICABLE change severity', () => {
      for (const triple of everyTriple()) {
        const withoutNa = triple.filter((s) => s !== 'NOT_APPLICABLE');
        expect(assess(triple).severity, triple.join('+')).toBe(assess(withoutNa).severity);
      }
    });

    it('reports a project nobody asked anything about as inapplicable, not as fine', () => {
      const nothing = assess(['NOT_APPLICABLE', 'NOT_APPLICABLE']);
      expect(nothing.applicable).toBe(false);
      // The distinction that matters: CLEAR here would claim a clean bill of health for a project
      // that was never examined.
      expect(nothing.reassuring).toBe(false);
      expect(nothing.notApplicable).toHaveLength(2);
    });

    it('stays applicable when even one signal had something to say', () => {
      expect(assess(['NOT_APPLICABLE', 'CLEAR']).applicable).toBe(true);
      expect(assess(['NOT_APPLICABLE', 'UNKNOWN']).applicable).toBe(true);
    });

    it('treats an empty report as nothing asked', () => {
      expect(assessProjectHealth([])).toMatchObject({ applicable: false, reassuring: false, severity: 'CLEAR' });
    });
  });

  describe('reassurance', () => {
    it('is granted for exactly one combination, across the whole state space', () => {
      for (const triple of everyTriple()) {
        const v = assess(triple);
        const earned = v.applicable && v.severity === 'CLEAR' && v.coverage === 'COMPLETE';
        expect(v.reassuring, triple.join('+')).toBe(earned);
      }
    });
  });

  describe('what a caller is handed', () => {
    it('orders concerns worst-first and leaves out the clear ones', () => {
      const v = assessProjectHealth([
        sig('a', 'WATCH', { domain: 'procurement' }),
        sig('b', 'CLEAR', { domain: 'cost' }),
        sig('c', 'CRITICAL', { domain: 'hse' }),
        sig('d', 'AT_RISK', { domain: 'engineering' }),
      ]);
      expect(v.concerns.map((c) => c.id)).toEqual(['c', 'd', 'a']);
    });

    it('keeps the owning domain and its own words on every concern', () => {
      // Project 360 explains and navigates; it does not become the owner's workshop, so the reason
      // and the route both belong to the domain that reported them.
      const v = assessProjectHealth([
        sig('ncr', 'CRITICAL', { domain: 'quality', reason: '3 major non-conformances still open.', href: '/project/p1/workspace/quality', measure: { value: 3 } }),
      ]);
      expect(v.concerns[0]).toMatchObject({
        domain: 'quality',
        reason: '3 major non-conformances still open.',
        href: '/project/p1/workspace/quality',
        measure: { value: 3 },
      });
    });

    it('separates the unreadable from the inapplicable, rather than lumping both under "no data"', () => {
      const v = assessProjectHealth([
        sig('hse', 'UNKNOWN', { domain: 'hse' }),
        sig('comm', 'NOT_APPLICABLE', { domain: 'commissioning' }),
      ]);
      expect(v.unknown.map((s) => s.domain)).toEqual(['hse']);
      expect(v.notApplicable.map((s) => s.domain)).toEqual(['commissioning']);
      expect(v.coverage).toBe('PARTIAL');
    });

    it('returns every signal it was given, including the ones that count toward nothing', () => {
      const v = assess(['CLEAR', 'UNKNOWN', 'NOT_APPLICABLE']);
      expect(v.signals).toHaveLength(3);
    });
  });
});
