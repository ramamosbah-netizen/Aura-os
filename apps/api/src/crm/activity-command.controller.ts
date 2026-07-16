import { Controller, Get, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { AccountService, ActivityService, OpportunityService, ATTENTION_THRESHOLDS, lastActivityByRecord, daysSince, isQuiet, type Activity } from '@aura/crm';

// Commercial Activity command center — the "what needs my attention today" view.
// Beyond the agenda (overdue / due), it detects RELATIONSHIP INACTIVITY: accounts
// and open opportunities that have gone quiet, so nothing slips through the cracks.

interface AttentionItem {
  kind: 'account' | 'opportunity';
  id: string;
  name: string;
  reason: string;
  lastActivityAt: string | null;
  daysSince: number | null;
  href: string;
}

interface CommandPayload {
  counts: { open: number; overdue: number; dueToday: number; dueThisWeek: number; unassigned: number; completed30: number };
  overdue: Activity[];
  inactivity: AttentionItem[];
  staleThresholdDays: { account: number; opportunity: number };
}

@Controller('crm/activities')
export class ActivityCommandController {
  constructor(
    private readonly activities: ActivityService,
    private readonly accounts: AccountService,
    private readonly opportunities: OpportunityService,
    private readonly tenant: TenantContext,
  ) {}

  @Get('command')
  async command(
    @Query('accountStaleDays') accountStaleDays?: string,
    @Query('oppStaleDays') oppStaleDays?: string,
  ): Promise<CommandPayload> {
    const tenantId = this.tenant.get().tenantId;
    const acctStale = Number(accountStaleDays) > 0 ? Number(accountStaleDays) : ATTENTION_THRESHOLDS.accountIdleDays;
    const oppStale = Number(oppStaleDays) > 0 ? Number(oppStaleDays) : ATTENTION_THRESHOLDS.opportunityIdleDays;

    const [activities, accounts, opportunities] = await Promise.all([
      this.activities.list({ tenantId, limit: 5000 }),
      this.accounts.list({ tenantId, limit: 2000 }),
      this.opportunities.list({ tenantId, limit: 5000 }),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const open = activities.filter((a) => a.status === 'open' || a.status === 'in_progress');
    const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    const counts = {
      open: open.length,
      overdue: open.filter((a) => a.dueDate && a.dueDate < today).length,
      dueToday: open.filter((a) => a.dueDate === today).length,
      dueThisWeek: open.filter((a) => a.dueDate && a.dueDate > today && a.dueDate <= weekEnd).length,
      unassigned: open.filter((a) => !a.assigneeId).length,
      completed30: activities.filter((a) => a.status === 'completed' && a.completedAt && a.completedAt >= thirtyAgo).length,
    };

    const overdue = open
      .filter((a) => a.dueDate && a.dueDate < today)
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));

    // Last touch per related record — shared with the intelligence & pipeline engines.
    const now = new Date();
    const lastByRelated = lastActivityByRecord(activities);

    const inactivity: AttentionItem[] = [];

    // Accounts with live business but no recent activity.
    for (const acc of accounts) {
      if (acc.status === 'inactive' || acc.status === 'dormant') continue;
      const last = lastByRelated.get(acc.id) ?? null;
      const ds = daysSince(last, now);
      if (isQuiet(last, acctStale, now)) {
        inactivity.push({
          kind: 'account', id: acc.id, name: acc.name,
          reason: last === null ? 'no activity ever logged' : `no activity in ${ds} days`,
          lastActivityAt: last, daysSince: ds, href: `/crm/accounts/${acc.id}`,
        });
      }
    }

    // Open opportunities that have gone quiet — the real revenue risk.
    for (const o of opportunities) {
      if (o.stage === 'won' || o.stage === 'lost') continue;
      const last = lastByRelated.get(o.id) ?? null;
      const ds = daysSince(last, now);
      if (isQuiet(last, oppStale, now)) {
        inactivity.push({
          kind: 'opportunity', id: o.id, name: o.title,
          reason: last === null ? 'no activity — never worked' : `no activity in ${ds} days`,
          lastActivityAt: last, daysSince: ds, href: `/crm/opportunities/${o.id}`,
        });
      }
    }

    // Worst first (never-touched, then longest-quiet).
    inactivity.sort((a, b) => (b.daysSince ?? 99999) - (a.daysSince ?? 99999));

    return { counts, overdue, inactivity, staleThresholdDays: { account: acctStale, opportunity: oppStale } };
  }
}
