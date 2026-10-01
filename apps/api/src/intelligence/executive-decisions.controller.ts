import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { Permissions, TenantContext } from '@aura/core';
import type { ExecutiveDecisionDetail, ExecutiveDecisionsView } from './executive-decisions';
import { ExecutiveDecisionsService } from './executive-decisions.service';

/**
 * The executive decision set (F-10) — every figure with when it was read, what it counted, where it
 * came from, and the exact records behind it.
 *
 * `intelligence.executive-decision.read`, which Senior Management holds through `intelligence.*.read`
 * and nothing else in the shipped catalogue does: the figures cross every module, and a role that can
 * read only its own should not read them all through here.
 */
@Controller('intelligence/executive-decisions')
export class ExecutiveDecisionsController {
  constructor(
    private readonly decisions: ExecutiveDecisionsService,
    private readonly tenant: TenantContext,
  ) {}

  @Permissions('intelligence.executive-decision.read')
  @Get()
  view(): Promise<ExecutiveDecisionsView> {
    return this.decisions.view(this.tenant.get().tenantId);
  }

  /** One decision and the exact records it counted. */
  @Permissions('intelligence.executive-decision.read')
  @Get(':id')
  async detail(@Param('id') id: string): Promise<ExecutiveDecisionDetail> {
    const found = await this.decisions.detail(this.tenant.get().tenantId, id);
    if (!found) throw new NotFoundException(`executive decision ${id} not found`);
    return found;
  }
}
