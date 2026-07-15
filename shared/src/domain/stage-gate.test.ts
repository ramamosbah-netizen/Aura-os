import { describe, it, expect } from 'vitest';
import { checkStageTransition, stageGateMessage, type StageGateCandidate } from './stage-gate';

const opp = (over: Partial<StageGateCandidate> = {}): StageGateCandidate => ({
  stage: 'qualification',
  value: 100_000,
  needConfirmed: false,
  lossReason: null,
  winReason: null,
  ...over,
});

describe('→ proposal', () => {
  it('is refused with no confirmed need and nobody to propose to', () => {
    const r = checkStageTransition(opp(), 'proposal');
    expect(r.allowed).toBe(false);
    expect(r.gaps.map((g) => g.code)).toEqual(['NEED_NOT_CONFIRMED', 'NO_STAKEHOLDER']);
  });

  it('is allowed once the need is confirmed and a stakeholder is mapped', () => {
    expect(checkStageTransition(opp({ needConfirmed: true }), 'proposal', { hasStakeholder: true }).allowed).toBe(true);
  });

  it('treats unsupplied evidence as unproven, never as satisfied', () => {
    // The gate must not invent evidence it was not given — that would make it decorative.
    const r = checkStageTransition(opp({ needConfirmed: true }), 'proposal', {});
    expect(r.gaps.map((g) => g.code)).toEqual(['NO_STAKEHOLDER']);
  });
});

describe('→ negotiation', () => {
  it('is refused when there is no quotation to negotiate', () => {
    const r = checkStageTransition(opp({ stage: 'proposal' }), 'negotiation', {});
    expect(r.gaps.map((g) => g.code)).toEqual(['NO_PROPOSAL']);
  });

  it('distinguishes a drafted quotation from a submitted one', () => {
    const r = checkStageTransition(opp({ stage: 'proposal' }), 'negotiation', { hasQuotation: true });
    expect(r.gaps.map((g) => g.code)).toEqual(['PROPOSAL_NOT_SUBMITTED']);
    expect(checkStageTransition(opp({ stage: 'proposal' }), 'negotiation', { hasQuotation: true, quotationSubmitted: true }).allowed).toBe(true);
  });
});

describe('→ won (invariant 3)', () => {
  it('refuses a win with no value and no reason', () => {
    const r = checkStageTransition(opp({ stage: 'negotiation', value: 0 }), 'won');
    expect(r.gaps.map((g) => g.code)).toEqual(['NO_FINAL_VALUE', 'NO_WIN_REASON']);
  });

  it('allows a win that carries both', () => {
    expect(checkStageTransition(opp({ stage: 'negotiation', value: 500_000, winReason: 'Best technical fit' }), 'won').allowed).toBe(true);
  });

  it('does not accept whitespace as a reason', () => {
    const r = checkStageTransition(opp({ stage: 'negotiation', winReason: '   ' }), 'won');
    expect(r.gaps.map((g) => g.code)).toContain('NO_WIN_REASON');
  });
});

describe('→ lost (invariant 4)', () => {
  it('refuses a loss with no reason — the field most often skipped', () => {
    expect(checkStageTransition(opp({ stage: 'proposal' }), 'lost').gaps.map((g) => g.code)).toEqual(['NO_LOSS_REASON']);
  });

  it('allows a loss that explains itself, and does not demand a value', () => {
    expect(checkStageTransition(opp({ stage: 'proposal', value: 0, lossReason: 'Price' }), 'lost').allowed).toBe(true);
  });
});

describe('what is deliberately NOT gated', () => {
  it('moving backward is always allowed — deals genuinely regress', () => {
    // Punishing honesty about a regression is how a pipeline becomes fiction.
    expect(checkStageTransition(opp({ stage: 'negotiation' }), 'proposal').allowed).toBe(true);
    expect(checkStageTransition(opp({ stage: 'proposal' }), 'qualification').allowed).toBe(true);
  });

  it('a no-op transition is allowed', () => {
    expect(checkStageTransition(opp({ stage: 'proposal' }), 'proposal').allowed).toBe(true);
  });

  it('CAUTION: the no-op rule makes the gate inert if callers pass the post-patch stage', () => {
    // This is not a hypothetical. The service builds `updated = {...existing, ...patch}` and the
    // first wiring passed it whole — so `opp.stage` was ALREADY the destination, `to === opp.stage`
    // matched, and every gate waved the transition through. A win landed with no reason and every
    // test still passed. Callers must pass the PRE-patch stage; this pins why.
    const asIfAlreadyMoved = opp({ stage: 'won', value: 0, winReason: null });
    expect(checkStageTransition(asIfAlreadyMoved, 'won').allowed).toBe(true); // ← the trap
    const correct = opp({ stage: 'negotiation', value: 0, winReason: null });
    expect(checkStageTransition(correct, 'won').allowed).toBe(false); // ← what the caller must do
  });

  it('re-entering qualification needs no evidence', () => {
    expect(checkStageTransition(opp({ stage: 'qualification' }), 'qualification').allowed).toBe(true);
  });
});

describe('stageGateMessage', () => {
  it('tells the person what to DO, not just that they are blocked', () => {
    const r = checkStageTransition(opp({ stage: 'negotiation', value: 0 }), 'won');
    const msg = stageGateMessage('won', r.gaps);
    expect(msg).toContain('final commercial value');
    expect(msg).toContain('why we won');
  });

  it('is phrased so the error taxonomy classifies it 409, not 400', () => {
    // The API classifies plain domain errors BY MESSAGE: "only … can …" marks a state-transition
    // guard (409 CONFLICT). Phrasing it "cannot move to …" would match the validation pattern and
    // report a blocked transition as a 400. This assertion is what stops that regressing.
    const msg = stageGateMessage('won', checkStageTransition(opp({ stage: 'negotiation', value: 0 }), 'won').gaps);
    expect(/\bonly\b.*\bcan\b/i.test(msg)).toBe(true);
    expect(/^cannot\b/i.test(msg)).toBe(false);
  });
});
