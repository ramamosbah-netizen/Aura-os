import { describe, it, expect } from 'vitest';
import {
  buildAttentionFeed,
  summarizeAttention,
  recommendedActions,
  type PendingDecision,
  type ProjectLedgerSignal,
} from './attention';
import { computeBusinessHealth } from './health';

const NOW = new Date('2026-07-03T12:00:00Z').getTime();
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const decisions: PendingDecision[] = [
  { id: 'p1', module: 'Procurement', kind: 'Purchase Request', title: 'Concrete', detail: '', action: 'Approve', href: '/pr', value: 5_000, createdAt: daysAgo(0) },
  { id: 'i1', module: 'Finance', kind: 'Invoice', title: 'Big supply', detail: '', action: 'Pay', href: '/inv', value: 2_000_000, createdAt: daysAgo(9) },
  { id: 't1', module: 'Tendering', kind: 'Tender', title: 'Metro bid', detail: '', action: 'Decide', href: '/t', value: 500_000, createdAt: daysAgo(1) },
];

const ledgers: ProjectLedgerSignal[] = [
  { projectId: 'a', projectName: 'Marina Tower', budget: 1_000_000, committed: 800_000, invoiced: 1_200_000, variance: -200_000 },
  { projectId: 'b', projectName: 'Airport ELV', budget: 2_000_000, committed: 1_500_000, invoiced: 900_000, variance: 100_000 },
];

describe('attention feed', () => {
  it('ranks a high-value aged payment and a budget overspend above routine approvals', () => {
    const feed = buildAttentionFeed(decisions, ledgers, { now: NOW });
    // both the 2M/9-day Pay and the over-budget project should outrank the 5k same-day PR
    const prIndex = feed.findIndex((f) => f.id.endsWith(':p1'));
    const payIndex = feed.findIndex((f) => f.id.endsWith(':i1'));
    const riskIndex = feed.findIndex((f) => f.id === 'risk:budget:a');
    expect(payIndex).toBeLessThan(prIndex);
    expect(riskIndex).toBeLessThan(prIndex);
    // the overspent project is critical
    expect(feed[riskIndex].severity).toBe('critical');
  });

  it('derives a risk item only for over-budget projects', () => {
    const feed = buildAttentionFeed([], ledgers, { now: NOW });
    const risks = feed.filter((f) => f.category === 'risk');
    expect(risks).toHaveLength(1); // only Marina Tower (invoiced > budget); Airport is healthy
    expect(risks[0].title).toBe('Marina Tower');
    expect(risks[0].reason).toMatch(/over budget/i);
  });

  it('summarizes counts and value at stake', () => {
    const feed = buildAttentionFeed(decisions, ledgers, { now: NOW });
    const s = summarizeAttention(feed);
    expect(s.total).toBe(feed.length);
    expect(s.critical).toBeGreaterThanOrEqual(1);
    expect(s.valueAtStake).toBeGreaterThan(2_000_000);
  });

  it('recommends the top items as imperative next actions', () => {
    const feed = buildAttentionFeed(decisions, ledgers, { now: NOW });
    const recs = recommendedActions(feed, 2);
    expect(recs).toHaveLength(2);
    expect(recs[0].label).toMatch(/^(Pay|Review|Decide)/);
    expect(recs[0].href).toBeTruthy();
  });

  it('is deterministic for a fixed now', () => {
    const a = buildAttentionFeed(decisions, ledgers, { now: NOW });
    const b = buildAttentionFeed(decisions, ledgers, { now: NOW });
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(a.map((x) => x.score)).toEqual(b.map((x) => x.score));
  });
});

describe('business health', () => {
  it('penalizes critical backlog, aging, and budget overruns with named drivers', () => {
    const feed = buildAttentionFeed(decisions, ledgers, { now: NOW });
    const health = computeBusinessHealth({ attention: feed, ledgers, winRate: 0.2, now: NOW });
    expect(health.score).toBeLessThan(100);
    expect(health.band).not.toBe('strong');
    const labels = health.drivers.map((d) => d.label);
    expect(labels).toContain('Open decisions');
    expect(labels).toContain('Budget variance');
    expect(labels).toContain('Low win rate');
    // most negative driver sorts first
    expect(health.drivers[0].impact).toBeLessThanOrEqual(health.drivers[health.drivers.length - 1].impact);
  });

  it('is strong when the queue is clear and budgets are on track', () => {
    const clean = computeBusinessHealth({
      attention: [],
      ledgers: [{ projectId: 'x', projectName: 'X', budget: 1_000_000, committed: 400_000, invoiced: 300_000, variance: 700_000 }],
      winRate: 0.6,
      now: NOW,
    });
    expect(clean.score).toBe(100);
    expect(clean.band).toBe('strong');
    expect(clean.drivers.map((d) => d.label)).toContain('Budgets on track');
  });
});
