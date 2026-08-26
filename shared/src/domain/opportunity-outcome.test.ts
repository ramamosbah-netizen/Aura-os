import { describe, it, expect } from 'vitest';
import { resolveDealOutcome, describeDealOutcome, DEAL_OUTCOME_LABEL, TERMINAL_OPPORTUNITY_STAGES } from './opportunity-outcome';

// Phase 0 — Lifecycle/Outcome. `stage = 'won'` alone does not say whether a documented award backs
// the win. Conflating a governed win with a plain stage edit is what let contractedValue read 0 on
// an awarded deal; naming the distinction once stops it recurring in health, history and next-action.

const base = { stage: 'qualification' as const, awardSource: null, awardedQuotationId: null, contractedValue: null };
const governed = { stage: 'won' as const, awardSource: 'quotation_accepted' as const, awardedQuotationId: 'q-1', contractedValue: 33986.67 };
const legacy = { stage: 'won' as const, awardSource: null, awardedQuotationId: null, contractedValue: null };

describe('resolveDealOutcome', () => {
  it('an open pursuit is OPEN and not terminal', () => {
    const o = resolveDealOutcome(base);
    expect(o.state).toBe('OPEN');
    expect(o.terminal).toBe(false);
    expect(o.won).toBe(false);
    expect(o.awardDocumented).toBe(false);
  });

  it('won WITH provenance is GOVERNED_WON and carries the award value', () => {
    const o = resolveDealOutcome(governed);
    expect(o.state).toBe('GOVERNED_WON');
    expect(o.awardDocumented).toBe(true);
    expect(o.awardValue).toBe(33986.67);
    expect(o.awardedQuotationId).toBe('q-1');
    expect(o.terminal).toBe(true);
  });

  it('won WITHOUT provenance is LEGACY_WON — a real win, but nothing evidences it', () => {
    const o = resolveDealOutcome(legacy);
    expect(o.state).toBe('LEGACY_WON');
    expect(o.won).toBe(true);
    expect(o.awardDocumented).toBe(false);
    expect(o.terminal).toBe(true);
  });

  it('a legacy win NEVER speaks for a value, even if a stale contractedValue is present', () => {
    // Defensive: a value with no provenance is not authoritative and must not be quoted as the award.
    const o = resolveDealOutcome({ ...legacy, contractedValue: 999999 });
    expect(o.state).toBe('LEGACY_WON');
    expect(o.awardValue).toBeNull();
  });

  it('award provenance with a NULL value stays null — a visible inconsistency, never 0', () => {
    const o = resolveDealOutcome({ ...governed, contractedValue: null });
    expect(o.awardDocumented).toBe(true);
    expect(o.awardValue).toBeNull();
  });

  it('lost is LOST and terminal, whatever the award columns hold', () => {
    const o = resolveDealOutcome({ stage: 'lost', awardSource: 'manual_override', awardedQuotationId: 'q-9', contractedValue: 10 });
    expect(o.state).toBe('LOST');
    expect(o.won).toBe(false);
    expect(o.terminal).toBe(true);
  });

  it('every award source counts as governed provenance', () => {
    for (const src of ['quotation_accepted', 'tender_award', 'manual_override'] as const) {
      expect(resolveDealOutcome({ ...governed, awardSource: src }).state).toBe('GOVERNED_WON');
    }
  });

  it('TERMINAL_OPPORTUNITY_STAGES is the single definition of a closed pursuit', () => {
    expect([...TERMINAL_OPPORTUNITY_STAGES].sort()).toEqual(['lost', 'won']);
  });
});

describe('wording — a legacy win must never read like a governed one', () => {
  it('the label carries the caveat', () => {
    expect(DEAL_OUTCOME_LABEL.GOVERNED_WON).toBe('Won');
    expect(DEAL_OUTCOME_LABEL.LEGACY_WON).toBe('Won — award not evidenced');
    expect(DEAL_OUTCOME_LABEL.LEGACY_WON).not.toBe(DEAL_OUTCOME_LABEL.GOVERNED_WON);
  });

  it('the description names the missing evidence', () => {
    expect(describeDealOutcome(resolveDealOutcome(legacy)))
      .toBe('Won, but no award evidence is recorded — the contracted value is not backed by an accepted quotation or tender award.');
  });

  it('all four states read differently', () => {
    const seen = new Set([base, governed, legacy, { ...base, stage: 'lost' as const }].map((o) => describeDealOutcome(resolveDealOutcome(o))));
    expect(seen.size).toBe(4);
  });
});
