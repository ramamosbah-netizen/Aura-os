import { Controller, Get } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { ActivityService, ContactService, OpportunityService } from '@aura/crm';
import type { Opportunity } from '@aura/shared';

// Sales Pipeline Command Center — the sales manager's cockpit. Turns the raw
// opportunity list into portfolio KPIs, a weighted forecast, pipeline aging,
// stalled deals, owner performance, and an at-risk list with rule-based next-step
// recommendations. One endpoint, computed from opportunities + activities +
// contacts (no extra store).

const ACTIVE = (o: Opportunity): boolean => o.stage !== 'won' && o.stage !== 'lost';
const r2 = (n: number): number => Math.round(n * 100) / 100;
const daysBetween = (iso: string): number => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

interface OwnerRow {
  ownerId: string;
  openDeals: number;
  openValue: number;
  weighted: number;
  wonValue90: number;
  won90: number;
  lost90: number;
  winRate: number | null;
}
interface AtRisk {
  id: string; title: string; value: number; stage: string; ownerId: string | null;
  accountName: string | null; reasons: string[]; recommendation: string; daysSinceActivity: number | null;
}

@Controller('crm/opportunities')
export class PipelineCommandController {
  constructor(
    private readonly opportunities: OpportunityService,
    private readonly activities: ActivityService,
    private readonly contacts: ContactService,
    private readonly tenant: TenantContext,
  ) {}

  @Get('pipeline')
  async pipeline(): Promise<unknown> {
    const tenantId = this.tenant.get().tenantId;
    const [opps, activities, contacts] = await Promise.all([
      this.opportunities.list({ tenantId, limit: 5000 }),
      this.activities.list({ tenantId, limit: 5000 }),
      this.contacts.list({ tenantId, limit: 5000 }),
    ]);

    const open = opps.filter(ACTIVE);
    const now90 = new Date(Date.now() - 90 * 86400000).toISOString();
    const won90 = opps.filter((o) => o.stage === 'won' && o.updatedAt >= now90);
    const lost90 = opps.filter((o) => o.stage === 'lost' && o.updatedAt >= now90);

    // Last activity per opportunity (from the activity stream).
    const lastActivity = new Map<string, string>();
    for (const a of activities) {
      if (!a.relatedId) continue;
      const at = a.completedAt ?? a.createdAt;
      const prev = lastActivity.get(a.relatedId);
      if (!prev || at > prev) lastActivity.set(a.relatedId, at);
    }
    // Which accounts have a mapped decision-maker (for the "map the buyer" nudge).
    const accountsWithDM = new Set(
      contacts.filter((c) => c.stakeholderRole === 'decision_maker' && c.accountId).map((c) => c.accountId),
    );

    const openValue = r2(open.reduce((s, o) => s + o.value, 0));
    const weighted = r2(open.reduce((s, o) => s + o.value * (o.winProbability / 100), 0));
    const winRate = won90.length + lost90.length > 0 ? r2((won90.length / (won90.length + lost90.length)) * 100) : null;
    const avgAge = open.length ? Math.round(open.reduce((s, o) => s + daysBetween(o.createdAt), 0) / open.length) : 0;

    const kpis = {
      openDeals: open.length,
      openValue,
      weighted,
      avgDealSize: open.length ? r2(openValue / open.length) : 0,
      avgAgeDays: avgAge,
      winRate,
      won90: won90.length,
      wonValue90: r2(won90.reduce((s, o) => s + o.value, 0)),
      lost90: lost90.length,
    };

    // Weighted forecast by expected-close month.
    const byMonth = new Map<string, { deals: number; value: number; weighted: number }>();
    for (const o of open) {
      const key = o.closeDate ? o.closeDate.slice(0, 7) : 'unscheduled';
      const row = byMonth.get(key) ?? { deals: 0, value: 0, weighted: 0 };
      row.deals += 1; row.value += o.value; row.weighted += o.value * (o.winProbability / 100);
      byMonth.set(key, row);
    }
    const forecastByMonth = [...byMonth.entries()]
      .sort(([a], [b]) => (a === 'unscheduled' ? 1 : b === 'unscheduled' ? -1 : a < b ? -1 : 1))
      .map(([month, r]) => ({ month, deals: r.deals, value: r2(r.value), weighted: r2(r.weighted) }));

    // Pipeline aging.
    const agingDefs: Array<{ key: string; label: string; min: number; max: number }> = [
      { key: 'fresh', label: '0–14 days', min: 0, max: 14 },
      { key: 'active', label: '15–30 days', min: 15, max: 30 },
      { key: 'aging', label: '31–60 days', min: 31, max: 60 },
      { key: 'stale', label: '60+ days', min: 61, max: Infinity },
    ];
    const aging = agingDefs.map((d) => {
      const items = open.filter((o) => { const age = daysBetween(o.createdAt); return age >= d.min && age <= d.max; });
      return { key: d.key, label: d.label, deals: items.length, value: r2(items.reduce((s, o) => s + o.value, 0)) };
    });

    // Stalled — open, no activity in 21+ days (or never), age 14+ days.
    const stalled = open
      .map((o) => ({ o, last: lastActivity.get(o.id) ?? null }))
      .filter(({ o, last }) => daysBetween(o.createdAt) >= 14 && (last === null || daysBetween(last) >= 21))
      .map(({ o, last }) => ({
        id: o.id, title: o.title, value: o.value, stage: o.stage, ownerId: o.ownerId,
        accountName: o.accountName, daysSinceActivity: last ? daysBetween(last) : null,
      }))
      .sort((a, b) => b.value - a.value);

    // Owner performance.
    const ownerMap = new Map<string, OwnerRow>();
    const ownerOf = (id: string | null): string => id ?? 'unassigned';
    for (const o of open) {
      const k = ownerOf(o.ownerId);
      const row = ownerMap.get(k) ?? { ownerId: k, openDeals: 0, openValue: 0, weighted: 0, wonValue90: 0, won90: 0, lost90: 0, winRate: null };
      row.openDeals += 1; row.openValue += o.value; row.weighted += o.value * (o.winProbability / 100);
      ownerMap.set(k, row);
    }
    for (const o of won90) { const r = ownerMap.get(ownerOf(o.ownerId)) ?? { ownerId: ownerOf(o.ownerId), openDeals: 0, openValue: 0, weighted: 0, wonValue90: 0, won90: 0, lost90: 0, winRate: null }; r.won90 += 1; r.wonValue90 += o.value; ownerMap.set(ownerOf(o.ownerId), r); }
    for (const o of lost90) { const r = ownerMap.get(ownerOf(o.ownerId)) ?? { ownerId: ownerOf(o.ownerId), openDeals: 0, openValue: 0, weighted: 0, wonValue90: 0, won90: 0, lost90: 0, winRate: null }; r.lost90 += 1; ownerMap.set(ownerOf(o.ownerId), r); }
    const owners = [...ownerMap.values()].map((r) => ({
      ...r,
      openValue: r2(r.openValue), weighted: r2(r.weighted), wonValue90: r2(r.wonValue90),
      winRate: r.won90 + r.lost90 > 0 ? r2((r.won90 / (r.won90 + r.lost90)) * 100) : null,
    })).sort((a, b) => b.weighted - a.weighted);

    // At-risk deals + rule-based recommendations.
    const today = new Date().toISOString().slice(0, 10);
    const atRisk: AtRisk[] = [];
    for (const o of open) {
      const last = lastActivity.get(o.id) ?? null;
      const dsa = last ? daysBetween(last) : null;
      const qual = [o.budgetConfirmed, o.authorityConfirmed, o.needConfirmed, o.timelineConfirmed].filter(Boolean).length;
      const reasons: string[] = [];
      if (o.closeDate && o.closeDate < today) reasons.push('expected close date passed');
      if (last === null || (dsa !== null && dsa >= 21)) reasons.push(last === null ? 'no activity ever logged' : `quiet for ${dsa} days`);
      if (qual < 2) reasons.push(`weak qualification (${qual}/4)`);
      if (o.accountId && !accountsWithDM.has(o.accountId)) reasons.push('no decision-maker mapped');
      if (reasons.length === 0) continue;

      // Recommendation: act on the most actionable reason first.
      let recommendation: string;
      if (o.closeDate && o.closeDate < today) recommendation = 'Re-baseline the close date and confirm the deal is still live.';
      else if (last === null || (dsa !== null && dsa >= 21)) recommendation = 'Log a touch — call or email the buyer to re-engage.';
      else if (o.accountId && !accountsWithDM.has(o.accountId)) recommendation = 'Map the decision-maker at this account.';
      else recommendation = 'Qualify the deal — confirm budget, authority, need and timeline.';

      atRisk.push({
        id: o.id, title: o.title, value: o.value, stage: o.stage, ownerId: o.ownerId,
        accountName: o.accountName, reasons, recommendation, daysSinceActivity: dsa,
      });
    }
    atRisk.sort((a, b) => (b.value * b.reasons.length) - (a.value * a.reasons.length));

    return { kpis, forecastByMonth, aging, stalled, owners, atRisk };
  }
}
