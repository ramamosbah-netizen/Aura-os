import { describe, expect, it } from 'vitest';
import { evaluateTransition, availableTransitions, isKnownState, requiredFor, type LifecycleFacts, type ProjectLifecycleState } from './project-lifecycle';

const facts = (over: Partial<LifecycleFacts> = {}): LifecycleFacts => ({
  wbsNodes: 4,
  wbsCosted: 4,
  baselineApproved: true,
  commissioningSystems: 3,
  commissioningDone: 3,
  closeoutReady: true,
  ...over,
});

const gate = (from: string, to: string, f = facts()) =>
  evaluateTransition(from as never, to as never, f);

describe('project lifecycle', () => {
  describe('shape', () => {
    it('refuses a move the machine has no edge for, and says so structurally', () => {
      const g = gate('completed', 'planning');
      expect(g.allowed).toBe(false);
      // Structure and conditions read differently on purpose: this one tells the caller they were
      // wrong, the condition gates tell them what to do.
      expect(g.gaps).toEqual(['a project cannot move from completed to planning']);
    });

    it('keeps the original path working, so existing projects are not stranded', () => {
      // planned → active was the whole lifecycle before. A project that never adopts the new
      // states must still be able to run, which means `active` stays reachable from execution's
      // predecessor and `completed` stays reachable from `active`.
      expect(gate('planning', 'active').allowed).toBe(true);
      expect(gate('active', 'completed').allowed).toBe(true);
    });

    it('lets a failed acceptance go BACK to delivery', () => {
      // The reason testing and handover are states at all: without them a failure has nowhere to
      // be recorded and the project simply stays "active" while everyone knows better.
      expect(gate('testing', 'active').allowed).toBe(true);
      expect(gate('handover', 'active').allowed).toBe(true);
    });

    it('treats completed and cancelled as terminal', () => {
      expect(availableTransitions('completed', facts())).toEqual([]);
      expect(availableTransitions('cancelled', facts())).toEqual([]);
    });
  });

  describe('starting execution', () => {
    it('refuses a project with no scope structure', () => {
      const g = gate('planning', 'active', facts({ wbsNodes: 0, wbsCosted: 0 }));
      expect(g.allowed).toBe(false);
      expect(g.gaps).toContain('No scope structure: the work has no packages to execute against');
    });

    it('distinguishes "no scope" from "scope with no value"', () => {
      const g = gate('planning', 'active', facts({ wbsCosted: 0 }));
      expect(g.gaps).toContain('No package carries a planned value, so progress cannot earn anything');
      expect(g.gaps).not.toContain('No scope structure: the work has no packages to execute against');
    });

    it('refuses execution without an approved baseline', () => {
      const g = gate('planning', 'active', facts({ baselineApproved: false }));
      expect(g.allowed).toBe(false);
      expect(g.gaps).toContain('No approved baseline: without one there is nothing to measure performance against');
    });

    it('names every reason at once rather than one per attempt', () => {
      const g = gate('planning', 'active', facts({ wbsNodes: 0, wbsCosted: 0, baselineApproved: false }));
      expect(g.gaps).toHaveLength(2);
    });
  });

  describe('testing and handover', () => {
    it('refuses to enter testing with nothing registered to test', () => {
      expect(gate('active', 'testing', facts({ commissioningSystems: 0 })).allowed).toBe(false);
    });

    it('refuses handover while a system is uncommissioned, and counts what is left', () => {
      const g = gate('testing', 'handover', facts({ commissioningSystems: 4, commissioningDone: 1 }));
      expect(g.allowed).toBe(false);
      expect(g.gaps).toContain('3 of 4 systems not commissioned');
    });

    it('reads a single remaining system in the singular', () => {
      const g = gate('testing', 'handover', facts({ commissioningSystems: 1, commissioningDone: 0 }));
      expect(g.gaps).toContain('1 of 1 system not commissioned');
    });
  });

  describe('completion', () => {
    it('defers to the closeout verdict rather than restating its rules', () => {
      expect(gate('closeout', 'completed', facts({ closeoutReady: false })).allowed).toBe(false);
      expect(gate('closeout', 'completed', facts({ closeoutReady: false })).gaps)
        .toContain('Closeout is not ready — clear its blockers first');
    });

    it('treats an unassessed closeout as a refusal, never a pass', () => {
      // Same rule as §27, for the same reason: an unassessed project has not been cleared, it has
      // not been asked.
      const g = gate('closeout', 'completed', facts({ closeoutReady: null }));
      expect(g.allowed).toBe(false);
      expect(g.gaps).toContain('Closeout readiness could not be established, so completion cannot be authorised');
    });

    it('gates the legacy active → completed path on the same verdict', () => {
      // Otherwise the old path would be the way to skip the new gate.
      expect(gate('active', 'completed', facts({ closeoutReady: false })).allowed).toBe(false);
    });
  });

  describe('cancelling', () => {
    it('is always available while the project is live, whatever the facts say', () => {
      const nothing = facts({ wbsNodes: 0, wbsCosted: 0, baselineApproved: false, commissioningSystems: 0, closeoutReady: null });
      for (const from of ['planned', 'planning', 'active', 'testing', 'handover', 'closeout']) {
        expect(gate(from, 'cancelled', nothing).allowed, `${from} → cancelled`).toBe(true);
      }
    });
  });

  describe('compatibility edges', () => {
    /**
     * Every combination of facts the gates can read. 216 of them — small enough to be exhaustive,
     * which is the point: an invariant asserted over one example is a coincidence.
     */
    const everyFactCombination = (): LifecycleFacts[] => {
      const all: LifecycleFacts[] = [];
      for (const wbsNodes of [0, 2])
        for (const wbsCosted of [0, 2])
          for (const baselineApproved of [true, false])
            for (const commissioningSystems of [0, 1, 2])
              for (const commissioningDone of [0, 1, 2])
                for (const closeoutReady of [true, false, null])
                  all.push({ wbsNodes, wbsCosted, baselineApproved, commissioningSystems, commissioningDone, closeoutReady });
      return all;
    };

    it('demands of the legacy planned → active EXACTLY what planning → active demands', () => {
      // The invariant, not an example. The two edges do not merely agree on the cases someone
      // thought to write down — they are the same gate, so they agree on every case there is, and
      // a condition added to one is added to both because there is only one of them.
      for (const f of everyFactCombination()) {
        expect(requiredFor('planned', 'active', f), JSON.stringify(f))
          .toEqual(requiredFor('planning', 'active', f));
      }
    });

    it('never lets a skipping edge demand less than the path it skips', () => {
      // Stated generally so it holds for edges nobody has added yet. Any forward move that jumps
      // over a state must carry that state's requirements: skip representation, never governance.
      const CHAIN: ProjectLifecycleState[] = ['planned', 'planning', 'active', 'testing', 'handover', 'closeout', 'completed'];
      let jumpsChecked = 0;

      for (const f of everyFactCombination()) {
        for (const [i, from] of CHAIN.entries()) {
          for (const move of availableTransitions(from, f)) {
            const j = CHAIN.indexOf(move.to);
            if (j <= i + 1) continue; // adjacent or backward — nothing is being skipped
            jumpsChecked += 1;
            const short = requiredFor(from, move.to, f);
            for (let k = i + 1; k < j; k += 1) {
              for (const gap of requiredFor(CHAIN[k - 1], CHAIN[k], f)) {
                expect(short, `${from} → ${move.to} skips ${CHAIN[k]}`).toContain(gap);
              }
            }
          }
        }
      }

      // Guard the guard: if the machine ever loses its skipping edges this test would pass by
      // checking nothing at all.
      expect(jumpsChecked).toBeGreaterThan(0);
    });

    it('makes the legacy start refuse an unplanned project by name', () => {
      // The concrete consequence, kept alongside the invariant because a reader should be able to
      // see what it buys without running 216 cases in their head.
      const g = gate('planned', 'active', facts({ wbsNodes: 0, wbsCosted: 0, baselineApproved: false }));
      expect(g.allowed).toBe(false);
      expect(g.gaps).toEqual([
        'No scope structure: the work has no packages to execute against',
        'No approved baseline: without one there is nothing to measure performance against',
      ]);
    });
  });

  describe('offering choices', () => {
    it('returns every move with its own verdict, so a UI can show why one is closed', () => {
      const moves = availableTransitions('planning', facts({ baselineApproved: false }));
      expect(moves.map((m) => m.to)).toEqual(['active', 'cancelled']);
      expect(moves.find((m) => m.to === 'active')?.allowed).toBe(false);
      expect(moves.find((m) => m.to === 'cancelled')?.allowed).toBe(true);
    });
  });

  it('recognises exactly the states it declares', () => {
    expect(isKnownState('handover')).toBe(true);
    expect(isKnownState('mobilizing')).toBe(false);
  });
});
