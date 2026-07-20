import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { ActivityService, LeadService, OpportunityService, buildMyDay, type MyDay } from '@aura/crm';

// C4 — Sales Workspace "My Day". One read that answers "what do I do today", composed from the
// three systems that already hold the facts. No store, no migration: the day is derived.
//
// `userId` defaults to the caller — the honest default is "my" day. It stays overridable because a
// manager coaching a rep needs to see the same page the rep sees, and a second, subtly different
// "team view" is exactly how two views start disagreeing.

@Controller('crm/my-day')
export class MyDayController {
  constructor(
    private readonly activities: ActivityService,
    private readonly leads: LeadService,
    private readonly opportunities: OpportunityService,
    private readonly tenant: TenantContext,
  ) {}

  @Get()
  async myDay(@Query('userId') userId?: string): Promise<MyDay> {
    const ctx = this.tenant.get();
    // No actor bound and no explicit user ⇒ refuse. A null "who" would make every `=== userId`
    // test below match the UNASSIGNED records instead of matching nobody, and the page would
    // quietly show one person the org's orphaned work as their own day.
    const who = userId?.trim() || ctx.actorId;
    if (!who) throw new BadRequestException('no user in context — pass ?userId= to build a day');

    // Leads and opportunities are filtered to `who` in the STORE: buildMyDay discards every
    // record whose assignedTo/ownerId is not this user (`if (lead.assignedTo !== userId)
    // continue`), so loading the tenant's to render one person's was pure waste.
    //
    // ACTIVITIES ARE DELIBERATELY NOT FILTERED. buildMyDay derives lead and opportunity
    // attention from the WHOLE activity stream on purpose — "a colleague's call on my lead
    // still means the lead was touched" (my-day.ts). Narrowing to assigneeId = me would make
    // a colleague's touch invisible and flag my lead as "no activity ever logged" or "gone
    // quiet" when it is neither. Only the work lists are mine; the attention facts are not.
    //
    // See docs/reports/2026-07-20-my-day-operational-review.md §6 (P2).
    const [activities, leads, opportunities] = await Promise.all([
      this.activities.list({ tenantId: ctx.tenantId, limit: 5000 }),
      this.leads.list({ tenantId: ctx.tenantId, assignedTo: who, limit: 5000 }),
      this.opportunities.list({ tenantId: ctx.tenantId, ownerId: who, limit: 5000 }),
    ]);

    return buildMyDay({ userId: who, activities, leads, opportunities });
  }
}
