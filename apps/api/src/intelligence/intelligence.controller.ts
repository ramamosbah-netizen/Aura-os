import { Controller, Get, Post } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { type Briefing, type Funnel, InsightService, PipelineProjection, winRate } from '@aura/intelligence';

/**
 * Intelligence API — read-only views of the deal-chain projection + an on-demand AI
 * briefing. GET is a pure read of the in-memory projection; POST generates a briefing
 * and emits `intelligence.insight.generated` onto the spine.
 */
@Controller('intelligence')
export class IntelligenceController {
  constructor(
    private readonly projection: PipelineProjection,
    private readonly insights: InsightService,
    private readonly tenant: TenantContext,
  ) {}

  @Get('pipeline')
  pipeline(): { funnel: Funnel; winRate: number | null } {
    const funnel = this.projection.snapshot(this.tenant.get().tenantId);
    return { funnel, winRate: winRate(funnel) };
  }

  @Post('insights')
  generate(): Promise<Briefing> {
    const ctx = this.tenant.get();
    return this.insights.generateBriefing(ctx.tenantId, ctx.actorId);
  }
}
