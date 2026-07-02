import { describe, it, expect } from 'vitest';
import { makeTenderOutcome, buildWinLossAnalytics, type TenderOutcome } from './win-loss';

const base = { tenantId: 't1', tenderId: 'tender-1', ourBidValue: 100 };

describe('makeTenderOutcome', () => {
  it('derives winnerName from the flagged competitor on a loss', () => {
    const o = makeTenderOutcome({
      ...base,
      result: 'lost',
      reason: 'price',
      competitors: [
        { name: 'Alpha Contracting', bidValue: 90, winner: true },
        { name: 'Beta LLC' },
      ],
    });
    expect(o.winnerName).toBe('Alpha Contracting');
    expect(o.competitors).toHaveLength(2);
    expect(o.competitors[1].bidValue).toBeNull();
  });

  it('rejects invalid results, multiple winners, and a winner on a won tender', () => {
    expect(() => makeTenderOutcome({ ...base, result: 'pending' as any })).toThrow(/result/);
    expect(() =>
      makeTenderOutcome({
        ...base,
        result: 'lost',
        competitors: [
          { name: 'A', winner: true },
          { name: 'B', winner: true },
        ],
      }),
    ).toThrow(/one competitor/);
    expect(() =>
      makeTenderOutcome({ ...base, result: 'won', competitors: [{ name: 'A', winner: true }] }),
    ).toThrow(/we won/);
  });
});

describe('buildWinLossAnalytics', () => {
  const outcome = (over: Partial<Parameters<typeof makeTenderOutcome>[0]>): TenderOutcome =>
    makeTenderOutcome({ ...base, result: 'won', ...over } as any);

  it('computes win rate, values, head-to-head stats, and loss reasons', () => {
    const outcomes = [
      outcome({ tenderId: 'td1', result: 'won', ourBidValue: 1000, competitors: [{ name: 'Alpha' }, { name: 'Beta' }] }),
      outcome({ tenderId: 'td2', result: 'won', ourBidValue: 500, competitors: [{ name: 'Alpha' }] }),
      outcome({ tenderId: 'td3', result: 'lost', ourBidValue: 2000, reason: 'price', competitors: [{ name: 'Alpha', winner: true }] }),
      outcome({ tenderId: 'td4', result: 'lost', ourBidValue: 300, reason: 'price', competitors: [{ name: 'Beta', winner: true }] }),
    ];

    const a = buildWinLossAnalytics(outcomes);
    expect(a.totalDecided).toBe(4);
    expect(a.won).toBe(2);
    expect(a.lost).toBe(2);
    expect(a.winRate).toBe(50);
    expect(a.wonValue).toBe(1500);
    expect(a.lostValue).toBe(2300);

    // Alpha: 3 encounters, we won 2, they won 1 → most-encountered first.
    expect(a.byCompetitor[0]).toMatchObject({ name: 'Alpha', encounters: 3, weWon: 2, theyWon: 1, winRateAgainst: 66.67 });
    expect(a.byCompetitor[1]).toMatchObject({ name: 'Beta', encounters: 2, weWon: 1, theyWon: 1, winRateAgainst: 50 });

    expect(a.topLossReasons).toEqual([{ reason: 'price', count: 2 }]);
  });

  it('handles the empty case', () => {
    const a = buildWinLossAnalytics([]);
    expect(a.totalDecided).toBe(0);
    expect(a.winRate).toBe(0);
    expect(a.byCompetitor).toEqual([]);
  });

  it('merges competitor names case-insensitively', () => {
    const a = buildWinLossAnalytics([
      outcome({ tenderId: 'x1', competitors: [{ name: 'alpha' }] }),
      outcome({ tenderId: 'x2', competitors: [{ name: 'Alpha' }] }),
    ]);
    expect(a.byCompetitor).toHaveLength(1);
    expect(a.byCompetitor[0].encounters).toBe(2);
  });
});
