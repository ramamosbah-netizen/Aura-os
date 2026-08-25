import { describe, it, expect } from 'vitest';
import { shouldPromptQuoteOnWon } from './opportunity-360-insights';

// Slice 9 closure — the "won but not yet quoted/contracted" nudge must NOT appear for a deal won
// via an accepted quotation (award provenance). It only applies to a legacy win with no award and
// no contracted value.

describe('shouldPromptQuoteOnWon (360 insight rule)', () => {
  it('does NOT prompt for a Won deal from an accepted quotation (award provenance + real value)', () => {
    expect(shouldPromptQuoteOnWon({ status: 'won', contractedValue: 33986.67, awardSource: 'quotation_accepted' })).toBe(false);
  });

  it('does NOT prompt for a Won deal by manual override', () => {
    expect(shouldPromptQuoteOnWon({ status: 'won', contractedValue: 50000, awardSource: 'manual_override' })).toBe(false);
  });

  it('DOES prompt for a legacy Won deal with no award provenance and no contracted value', () => {
    expect(shouldPromptQuoteOnWon({ status: 'won', contractedValue: 0, awardSource: null })).toBe(true);
  });

  it('does NOT prompt for a legacy Won deal that already has a contracted value', () => {
    expect(shouldPromptQuoteOnWon({ status: 'won', contractedValue: 42000, awardSource: null })).toBe(false);
  });

  it('does NOT prompt for open or lost deals', () => {
    expect(shouldPromptQuoteOnWon({ status: 'open', contractedValue: 0, awardSource: null })).toBe(false);
    expect(shouldPromptQuoteOnWon({ status: 'lost', contractedValue: 0, awardSource: null })).toBe(false);
  });
});
