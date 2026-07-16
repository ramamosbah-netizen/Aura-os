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
    // The deal's accountName is a SNAPSHOT and is only written when the caller supplies it — a deal
    // created with just an accountId carries none. The snapshot still wins when present (it is what
    // the account was called at the time), but a concentration table that reads "a9e246c3-…" is
    // worthless to an exec, so fall back to what the account is called now.
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
