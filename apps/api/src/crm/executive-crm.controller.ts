import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { Permissions, TenantContext } from '@aura/core';
import type { OpportunityStage } from '@aura/shared';
import {
  AccountService, OpportunityService, execOpportunityOf, executiveCrm, executiveCrmRecords,
  type ExecDrill, type ExecOpportunity, type ExecRecords, type ExecutiveCrm,
} from '@aura/crm';
import { readEveryPage } from '../common/complete-read';

// C6 (§7 exec) — the Executive CRM read. Deliberately narrow: it answers only the questions that
// had no home (why we win/lose, and how concentrated the book is). Owner performance is NOT here —
// the pipeline cockpit owns it, and one owner may not have two win rates.
//
// F-06 — it used to aggregate `list({ limit: 5000 })`: the newest 5,000 opportunities of every stage,
// so a book past that size was judged on part of itself with nothing on screen to say so. It now
// reads every won and every lost deal (open deals never enter this read), states what it counted,
// and opens any figure to the exact deals behind it.

const MAX_PERIOD_DAYS = 3650;
const DRILLS = 'decided, reason, no-reason, competitor, account, no-account';

/** A junk or absurd window silently becoming "all time" would answer a question nobody asked. */
function periodOf(days: string | undefined): number {
  const parsed = Number(days);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), MAX_PERIOD_DAYS) : 365;
}

/** The moment the figures were read at. A drill names it so it lists the deals those figures were over. */
function asOfOf(raw: string | undefined): Date {
  if (!raw) return new Date();
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) throw new BadRequestException(`asOf "${raw}" is not a date`);
  // A later moment than now cannot see a deal that has not been decided yet; read it as now.
  return new Date(Math.min(t, Date.now()));
}

function outcomeOf(raw: string | undefined): 'won' | 'lost' {
  if (raw === 'won' || raw === 'lost') return raw;
  throw new BadRequestException(`outcome must be won or lost${raw ? `, not "${raw}"` : ''}`);
}

function drillOf(q: { by?: string; outcome?: string; reason?: string; name?: string; accountId?: string }): ExecDrill {
  switch (q.by ?? 'decided') {
    case 'decided':
      return { by: 'decided', outcome: q.outcome ? outcomeOf(q.outcome) : null };
    case 'reason':
      if (!q.reason?.trim()) throw new BadRequestException('a reason drill requires the reason; the deals with none are by=no-reason');
      return { by: 'reason', outcome: outcomeOf(q.outcome), reason: q.reason };
    case 'no-reason':
      return { by: 'reason', outcome: outcomeOf(q.outcome), reason: null };
    case 'competitor':
      if (!q.name?.trim()) throw new BadRequestException('a competitor drill requires the competitor name');
      return { by: 'competitor', name: q.name };
    case 'account':
      if (!q.accountId?.trim()) throw new BadRequestException('an account drill requires the accountId');
      return { by: 'account', accountId: q.accountId };
    case 'no-account':
      return { by: 'no-account' };
    default:
      throw new BadRequestException(`unknown drill "${q.by}" — one of ${DRILLS}`);
  }
}

@Controller('crm/executive')
export class ExecutiveCrmController {
  constructor(
    private readonly opportunities: OpportunityService,
    private readonly accounts: AccountService,
    private readonly tenant: TenantContext,
  ) {}

  @Permissions('crm.executive.read')
  @Get()
  async read(@Query('days') days?: string): Promise<ExecutiveCrm> {
    const { deals, complete } = await this.decidedDeals();
    return executiveCrm(deals, periodOf(days), new Date(), complete);
  }

  /**
   * The exact deals behind one figure of the read above: the same deals, the same window (named by
   * the read's `asOf`), the same grouping — so the list's count and value are the figure's.
   */
  @Permissions('crm.executive.read')
  @Get('records')
  async records(
    @Query('days') days?: string,
    @Query('asOf') asOf?: string,
    @Query('by') by?: string,
    @Query('outcome') outcome?: string,
    @Query('reason') reason?: string,
    @Query('name') name?: string,
    @Query('accountId') accountId?: string,
  ): Promise<ExecRecords & { complete: boolean }> {
    const drill = drillOf({ by, outcome, reason, name, accountId });
    const now = asOfOf(asOf);
    const { deals, complete } = await this.decidedDeals();
    return { ...executiveCrmRecords(deals, periodOf(days), now, drill), complete };
  }

  /**
   * Every won and every lost deal of the tenant, read whole: page after page to the store's own
   * total, each outcome separately (open deals never enter this read). `complete` is false only
   * when a population would not hold still while it was read, and the read then says so.
   */
  private async decidedDeals(): Promise<{ deals: ExecOpportunity[]; complete: boolean }> {
    const tenantId = this.tenant.get().tenantId;
    const read = (stage: OpportunityStage) =>
      readEveryPage((page) => this.opportunities.listPaged({ tenantId, stage }, page));
    const [won, lost] = await Promise.all([read('won'), read('lost')]);
    const decided = [...won.items, ...lost.items].filter((o) => o.tenantId === tenantId);

    // The snapshot wins when present (it is what the account was called at the time); this falls
    // back to the current name because a concentration table that reads "a9e246c3-…" is worthless
    // to an exec. The creates resolve the snapshot and 0181 backfilled the rows written before they
    // did, so this should never fire — it looks up only the accounts actually missing a name,
    // rather than listing every account to find them.
    const missing = [...new Set(decided.flatMap((o) => (o.accountId && !o.accountName ? [o.accountId] : [])))];
    const names = new Map<string, string>();
    for (const id of missing) {
      const account = await this.accounts.get(id);
      if (account && account.tenantId === tenantId) names.set(id, account.name);
    }

    return {
      deals: decided.map((o) => ({
        ...execOpportunityOf(o),
        accountName: o.accountName ?? (o.accountId ? names.get(o.accountId) ?? null : null),
      })),
      complete: won.settled && lost.settled,
    };
  }
}
