import { describe, it, expect, vi } from 'vitest';
import type { EventStore } from '@aura/core';
import type { Opportunity } from '@aura/shared';
import { ForecastSnapshotService } from './forecast-snapshot.service';
import { InMemoryForecastSnapshotStore } from './in-memory-forecast-snapshot-store';
import type { OpportunityService } from './opportunity.service';

// A stub OpportunityService whose list() returns a mutable set of forecastable opps.
function harness(initial: Array<Partial<Opportunity>>) {
  let opps = initial;
  const opportunities = { list: vi.fn(async () => opps) } as unknown as OpportunityService;
  const events = { append: vi.fn().mockResolvedValue(undefined) } as unknown as EventStore;
  const svc = new ForecastSnapshotService(new InMemoryForecastSnapshotStore(), opportunities, events);
  return { svc, events, setOpps: (next: Array<Partial<Opportunity>>) => { opps = next; } };
}

const opp = (o: Partial<Opportunity>): Partial<Opportunity> => ({
  stage: 'proposal', value: 100, winProbability: 50, closeDate: '2026-08-15', ...o,
});

describe('ForecastSnapshotService', () => {
  it('captures the open pipeline into period rows and emits', async () => {
    const { svc, events } = harness([
      opp({ value: 100, winProbability: 50, closeDate: '2026-08-15' }),
      opp({ value: 200, winProbability: 80, closeDate: '2026-09-01' }),
      opp({ stage: 'won', value: 999 }), // excluded
    ]);
    const cap = await svc.capture('t1', 'u1');
    expect(cap.totalDeals).toBe(2);
    expect(cap.totalWeighted).toBe(100 * 0.5 + 200 * 0.8); // 210
    expect(cap.periods.map((p) => p.period)).toEqual(['2026-08', '2026-09']);
    expect(events.append).toHaveBeenCalled();
  });

  it('history exposes slippage between the two most-recent captures', async () => {
    const h = harness([
      opp({ value: 100, winProbability: 50, closeDate: '2026-08-15' }),
      opp({ value: 200, winProbability: 50, closeDate: '2026-08-20' }),
    ]);
    await h.svc.capture('t1');

    // A deal slips from August to September.
    h.setOpps([
      opp({ value: 100, winProbability: 50, closeDate: '2026-08-15' }),
      opp({ value: 200, winProbability: 50, closeDate: '2026-09-20' }),
    ]);
    await h.svc.capture('t1');

    const hist = await h.svc.history('t1');
    expect(hist.captures).toHaveLength(2);
    expect(hist.latestDiff.hasPrior).toBe(true);
    const aug = hist.latestDiff.byPeriod.find((p) => p.period === '2026-08')!;
    expect(aug.dealDelta).toBe(-1);
    expect(hist.latestDiff.reasons).toContain('1 deal slipped from 2026-08');
  });

  it('first-ever capture has no prior to diff against', async () => {
    const { svc } = harness([opp({})]);
    await svc.capture('t1');
    const hist = await svc.history('t1');
    expect(hist.captures).toHaveLength(1);
    expect(hist.latestDiff.hasPrior).toBe(false);
  });

  it('scopes captures by tenant', async () => {
    const { svc } = harness([opp({})]);
    await svc.capture('t1');
    const other = await svc.history('t2');
    expect(other.captures).toHaveLength(0);
  });
});
