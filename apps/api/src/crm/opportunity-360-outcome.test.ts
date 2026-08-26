import { describe, it, expect } from 'vitest';
import { resolveDealOutcome } from '@aura/shared';
import { resolveContractedValue } from './opportunity-360-outcome';

// Slice 9 closure — the Opportunity 360 outcome must show the AWARD contracted value (from the
// accepted quotation → Commercial Baseline subtotal), not a downstream Contract sum, and never the
// headline `opportunity.value`. The two measures are kept distinct.
//
// Phase 0: award provenance is now decided ONCE by resolveDealOutcome, so this rule cannot drift
// away from the lifecycle definition every other surface uses.

const governedWon = resolveDealOutcome({
  stage: 'won', awardSource: 'quotation_accepted', awardedQuotationId: 'q-1', contractedValue: 33986.67,
});

describe('resolveContractedValue (360 outcome)', () => {
  it('GOVERNED_WON with ZERO contracts → the award contracted value', () => {
    expect(resolveContractedValue(governedWon, 0)).toBe(33986.67);
  });

  it('is independent of opportunity.value — the headline cannot leak in', () => {
    // `value` is not even an input to the lifecycle resolver, so a 0 headline cannot reach here.
    expect(resolveContractedValue(governedWon, 0)).toBe(33986.67);
  });

  it('a LATER Contract with a DIFFERENT value does not obscure the award value', () => {
    expect(resolveContractedValue(governedWon, 99999)).toBe(33986.67);
  });

  it('manual-override award provenance is also honoured (not the contract sum)', () => {
    const o = resolveDealOutcome({ stage: 'won', awardSource: 'manual_override', awardedQuotationId: null, contractedValue: 50000 });
    expect(resolveContractedValue(o, 12345)).toBe(50000);
  });

  it('LEGACY_WON (won, no provenance) → falls back to the downstream contract sum', () => {
    const o = resolveDealOutcome({ stage: 'won', awardSource: null, awardedQuotationId: null, contractedValue: null });
    expect(resolveContractedValue(o, 42000)).toBe(42000);
    expect(resolveContractedValue(o, 0)).toBe(0);
  });

  it('an OPEN deal → contract sum (no award may speak before the deal is won)', () => {
    const o = resolveDealOutcome({ stage: 'proposal', awardSource: null, awardedQuotationId: null, contractedValue: null });
    expect(resolveContractedValue(o, 7000)).toBe(7000);
  });

  it('award provenance but no contracted value → stays NULL (visible inconsistency), never 0 or the contract sum', () => {
    const o = resolveDealOutcome({ stage: 'won', awardSource: 'quotation_accepted', awardedQuotationId: 'q-1', contractedValue: null });
    expect(resolveContractedValue(o, 99999)).toBeNull();
  });
});
