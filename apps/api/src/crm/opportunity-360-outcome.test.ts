import { describe, it, expect } from 'vitest';
import { resolveContractedValue } from './opportunity-360-outcome';

// Slice 9 closure — the Opportunity 360 outcome must show the AWARD contracted value (from the
// accepted quotation → Commercial Baseline subtotal), not a downstream Contract sum, and never the
// headline `opportunity.value`. The two measures are kept distinct.

const wonByQuote = { awardSource: 'quotation_accepted' as const, contractedValue: 33986.67 };

describe('resolveContractedValue (360 outcome)', () => {
  it('Won via accepted quotation with ZERO contracts → the award contracted value', () => {
    expect(resolveContractedValue(wonByQuote, 0)).toBe(33986.67);
  });

  it('is independent of opportunity.value (value is not even an input) → cannot leak the headline', () => {
    // Whatever the headline was (0, or anything), the award value is what is returned.
    expect(resolveContractedValue({ awardSource: 'quotation_accepted', contractedValue: 33986.67 }, 0)).toBe(33986.67);
  });

  it('a LATER Contract with a DIFFERENT value does not obscure the award value', () => {
    // A signed contract worth 99,999 exists downstream; the award record stays authoritative.
    expect(resolveContractedValue(wonByQuote, 99999)).toBe(33986.67);
  });

  it('manual-override award provenance is also honoured (not the contract sum)', () => {
    expect(resolveContractedValue({ awardSource: 'manual_override', contractedValue: 50000 }, 12345)).toBe(50000);
  });

  it('LEGACY win with NO award provenance → falls back to the downstream contract sum', () => {
    expect(resolveContractedValue({ awardSource: null, contractedValue: null }, 42000)).toBe(42000);
    expect(resolveContractedValue({ awardSource: null, contractedValue: null }, 0)).toBe(0);
  });

  it('award provenance present but no contracted value → stays NULL (visible inconsistency), never 0 or the contract sum', () => {
    expect(resolveContractedValue({ awardSource: 'quotation_accepted', contractedValue: null }, 99999)).toBeNull();
  });
});
