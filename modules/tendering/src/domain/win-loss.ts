import { type Id, newId } from '@aura/shared';

// Tendering domain — framework-free. A TenderOutcome records how a bid concluded:
// who we were up against, what they (and we) bid, and why it went the way it did.
// The analytics roll outcomes up into win-rate + head-to-head competitor stats so
// pricing/no-go decisions are informed by history rather than anecdote.

export type TenderOutcomeResult = 'won' | 'lost';

export interface CompetitorBid {
  name: string;
  /** Competitor's bid value if disclosed (tender openings often publish these). */
  bidValue: number | null;
  /** True on the competitor that won (only meaningful when we lost). */
  winner: boolean;
}

export interface TenderOutcome {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  tenderId: Id;
  tenderTitle: string | null;
  result: TenderOutcomeResult;
  /** Our submitted bid value at decision time (snapshot). */
  ourBidValue: number;
  competitors: CompetitorBid[];
  /** Who won when we lost (derived from the flagged competitor); null when we won. */
  winnerName: string | null;
  /** Debrief reason (price, technical, relationship, …). */
  reason: string | null;
  decidedAt: string;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewTenderOutcome {
  tenantId: Id;
  companyId?: Id | null;
  tenderId: Id;
  tenderTitle?: string | null;
  result: TenderOutcomeResult;
  ourBidValue?: number;
  competitors?: Array<{ name: string; bidValue?: number | null; winner?: boolean }>;
  reason?: string | null;
  decidedAt?: string;
  createdBy?: Id | null;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

export function makeTenderOutcome(input: NewTenderOutcome): TenderOutcome {
  if (!input.tenderId) throw new Error('tenderId is required');
  if (input.result !== 'won' && input.result !== 'lost') throw new Error("result must be 'won' or 'lost'");

  const competitors: CompetitorBid[] = (input.competitors ?? [])
    .filter((c) => c.name?.trim())
    .map((c) => ({
      name: c.name.trim(),
      bidValue: Number.isFinite(c.bidValue) ? Number(c.bidValue) : null,
      winner: input.result === 'lost' && c.winner === true,
    }));

  const flaggedWinners = competitors.filter((c) => c.winner);
  if (flaggedWinners.length > 1) throw new Error('only one competitor can be flagged as the winner');
  if (input.result === 'won' && (input.competitors ?? []).some((c) => c.winner)) {
    throw new Error('cannot flag a winning competitor on a tender we won');
  }

  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    tenderId: input.tenderId,
    tenderTitle: input.tenderTitle?.trim() || null,
    result: input.result,
    ourBidValue: Number.isFinite(input.ourBidValue) ? Number(input.ourBidValue) : 0,
    competitors,
    winnerName: flaggedWinners[0]?.name ?? null,
    reason: input.reason?.trim() || null,
    decidedAt: input.decidedAt ?? new Date().toISOString(),
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

export interface CompetitorStats {
  name: string;
  /** Tenders where we met this competitor. */
  encounters: number;
  /** Encounters we won. */
  weWon: number;
  /** Encounters they won (they were the flagged winner). */
  theyWon: number;
  /** weWon / encounters, as a 0–100 percentage. */
  winRateAgainst: number;
}

export interface WinLossAnalytics {
  totalDecided: number;
  won: number;
  lost: number;
  /** won / totalDecided, as a 0–100 percentage. */
  winRate: number;
  wonValue: number;
  lostValue: number;
  /** Head-to-head stats per competitor, most-encountered first. */
  byCompetitor: CompetitorStats[];
  /** Loss debrief reasons ranked by frequency. */
  topLossReasons: Array<{ reason: string; count: number }>;
}

/** Roll recorded outcomes up into win-rate + head-to-head competitor analytics. */
export function buildWinLossAnalytics(outcomes: TenderOutcome[]): WinLossAnalytics {
  const won = outcomes.filter((o) => o.result === 'won');
  const lost = outcomes.filter((o) => o.result === 'lost');

  const byName = new Map<string, CompetitorStats>();
  for (const o of outcomes) {
    for (const c of o.competitors) {
      const key = c.name.toLowerCase();
      const stats = byName.get(key) ?? { name: c.name, encounters: 0, weWon: 0, theyWon: 0, winRateAgainst: 0 };
      stats.encounters += 1;
      if (o.result === 'won') stats.weWon += 1;
      if (c.winner) stats.theyWon += 1;
      byName.set(key, stats);
    }
  }
  const byCompetitor = [...byName.values()]
    .map((s) => ({ ...s, winRateAgainst: s.encounters > 0 ? r2((s.weWon / s.encounters) * 100) : 0 }))
    .sort((a, b) => b.encounters - a.encounters || a.name.localeCompare(b.name));

  const reasonCounts = new Map<string, number>();
  for (const o of lost) {
    if (o.reason) reasonCounts.set(o.reason, (reasonCounts.get(o.reason) ?? 0) + 1);
  }
  const topLossReasons = [...reasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));

  return {
    totalDecided: outcomes.length,
    won: won.length,
    lost: lost.length,
    winRate: outcomes.length > 0 ? r2((won.length / outcomes.length) * 100) : 0,
    wonValue: r2(won.reduce((s, o) => s + o.ourBidValue, 0)),
    lostValue: r2(lost.reduce((s, o) => s + o.ourBidValue, 0)),
    byCompetitor,
    topLossReasons,
  };
}

export const TENDER_OUTCOME_EVENT = {
  recorded: 'tendering.outcome.recorded',
} as const;
