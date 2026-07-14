import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { IsArray, IsNumber, IsOptional, IsString } from 'class-validator';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import {
  PreAwardService, type Requirement, type SolutionScope,
  type RequirementPriority, type NewScopeLine, type Quotation,
} from '@aura/crm';

class RequirementDto {
  @IsString() title!: string;
  @IsOptional() @IsString() detail?: string;
  @IsOptional() @IsString() priority?: RequirementPriority;
}
class ScopeLineDto {
  @IsOptional() @IsString() discipline?: string;
  @IsString() description!: string;
  @IsOptional() @IsString() unit?: string;
  @IsNumber() quantity!: number;
  @IsOptional() @IsNumber() unitPrice?: number;
}
class CreateScopeDto {
  @IsString() title!: string;
  @IsOptional() @IsArray() lines?: ScopeLineDto[];
}
class ScopeLinesDto {
  @IsArray() lines!: ScopeLineDto[];
}
class GenerateQuotationDto {
  @IsString() customerName!: string;
  @IsOptional() @IsString() accountId?: string;
}

// Pre-award discovery API (R4) — requirements + solution scopes on an opportunity, and the
// direct-sale bridge (approved scope → governed Quotation). Nested under the opportunity.
@Controller('crm/opportunities')
export class PreAwardController {
  constructor(
    private readonly preAward: PreAwardService,
    private readonly tenant: TenantContext,
  ) {}

  // ── Requirements ──
  @Post(':id/requirements')
  addRequirement(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: RequirementDto): Promise<Requirement> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.preAward.addRequirement({ tenantId: ctx.tenantId, opportunityId: id, actorId: ctx.actorId, ...dto });
  }
  @Get(':id/requirements')
  listRequirements(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Requirement[]> {
    return this.preAward.listRequirements(this.tenant.get().tenantId, id);
  }

  // ── Solution scopes ──
  @Post(':id/scopes')
  createScope(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: CreateScopeDto): Promise<SolutionScope> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.preAward.createScope({ tenantId: ctx.tenantId, opportunityId: id, title: dto.title, lines: dto.lines as NewScopeLine[] | undefined, actorId: ctx.actorId });
  }
  @Get(':id/scopes')
  listScopes(@Param('id', ParseUuidOr404Pipe) id: string): Promise<SolutionScope[]> {
    return this.preAward.listScopes(this.tenant.get().tenantId, id);
  }

  @Patch(':id/scopes/:sid/lines')
  setScopeLines(@Param('sid', ParseUuidOr404Pipe) sid: string, @Body() dto: ScopeLinesDto): Promise<SolutionScope> {
    if (!Array.isArray(dto?.lines)) throw new BadRequestException('lines[] is required');
    return this.preAward.setScopeLines(sid, dto.lines as NewScopeLine[]);
  }

  @Post(':id/scopes/:sid/approve')
  approveScope(@Param('sid', ParseUuidOr404Pipe) sid: string): Promise<SolutionScope> {
    return this.preAward.approveScope(sid, this.tenant.get().actorId);
  }

  @Post(':id/scopes/:sid/generate-quotation')
  generateQuotation(@Param('sid', ParseUuidOr404Pipe) sid: string, @Body() dto: GenerateQuotationDto): Promise<Quotation> {
    if (!dto?.customerName?.trim()) throw new BadRequestException('customerName is required');
    return this.preAward.generateQuotation(sid, { customerName: dto.customerName, accountId: dto.accountId ?? null, actorId: this.tenant.get().actorId });
  }
}
