import { describe, expect, it } from 'vitest';
import { executiveCrm, executiveCrmRecords, type ExecDrill, type ExecOpportunity } from './executive-crm';

const NOW = new Date('2026-07-16T12:00:00Z');
const ago = (days: number): string => new Date(NOW.getTime() - days * 86400000).toISOString();

const deal = (over: Partial<ExecOpportunity> = {}): ExecOpportunity => ({
  id: 'o1', title: 'Deal', accountId: 'acc-1', accountName: 'Acme', stage: 'won', value: 100_000,
  ownerId: 'rep-a', winReason: 'best price', lossReason: null, competitors: null,
  updatedAt: ago(10), ...over,
});

describe('the period window', () => {
  it('answers only for deals decided inside it', () => {
    const r = executiveCrm(
      [deal({ id: 'recent', updatedAt: ago(10) }), deal({ id: 'ancient', updatedAt: ago(400) })],
      365,
      NOW,
    );
    expect(r.decided.won).toBe(1);
    expect(r.period.days).toBe(365);
  });

  it('an empty window has no win rate — null, not 0%', () => {
    const r = executiveCrm([deal({ updatedAt: ago(400) })], 90, NOW);
    expect(r.decided.winRate).toBeNull();
    expect(r.decided.valueWinRate).toBeNull();
    expect(r.concentration.topAccountPercent).toBeNull();
  });

  it('open deals are not decided — they count in neither outcome', () => {
    const r = executiveCrm([deal({ stage: 'proposal' }), deal({ id: 'w', stage: 'won' })], 365, NOW);
    expect(r.decided).toMatchObject({ won: 1, lost: 0, winRate: 100 });
  });
});

describe('win rate by count vs by value — one number cannot say both', () => {
  it('separates them: winning the small ones is not winning', () => {
    const r = executiveCrm(
      [
        deal({ id: 'w1', stage: 'won', value: 10_000 }),
        deal({ id: 'w2', stage: 'won', value: 10_000 }),
        deal({ id: 'l1', stage: 'lost', value: 980_000, lossReason: 'price' }),
      ],
      365,
      NOW,
    );
    expect(r.decided.winRate).toBe(67);      // two of three deals
    expect(r.decided.valueWinRate).toBe(2);  // ...worth 2% of the money
  });
});

describe('reasons — free text, reported as typed, never dropped', () => {
  it('groups case-insensitively and keeps the first spelling seen', () => {
    const r = executiveCrm(
      [
        deal({ id: 'a', winReason: 'Best Price', value: 300_000 }),
        deal({ id: 'b', winReason: 'best price', value: 200_000 }),
        deal({ id: 'c', winReason: 'incumbent', value: 100_000 }),
      ],
      365,
      NOW,
    );
    expect(r.winReasons.map((x) => x.reason)).toEqual(['Best Price', 'incumbent']);
    expect(r.winReasons[0]).toMatchObject({ deals: 2, value: 500_000, percent: 67 });
  });

  it('counts unrecorded reasons as their own bucket — the most important thing to learn', () => {
    const r = executiveCrm(
      [
        deal({ id: 'a', winReason: 'relationship', value: 100_000 }),
        deal({ id: 'b', winReason: null, value: 400_000 }),
        deal({ id: 'c', winReason: '   ', value: 100_000 }),
      ],
      365,
      NOW,
    );
    const unrecorded = r.winReasons.find((x) => x.reason === null);
    expect(unrecorded).toMatchObject({ deals: 2, value: 500_000 });
    expect(r.coverage.winsWithoutReason).toBe(2);
  });

  it('ranks reasons by value at stake, not by how often they are typed', () => {
    const r = executiveCrm(
      [
        deal({ id: 'a', stage: 'lost', lossReason: 'price', value: 10_000 }),
        deal({ id: 'b', stage: 'lost', lossReason: 'price', value: 10_000 }),
        deal({ id: 'c', stage: 'lost', lossReason: 'no local support', value: 900_000 }),
      ],
      365,
      NOW,
    );
    expect(r.lossReasons[0].reason).toBe('no local support');
    expect(r.coverage.lossesWithoutReason).toBe(0);
  });
});

describe('competitors', () => {
  it('splits the freeform field, dedupes within a deal, and ranks by value lost', () => {
    const r = executiveCrm(
      [
        deal({ id: 'a', stage: 'lost', value: 500_000, competitors: 'RivalCo, RivalCo , SmallFry' }),
        deal({ id: 'b', stage: 'lost', value: 100_000, competitors: 'smallfry' }),
        // A competitor named on a deal we WON is not a loss to them.
        deal({ id: 'c', stage: 'won', value: 900_000, competitors: 'RivalCo' }),
      ],
      365,
      NOW,
    );
    // SmallFry was on both losses (600k) and so outranks RivalCo (500k) despite the smaller deal.
    expect(r.competitors).toEqual([
      { name: 'SmallFry', lostDeals: 2, lostValue: 600_000 },
      { name: 'RivalCo', lostDeals: 1, lostValue: 500_000 },
    ]);
  });

  it('an empty competitor field is not a competitor named ""', () => {
    const r = executiveCrm([deal({ stage: 'lost', competitors: ' , ,' })], 365, NOW);
    expect(r.competitors).toEqual([]);
  });
});

describe('concentration — a property of the book, not of any row', () => {
  it('ranks accounts by won value and reports the top-1 and top-3 shares', () => {
    const r = executiveCrm(
      [
        deal({ id: 'a', accountId: 'big', accountName: 'Emaar', value: 600_000 }),
        deal({ id: 'b', accountId: 'mid', accountName: 'Nakheel', value: 200_000 }),
        deal({ id: 'c', accountId: 'small', accountName: 'Damac', value: 100_000 }),
        deal({ id: 'd', accountId: 'tiny', accountName: 'Other', value: 100_000 }),
      ],
      365,
      NOW,
    );
    expect(r.concentration.top.map((t) => t.accountName)).toEqual(['Emaar', 'Nakheel', 'Damac', 'Other']);
    expect(r.concentration.topAccountPercent).toBe(60);
    expect(r.concentration.topThreePercent).toBe(90);
    expect(r.concentration.accounts).toBe(4);
  });

  it('sums an account\'s several wins into one row', () => {
    const r = executiveCrm(
      [
        deal({ id: 'a', accountId: 'x', accountName: 'Acme', value: 100_000 }),
        deal({ id: 'b', accountId: 'x', accountName: 'Acme', value: 300_000 }),
      ],
      365,
      NOW,
    );
    expect(r.concentration.top).toEqual([
      { accountId: 'x', accountName: 'Acme', wonValue: 400_000, percent: 100 },
    ]);
  });

  it('100% across ONE account is arithmetic, not a finding — `accounts` tells them apart', () => {
    const r = executiveCrm([deal({ accountId: 'only', accountName: 'Solo' })], 365, NOW);
    expect(r.concentration.topAccountPercent).toBe(100);
    expect(r.concentration.accounts).toBe(1);
  });

  it('account-less wins never dilute the shares — they are counted and named instead', () => {
    const r = executiveCrm(
      [
        deal({ id: 'a', accountId: 'x', accountName: 'Acme', value: 100_000 }),
        deal({ id: 'b', accountId: null, accountName: null, value: 900_000 }),
      ],
      365,
      NOW,
    );
    // Acme is 100% of the value that HAS an account behind it — not 10% of a total it can't see.
    expect(r.concentration.topAccountPercent).toBe(100);
    expect(r.coverage.decidedWithoutAccount).toBe(1);
    // ...and the headline value still counts every win.
    expect(r.decided.wonValue).toBe(1_000_000);
  });
});

describe('F-06 — the population is stated, and every figure opens to exactly its deals', () => {
  const book: ExecOpportunity[] = [
    deal({ id: 'w1', value: 0.1, winReason: 'Best price', accountId: 'a', accountName: 'Alpha' }),
    deal({ id: 'w2', value: 0.2, winReason: 'best price ', accountId: 'a', accountName: 'Alpha' }),
    deal({ id: 'w3', value: 500, winReason: null, accountId: 'b', accountName: 'Beta' }),
    deal({ id: 'w4', value: 70, winReason: 'Relationship', accountId: null, accountName: null }),
    deal({ id: 'l1', stage: 'lost', value: 300, lossReason: 'Price', competitors: 'Rival, Other' }),
    deal({ id: 'l2', stage: 'lost', value: 40, lossReason: '  ', competitors: 'rival', accountId: null }),
    deal({ id: 'l3', stage: 'lost', value: 9, lossReason: 'price', competitors: null }),
    deal({ id: 'old', stage: 'lost', value: 1_000, lossReason: 'Price', updatedAt: ago(400) }),
    deal({ id: 'open', stage: 'proposal', value: 9_999 }),
    deal({ id: 'later', stage: 'won', value: 1, updatedAt: new Date(NOW.getTime() + 60_000).toISOString() }),
  ];

  it('says what it counted: decided on record, decided in the window, and whether the read was whole', () => {
    const r = executiveCrm(book, 365, NOW);
    expect(r.population).toEqual({ decidedOnRecord: 9, counted: 7, complete: true });
    expect(r.period.asOf).toBe(NOW.toISOString());
    expect(executiveCrm(book, 365, NOW, false).population.complete).toBe(false);
  });

  it('closes the window at the read: a deal decided after `asOf` is not in it', () => {
    expect(executiveCrm(book, 365, NOW).decided.won).toBe(4);
  });

  it('sums money exactly — 0.1 + 0.2 is 0.3, not 0.30000000000000004', () => {
    const r = executiveCrm(book, 365, NOW);
    expect(r.winReasons.find((x) => x.reason === 'Best price')?.value).toBe(0.3);
    expect(r.decided.wonValue).toBe(570.3);
  });

  it('each drill lists exactly the deals its figure counted, with the figure\'s count and value', () => {
    const r = executiveCrm(book, 365, NOW);
    const drill = (d: ExecDrill) => executiveCrmRecords(book, 365, NOW, d);
    const ids = (d: ExecDrill) => drill(d).deals.map((x) => x.id).sort();

    expect(drill({ by: 'decided', outcome: 'won' }).total).toEqual({ deals: r.decided.won, value: r.decided.wonValue });
    expect(drill({ by: 'decided', outcome: 'lost' }).total).toEqual({ deals: r.decided.lost, value: r.decided.lostValue });
    expect(drill({ by: 'decided', outcome: null }).total.deals).toBe(r.population.counted);

    for (const row of r.winReasons) {
      expect(drill({ by: 'reason', outcome: 'won', reason: row.reason }).total, `won · ${row.reason}`).toEqual({ deals: row.deals, value: row.value });
    }
    for (const row of r.lossReasons) {
      expect(drill({ by: 'reason', outcome: 'lost', reason: row.reason }).total, `lost · ${row.reason}`).toEqual({ deals: row.deals, value: row.value });
    }
    for (const c of r.competitors) {
      expect(drill({ by: 'competitor', name: c.name }).total, c.name).toEqual({ deals: c.lostDeals, value: c.lostValue });
    }
    for (const t of r.concentration.top) {
      expect(drill({ by: 'account', accountId: t.accountId }).total.value, t.accountName).toBe(t.wonValue);
    }
    expect(drill({ by: 'reason', outcome: 'won', reason: null }).total.deals).toBe(r.coverage.winsWithoutReason);
    expect(drill({ by: 'reason', outcome: 'lost', reason: null }).total.deals).toBe(r.coverage.lossesWithoutReason);
    expect(drill({ by: 'no-account' }).total.deals).toBe(r.coverage.decidedWithoutAccount);

    // Grouping is the read's own: "Price" opens "price" too, and nothing outside the window.
    expect(ids({ by: 'reason', outcome: 'lost', reason: 'PRICE' })).toEqual(['l1', 'l3']);
    expect(ids({ by: 'competitor', name: 'rival' })).toEqual(['l1', 'l2']);
    expect(ids({ by: 'reason', outcome: 'lost', reason: null })).toEqual(['l2']);
  });

  it('a drill shows each deal\'s own reason, biggest first', () => {
    const r = executiveCrmRecords(book, 365, NOW, { by: 'decided', outcome: 'lost' });
    expect(r.deals.map((d) => [d.id, d.reason])).toEqual([['l1', 'Price'], ['l2', null], ['l3', 'price']]);
  });
});

describe('determinism', () => {
  it('is pure: same deals + same now ⇒ same read', () => {
    const deals = [deal(), deal({ id: 'b', stage: 'lost', lossReason: 'price' })];
    expect(executiveCrm(deals, 365, NOW)).toEqual(executiveCrm(deals, 365, NOW));
  });

  it('no deals ⇒ empty lists and null rates, not zeros', () => {
    const r = executiveCrm([], 365, NOW);
    expect(r.winReasons).toEqual([]);
    expect(r.competitors).toEqual([]);
    expect(r.decided.winRate).toBeNull();
    expect(r.concentration.topThreePercent).toBeNull();
  });
});
