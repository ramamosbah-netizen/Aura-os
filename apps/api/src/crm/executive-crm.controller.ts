import { Controller, Get, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { AccountService, OpportunityService, executiveCrm, type ExecutiveCrm } from '@aura/crm';

// C6 (§7 exec) — the Executive CRM read. Deliberately narrow: it answers only the questions that
// had no home (why we win/lose, and how concentrated the book is). Owner performance is NOT here —
// the pipeline cockpit owns it, and one owner may not have two win rates.

const MAX_PERIOD_DAYS = 3650;

@Controller('crm/executive')
export class ExecutiveCrmController {
  constructor(
    private readonly opportunities: OpportunityService,
    private readonly accounts: AccountService,
    private readonly tenant: TenantContext,
  ) {}

  @Get()
  async read(@Query('days') days?: string): Promise<ExecutiveCrm> {
    const tenantId = this.tenant.get().tenantId;
    const parsed = Number(days);
    // A junk or absurd window silently becoming "all time" would answer a question nobody asked;
    // clamp to something a human could have meant, and the payload echoes the window it used.
    const window = Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), MAX_PERIOD_DAYS) : 365;

    const [opportunities, accounts] = await Promise.all([
      this.opportunities.list({ tenantId, limit: 5000 }),
      this.accounts.list({ tenantId, limit: 2000 }),
    ]);
    // The snapshot wins when present (it is what the account was called at the time); this falls
    // back to the current name because a concentration table that reads "a9e246c3-…" is worthless
    // to an exec. The creates now resolve the snapshot and 0181 backfilled the rows written before
    // they did, so this should never fire — it is kept because the cost is nil (the accounts are
    // already loaded to group the table) and the failure it prevents lands in front of an exec.
    const nameById = new Map(accounts.map((a) => [a.id, a.name]));

    return executiveCrm(
      opportunities.map((o) => ({
        id: o.id,
        accountId: o.accountId,
        accountName: o.accountName ?? (o.accountId ? nameById.get(o.accountId) ?? null : null),
        stage: o.stage,
        value: o.value,
        ownerId: o.ownerId,
        winReason: o.winReason,
        lossReason: o.lossReason,
        competitors: o.competitors,
        updatedAt: o.updatedAt,
      })),
      window,
    );
  }
}
