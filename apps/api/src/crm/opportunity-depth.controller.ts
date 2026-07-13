import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import {
  OpportunityDepthService, type OpportunityDepth,
} from '@aura/crm';
import type {
  OpportunityStakeholder, OpportunityDealMember, Commitment,
  StakeholderRole, InfluenceLevel, Sentiment, DealTeamRole, CommitmentDirection,
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

// Opportunity execution depth API — the buying committee, our deal team, and the promises made.
@Controller('crm/opportunities')
export class OpportunityDepthController {
  constructor(
    private readonly depth: OpportunityDepthService,
    private readonly tenant: TenantContext,
  ) {}

  @Get(':id/depth')
  depthFor(@Param('id', ParseUuidOr404Pipe) id: string): Promise<OpportunityDepth> {
    return this.depth.depthFor(this.tenant.get().tenantId, id);
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
}
