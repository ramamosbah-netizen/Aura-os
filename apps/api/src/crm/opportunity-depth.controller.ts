import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import {
  OpportunityDepthService, type OpportunityDepth, OpportunityService,
} from '@aura/crm';
import type {
  OpportunityStakeholder, OpportunityDealMember, Commitment, DealRegisterItem, OpportunityRisk,
  StakeholderRole, InfluenceLevel, Sentiment, DealTeamRole, CommitmentDirection,
  RegisterKind, RegisterStatus, RiskType, RiskLikelihood, RiskImpact, RiskStatus,
} from '@aura/shared';

class StakeholderDto {
  @IsOptional() @IsString() contactId?: string;
  @IsString() contactName!: string;
  @IsOptional() @IsString() role?: StakeholderRole;
  @IsOptional() @IsString() influence?: InfluenceLevel;
  @IsOptional() @IsBoolean() decisionPower?: boolean;
  @IsOptional() @IsString() sentiment?: Sentiment;
  @IsOptional() @IsBoolean() isChampion?: boolean;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsString() notes?: string;
}
class UpdateStakeholderDto {
  @IsOptional() @IsString() role?: StakeholderRole;
  @IsOptional() @IsString() influence?: InfluenceLevel;
  @IsOptional() @IsBoolean() decisionPower?: boolean;
  @IsOptional() @IsString() sentiment?: Sentiment;
  @IsOptional() @IsBoolean() isChampion?: boolean;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() contactName?: string;
}
class DealMemberDto {
  @IsString() userId!: string;
  @IsOptional() @IsString() userName?: string;
  @IsOptional() @IsString() role?: DealTeamRole;
  @IsOptional() @IsString() responsibility?: string;
}
class CommitmentDto {
  @IsString() direction!: CommitmentDirection;
  @IsString() description!: string;
  @IsOptional() @IsString() committedBy?: string;
  @IsOptional() @IsString() committedTo?: string;
  @IsOptional() @IsString() dueAt?: string;
  @IsOptional() @IsString() evidence?: string;
}
class FulfilDto { @IsOptional() @IsString() evidence?: string }
class TransitionDto { @IsString() to!: 'BROKEN' | 'CANCELLED' }
class RegisterItemDto {
  @IsString() kind!: RegisterKind;
  @IsString() statement!: string;
  @IsOptional() @IsString() detail?: string;
  @IsOptional() @IsString() owner?: string;
  @IsOptional() @IsString() dueAt?: string;
  @IsOptional() @IsInt() confidence?: number;
}
class ResolveRegisterDto {
  @IsString() to!: RegisterStatus;
  @IsOptional() @IsString() detail?: string;
}
class RiskDto {
  @IsString() title!: string;
  @IsOptional() @IsString() type?: RiskType;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() likelihood?: RiskLikelihood;
  @IsOptional() @IsString() impact?: RiskImpact;
  @IsOptional() @IsString() evidence?: string;
  @IsOptional() @IsString() owner?: string;
  @IsOptional() @IsString() mitigation?: string;
  @IsOptional() @IsString() targetDate?: string;
}
class UpdateRiskDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() type?: RiskType;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() likelihood?: RiskLikelihood;
  @IsOptional() @IsString() impact?: RiskImpact;
  @IsOptional() @IsString() evidence?: string;
  @IsOptional() @IsString() owner?: string;
  @IsOptional() @IsString() mitigation?: string;
  @IsOptional() @IsString() targetDate?: string;
}
class RiskStatusDto { @IsString() status!: RiskStatus }

// Opportunity execution depth API — the buying committee, our deal team, and the promises made.
@Controller('crm/opportunities')
export class OpportunityDepthController {
  constructor(
    private readonly depth: OpportunityDepthService,
    private readonly opportunities: OpportunityService,
    private readonly tenant: TenantContext,
  ) {}

  @Get(':id/depth')
  async depthFor(@Param('id', ParseUuidOr404Pipe) id: string): Promise<OpportunityDepth> {
    const tenantId = this.tenant.get().tenantId;
    // Load the opportunity so the health roll-up can assess buying-journey alignment
    // (our sales stage vs. the customer's buying stage). Tenant-mismatched → treated as absent.
    const opp = await this.opportunities.get(id);
    const stages = opp && opp.tenantId === tenantId ? { stage: opp.stage, buyingStage: opp.buyingStage } : null;
    return this.depth.depthFor(tenantId, id, stages);
  }

  // ── Stakeholders ──
  @Post(':id/stakeholders')
  addStakeholder(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: StakeholderDto): Promise<OpportunityStakeholder> {
    if (!dto?.contactName?.trim()) throw new BadRequestException('contactName is required');
    const ctx = this.tenant.get();
    return this.depth.addStakeholder({ tenantId: ctx.tenantId, opportunityId: id, actorId: ctx.actorId, ...dto });
  }
  @Patch(':id/stakeholders/:sid')
  updateStakeholder(@Param('sid', ParseUuidOr404Pipe) sid: string, @Body() dto: UpdateStakeholderDto): Promise<OpportunityStakeholder> {
    return this.depth.updateStakeholder(sid, dto);
  }
  @Delete(':id/stakeholders/:sid')
  async removeStakeholder(@Param('sid', ParseUuidOr404Pipe) sid: string): Promise<{ ok: true }> {
    await this.depth.removeStakeholder(sid);
    return { ok: true };
  }

  // ── Deal team ──
  @Post(':id/deal-team')
  addDealMember(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: DealMemberDto): Promise<OpportunityDealMember> {
    if (!dto?.userId?.trim()) throw new BadRequestException('userId is required');
    const ctx = this.tenant.get();
    return this.depth.addDealMember({ tenantId: ctx.tenantId, opportunityId: id, actorId: ctx.actorId, ...dto });
  }
  @Delete(':id/deal-team/:mid')
  async removeDealMember(@Param('mid', ParseUuidOr404Pipe) mid: string): Promise<{ ok: true }> {
    await this.depth.removeDealMember(mid);
    return { ok: true };
  }

  // ── Commitments ──
  @Post(':id/commitments')
  addCommitment(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: CommitmentDto): Promise<Commitment> {
    if (!dto?.description?.trim()) throw new BadRequestException('description is required');
    if (dto.direction !== 'OURS' && dto.direction !== 'THEIRS') throw new BadRequestException('direction must be OURS or THEIRS');
    const ctx = this.tenant.get();
    return this.depth.addCommitment({ tenantId: ctx.tenantId, relatedType: 'opportunity', relatedId: id, actorId: ctx.actorId, ...dto });
  }
  @Post(':id/commitments/:cid/fulfil')
  fulfil(@Param('cid', ParseUuidOr404Pipe) cid: string, @Body() dto: FulfilDto): Promise<Commitment> {
    return this.depth.fulfilCommitment(cid, dto?.evidence, this.tenant.get().actorId);
  }
  @Post(':id/commitments/:cid/transition')
  transition(@Param('cid', ParseUuidOr404Pipe) cid: string, @Body() dto: TransitionDto): Promise<Commitment> {
    if (dto?.to !== 'BROKEN' && dto?.to !== 'CANCELLED') throw new BadRequestException('to must be BROKEN or CANCELLED');
    return this.depth.transitionCommitment(cid, dto.to, this.tenant.get().actorId);
  }

  // ── Deal register (decisions / assumptions / open questions) ──
  @Post(':id/register')
  addRegisterItem(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: RegisterItemDto): Promise<DealRegisterItem> {
    if (!dto?.statement?.trim()) throw new BadRequestException('statement is required');
    if (dto.kind !== 'DECISION' && dto.kind !== 'ASSUMPTION' && dto.kind !== 'OPEN_QUESTION') {
      throw new BadRequestException('kind must be DECISION, ASSUMPTION or OPEN_QUESTION');
    }
    const ctx = this.tenant.get();
    return this.depth.addRegisterItem({ tenantId: ctx.tenantId, relatedType: 'opportunity', relatedId: id, actorId: ctx.actorId, ...dto });
  }
  @Post(':id/register/:rid/resolve')
  resolveRegisterItem(@Param('rid', ParseUuidOr404Pipe) rid: string, @Body() dto: ResolveRegisterDto): Promise<DealRegisterItem> {
    if (!dto?.to?.trim()) throw new BadRequestException('to (target status) is required');
    return this.depth.resolveRegisterItem(rid, dto.to, dto.detail, this.tenant.get().actorId);
  }

  // ── Risk register ──
  @Post(':id/risks')
  addRisk(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: RiskDto): Promise<OpportunityRisk> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.depth.addRisk({ tenantId: ctx.tenantId, opportunityId: id, actorId: ctx.actorId, ...dto });
  }
  @Patch(':id/risks/:kid')
  updateRisk(@Param('kid', ParseUuidOr404Pipe) kid: string, @Body() dto: UpdateRiskDto): Promise<OpportunityRisk> {
    return this.depth.updateRisk(kid, dto);
  }
  @Post(':id/risks/:kid/status')
  setRiskStatus(@Param('kid', ParseUuidOr404Pipe) kid: string, @Body() dto: RiskStatusDto): Promise<OpportunityRisk> {
    const valid = ['OPEN', 'MITIGATING', 'RESOLVED', 'ACCEPTED'];
    if (!valid.includes(dto?.status)) throw new BadRequestException(`status must be one of ${valid.join(', ')}`);
    return this.depth.setRiskStatus(kid, dto.status, this.tenant.get().actorId);
  }
}
