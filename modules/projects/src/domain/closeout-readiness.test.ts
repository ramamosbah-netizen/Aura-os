import { describe, expect, it } from 'vitest';
import { assessCloseoutReadiness, type ReadinessFacts } from './closeout-readiness';

const facts = (over: Partial<ReadinessFacts> = {}): ReadinessFacts => ({
  projectId: 'p1',
  quality: { openNcrs: 0, criticalOpenNcrs: 0, openSnags: 0 },
  commissioning: { systems: 3, commissioned: 3, openPunchItems: 0, criticalOpenPunchItems: 0 },
  documents: { pendingApprovals: 0, asBuiltsApproved: true },
  commercial: { submittedVariations: 0, draftVariations: 0, undecidedEotClaims: 0 },
  checklist: { exists: true, total: 8, done: 8 },
  ...over,
});

const state = (f: ReadinessFacts, id: string) => assessCloseoutReadiness(f).checks.find((c) => c.id === id)?.state;
const detail = (f: ReadinessFacts, id: string) => assessCloseoutReadiness(f).checks.find((c) => c.id === id)?.detail;

describe('closeout readiness', () => {
  it('passes only when every domain says so', () => {
    const r = assessCloseoutReadiness(facts());
    expect(r.ready).toBe(true);
    expect(r.blocked).toEqual([]);
    expect(r.unknown).toEqual([]);
  });

  describe('an unreadable domain is never a pass', () => {
    it.each(['quality', 'commissioning', 'documents', 'commercial'] as const)('%s unreachable blocks the close', (domain) => {
      const r = assessCloseoutReadiness(facts({ [domain]: null } as Partial<ReadinessFacts>));
      expect(r.ready).toBe(false);
      expect(r.unknown.length).toBeGreaterThan(0);
      // And it is reported as unknown, not as blocked — the two mean different things to whoever
      // has to act: one is work to do, the other is a system that could not answer.
      expect(r.blocked).toEqual([]);
    });
  });

  it('names the quality blocker in the words a project manager would use', () => {
    expect(detail(facts({ quality: { openNcrs: 2, criticalOpenNcrs: 2, openSnags: 0 } }), 'quality-ncrs'))
      .toBe('2 major non-conformances still open.');
    expect(detail(facts({ quality: { openNcrs: 1, criticalOpenNcrs: 0, openSnags: 0 } }), 'quality-ncrs'))
      .toBe('1 non-conformance still open.');
  });

  it('treats a project that never commissioned anything as unproven, not as ready', () => {
    // The whole point: zero systems is not zero problems.
    const f = facts({ commissioning: { systems: 0, commissioned: 0, openPunchItems: 0, criticalOpenPunchItems: 0 } });
    expect(state(f, 'commissioning-systems')).toBe('unknown');
    expect(assessCloseoutReadiness(f).ready).toBe(false);
  });

  it('reports partial commissioning as a count, not a percentage', () => {
    const f = facts({ commissioning: { systems: 5, commissioned: 2, openPunchItems: 0, criticalOpenPunchItems: 0 } });
    expect(detail(f, 'commissioning-systems')).toBe('3 of 5 systems not commissioned.');
  });

  it('surfaces critical punch items alongside the total', () => {
    const f = facts({ commissioning: { systems: 3, commissioned: 3, openPunchItems: 7, criticalOpenPunchItems: 2 } });
    expect(detail(f, 'commissioning-punch')).toBe('7 punch items open, 2 critical.');
  });

  it('keeps as-builts tri-state, so "not tracked" cannot read as "approved"', () => {
    expect(state(facts({ documents: { pendingApprovals: 0, asBuiltsApproved: null } }), 'documents-asbuilts')).toBe('unknown');
    expect(state(facts({ documents: { pendingApprovals: 0, asBuiltsApproved: false } }), 'documents-asbuilts')).toBe('blocked');
    expect(state(facts({ documents: { pendingApprovals: 0, asBuiltsApproved: true } }), 'documents-asbuilts')).toBe('pass');
  });

  /**
   * The variation semantics, stated as tests rather than assumed.
   *
   * These exist because a typo nearly became a business rule. The client filtered variations on
   * `status === 'pending'` — a state VariationStatus does not have — so every open variation was
   * invisible to the completion gate. Correcting it to the real union made `draft` a blocker by
   * accident, which is a DIFFERENT rule from the one anyone agreed to, and it would have shipped
   * silently under the description "fixed a typo".
   *
   * The rule, explicitly: a SUBMITTED variation is a claim in front of the other party with no
   * decision against it, so the final account cannot be agreed and closeout is blocked. A DRAFT is
   * an internal working record; it is worth saying at closeout, because it may be one somebody
   * forgot to raise, but an internal note must not be able to veto a handover.
   */
  describe('change semantics', () => {
    it('blocks on a submitted variation — an open commitment to the other party', () => {
      const f = facts({ commercial: { submittedVariations: 2, draftVariations: 0, undecidedEotClaims: 1 } });
      expect(state(f, 'commercial-change')).toBe('blocked');
      expect(detail(f, 'commercial-change')).toBe('2 variations awaiting decision, 1 EOT claim undecided. The final account cannot be agreed while change is open.');
    });

    it('does NOT block on a draft variation, but says it is there', () => {
      const f = facts({ commercial: { submittedVariations: 0, draftVariations: 3, undecidedEotClaims: 0 } });
      expect(state(f, 'commercial-change')).toBe('pass');
      expect(detail(f, 'commercial-change')).toBe('3 variations still in draft — raise or discard before the final account.');
    });

    it('mentions drafts alongside a real blocker rather than hiding them behind it', () => {
      const f = facts({ commercial: { submittedVariations: 1, draftVariations: 2, undecidedEotClaims: 0 } });
      expect(detail(f, 'commercial-change')).toContain('1 variation awaiting decision');
      expect(detail(f, 'commercial-change')).toContain('2 variations still in draft');
    });

    it('says nothing at all when change is genuinely settled', () => {
      expect(state(facts(), 'commercial-change')).toBe('pass');
      expect(detail(facts(), 'commercial-change')).toBeUndefined();
    });

    it('blocks on an undecided EOT claim even with no variations at all', () => {
      const f = facts({ commercial: { submittedVariations: 0, draftVariations: 0, undecidedEotClaims: 2 } });
      expect(state(f, 'commercial-change')).toBe('blocked');
    });
  });

  it('demotes the manual checklist to one check among many', () => {
    // Previously the checklist WAS the gate. A project with every box ticked and two open NCRs
    // could be closed; now the boxes are one voice.
    const f = facts({ quality: { openNcrs: 2, criticalOpenNcrs: 0, openSnags: 0 } });
    expect(state(f, 'handover-checklist')).toBe('pass');
    expect(assessCloseoutReadiness(f).ready).toBe(false);
  });

  it('treats a missing checklist as a blocker, not as an absent check', () => {
    expect(state(facts({ checklist: null }), 'handover-checklist')).toBe('blocked');
    expect(state(facts({ checklist: { exists: false, total: 0, done: 0 } }), 'handover-checklist')).toBe('blocked');
  });

  it('points every blocker at the domain that owns the fix, never back at Project 360', () => {
    const r = assessCloseoutReadiness(facts({
      quality: { openNcrs: 1, criticalOpenNcrs: 0, openSnags: 3 },
      commissioning: { systems: 2, commissioned: 1, openPunchItems: 4, criticalOpenPunchItems: 1 },
    }));
    expect(r.blocked.length).toBe(4);
    for (const check of r.blocked) {
      expect(check.href, `${check.id} must say where the work is`).toBeTruthy();
      expect(check.detail, `${check.id} must say what is wrong`).toBeTruthy();
    }
  });

  it('produces the explanation the business model asks for', () => {
    const r = assessCloseoutReadiness(facts({
      quality: { openNcrs: 2, criticalOpenNcrs: 2, openSnags: 0 },
      commissioning: { systems: 4, commissioned: 3, openPunchItems: 0, criticalOpenPunchItems: 0 },
    }));
    expect(r.ready).toBe(false);
    expect(r.blocked.map((b) => `${b.domain}: ${b.detail}`)).toEqual([
      'quality: 2 major non-conformances still open.',
      'commissioning: 1 of 4 systems not commissioned.',
    ]);
  });
});
