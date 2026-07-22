import { describe, it, expect } from 'vitest';
import {
  makeNegotiationEntry,
  summariseNegotiation,
  type NegotiationEntry,
  type PriceMove,
} from './negotiation';

const entry = (over: Partial<Parameters<typeof makeNegotiationEntry>[0]> = {}): NegotiationEntry =>
  makeNegotiationEntry({
    tenantId: 't1', quotationId: 'q1', type: 'DISCOUNT_REQUESTED', note: 'they want more', ...over,
  });

const at = (iso: string, over: Partial<Parameters<typeof makeNegotiationEntry>[0]> = {}) =>
  entry({ occurredAt: iso, ...over });

describe('makeNegotiationEntry', () => {
  it('requires a note — an entry nobody can read is not a record', () => {
    expect(() => entry({ note: '   ' })).toThrow(/needs a note/);
  });

  it('rejects a negative amount', () => {
    expect(() => entry({ amount: -1 })).toThrow(/negative/);
  });

  it('rejects a percent outside 0–100', () => {
    expect(() => entry({ percent: 140 })).toThrow(/between 0 and 100/);
    expect(() => entry({ percent: -5 })).toThrow(/between 0 and 100/);
  });

  it('infers the party from the entry type', () => {
    expect(entry({ type: 'DISCOUNT_REQUESTED' }).party).toBe('CUSTOMER');
    expect(entry({ type: 'COUNTER_OFFERED' }).party).toBe('US');
    expect(entry({ type: 'POSITION_HELD' }).party).toBe('US');
    expect(entry({ type: 'COMPETITOR_NOTED' }).party).toBe('COMPETITOR');
  });

  it('lets the caller override the inferred party', () => {
    expect(entry({ type: 'CUSTOMER_COMMENT', party: 'US' }).party).toBe('US');
  });

  it('keeps amount and percent independent — neither is derived from the other', () => {
    const e = entry({ amount: 50_000, percent: 5 });
    expect(e.amount).toBe(50_000);
    expect(e.percent).toBe(5);
    expect(entry({ amount: 50_000 }).percent).toBeNull();
  });
});

describe('summariseNegotiation', () => {
  const moves: PriceMove[] = [
    { revision: 0, total: 1_000_000, delta: 0, at: '2026-01-01T00:00:00.000Z' },
    { revision: 1, total: 980_000, delta: -20_000, at: '2026-01-05T00:00:00.000Z' },
  ];

  it('computes price movement from the REVISION CHAIN, not from what a note claimed', () => {
    // The note says 5%; the revisions say 2%. The revisions are what bills.
    const claimed = [at('2026-01-04T00:00:00.000Z', { type: 'COUNTER_OFFERED', note: 'gave them 5%', percent: 5 })];
    const s = summariseNegotiation(claimed, moves);
    expect(s.priceMovement).toBe(-20_000);
    expect(s.concessionPercent).toBe(2);
  });

  it('reports the largest discount asked for, in percent', () => {
    const s = summariseNegotiation(
      [
        at('2026-01-02T00:00:00.000Z', { percent: 4 }),
        at('2026-01-03T00:00:00.000Z', { percent: 8 }),
        at('2026-01-04T00:00:00.000Z', { percent: 6 }),
      ],
      moves,
    );
    expect(s.largestAskPercent).toBe(8);
  });

  it('leaves largestAskPercent null when no ask was expressed as a percent', () => {
    const s = summariseNegotiation([at('2026-01-02T00:00:00.000Z', { amount: 30_000 })], moves);
    expect(s.largestAskPercent).toBeNull();
  });

  describe('awaitingOurAnswer — the open question', () => {
    it('is true when the last move was the customer asking', () => {
      const s = summariseNegotiation([at('2026-01-06T00:00:00.000Z', { percent: 7 })], moves);
      expect(s.awaitingOurAnswer).toBe(true);
    });

    it('is false once we counter-offered after the ask', () => {
      const s = summariseNegotiation(
        [
          at('2026-01-06T00:00:00.000Z', { percent: 7 }),
          at('2026-01-07T00:00:00.000Z', { type: 'COUNTER_OFFERED', note: 'held at 2%', percent: 2 }),
        ],
        moves,
      );
      expect(s.awaitingOurAnswer).toBe(false);
    });

    it('is false once we explicitly held our position', () => {
      const s = summariseNegotiation(
        [
          at('2026-01-06T00:00:00.000Z', { percent: 7 }),
          at('2026-01-07T00:00:00.000Z', { type: 'POSITION_HELD', note: 'no further movement' }),
        ],
        moves,
      );
      expect(s.awaitingOurAnswer).toBe(false);
    });

    // Chatter is not an answer.
    it('stays true when only a customer comment followed the ask', () => {
      const s = summariseNegotiation(
        [
          at('2026-01-06T00:00:00.000Z', { percent: 7 }),
          at('2026-01-08T00:00:00.000Z', { type: 'CUSTOMER_COMMENT', note: 'chasing' }),
        ],
        moves,
      );
      expect(s.awaitingOurAnswer).toBe(true);
    });

    it('reads the sequence by occurredAt, not by insertion order', () => {
      const s = summariseNegotiation(
        [
          at('2026-01-09T00:00:00.000Z', { percent: 7 }),
          at('2026-01-07T00:00:00.000Z', { type: 'COUNTER_OFFERED', note: 'earlier answer' }),
        ],
        moves,
      );
      // The ask happened AFTER the counter, so it is still open.
      expect(s.awaitingOurAnswer).toBe(true);
    });
  });

  it('lists competitor prices lowest first — what we are measured against', () => {
    const s = summariseNegotiation(
      [
        at('2026-01-02T00:00:00.000Z', { type: 'COMPETITOR_NOTED', note: 'Rival A', amount: 1_420_000 }),
        at('2026-01-03T00:00:00.000Z', { type: 'COMPETITOR_NOTED', note: 'Rival B', amount: 1_180_000 }),
        at('2026-01-04T00:00:00.000Z', { type: 'COMPETITOR_NOTED', note: 'Rival C, no price heard' }),
      ],
      moves,
    );
    expect(s.competitorPrices).toEqual([1_180_000, 1_420_000]);
  });

  it('reports a price INCREASE as a negative concession rather than hiding it', () => {
    const up: PriceMove[] = [
      { revision: 0, total: 1_000_000, delta: 0, at: '2026-01-01T00:00:00.000Z' },
      { revision: 1, total: 1_050_000, delta: 50_000, at: '2026-01-05T00:00:00.000Z' },
    ];
    const s = summariseNegotiation([], up);
    expect(s.priceMovement).toBe(50_000);
    expect(s.concessionPercent).toBe(-5);
  });

  it('handles a quotation with no revisions and no entries without dividing by zero', () => {
    expect(summariseNegotiation([], [])).toMatchObject({
      entries: 0, priceMovement: 0, concessionPercent: 0, largestAskPercent: null, awaitingOurAnswer: false,
    });
  });
});
