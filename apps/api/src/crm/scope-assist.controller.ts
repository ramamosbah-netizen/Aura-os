import { BadRequestException, Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { OpportunityService, ScopeAssistService } from '@aura/crm';

/**
 * AURA Scope Assist (Slice 5) — grounded, read-only scope suggestion over a direct deal's evidence.
 * Generate proposes; Accept spins the suggestion off into an EDITABLE draft basis (Accept ≠ Approve —
 * approval stays a separate human command on the Commercial panel). Tender-route deals are excluded:
 * their scope is owned by the tender.
 */
@Controller('crm/opportunities')
export class ScopeAssistController {
  constructor(
    private readonly scopeAssist: ScopeAssistService,
    private readonly opportunities: OpportunityService,
    private readonly tenant: TenantContext,
  ) {}

  private async directOpp(id: string) {
    const opp = await this.opportunities.get(id);
    if (!opp) throw new NotFoundException(`opportunity ${id} not found`);
    if (opp.tenderId || opp.executionType === 'tender') {
      throw new BadRequestException('this is a tender-route deal — its scope is managed by the tender, not Scope Assist');
    }
    return opp;
  }

  @Get(':id/scope-assist')
  async read(@Param('id', ParseUuidOr404Pipe) id: string) {
    const ctx = this.tenant.get();
    const opp = await this.opportunities.get(id);
    if (!opp) throw new NotFoundException(`opportunity ${id} not found`);
    return { proposals: await this.scopeAssist.read(ctx.tenantId, id) };
  }

  @Post(':id/scope-assist/generate')
  async generate(@Param('id', ParseUuidOr404Pipe) id: string) {
    const opp = await this.directOpp(id);
    const ctx = this.tenant.get();
    return this.scopeAssist.generate({ tenantId: ctx.tenantId, companyId: opp.companyId, opportunityId: id, actorId: ctx.actorId });
  }

  @Post(':id/scope-assist/:proposalId/accept')
  async accept(@Param('id', ParseUuidOr404Pipe) id: string, @Param('proposalId', ParseUuidOr404Pipe) proposalId: string) {
    const opp = await this.directOpp(id);
    const ctx = this.tenant.get();
    return this.scopeAssist.accept({ tenantId: ctx.tenantId, companyId: opp.companyId, opportunityId: id, proposalId, actorId: ctx.actorId });
  }
}
