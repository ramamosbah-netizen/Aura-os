import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { IsArray, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { Permissions, TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import {
  PreAwardService, type Requirement, type SolutionScope,
  type RequirementPriority, type RequirementStatus, type NewScopeLine, type Quotation,
} from '@aura/crm';

class RequirementDto {
  @IsString() title!: string;
  @IsOptional() @IsString() detail?: string;
  @IsOptional() @IsString() priority?: RequirementPriority;
}
class UpdateRequirementDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() detail?: string;
  @IsOptional() @IsString() priority?: RequirementPriority;
  @IsOptional() @IsIn(['open', 'met', 'dropped']) status?: RequirementStatus;
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

/**
 * Pre-award discovery API (R4) — requirements + solution scopes on an opportunity, and the
 * direct-sale bridge (approved scope → governed Quotation). Nested under the opportunity.
 *
 * EVERY ROUTE HERE DECLARES THE PERMISSION THAT GOVERNS IT (J1-07, the first SEC-01 stage-3 fix).
 * Until now none did. `PermissionsGuard` therefore derived one from the path — `crm.opportunity.scopes`,
 * `crm.opportunity.approve`, `crm.opportunity.generate-quotation` — and NO SHIPPED ROLE NAMES ANY OF
 * THEM, so the routes were reachable only by a wildcard holder. Executed against the running API, that
 * meant one administrator could write a scope, sign off their own scope, and turn it into a customer
 * offer, while the Technical Manager — who holds `crm.scope.approve`, the permission that exists
 * precisely for this — was refused on all three.
 *
 * The names below are the vocabulary the roles ALREADY SPEAK. Nothing was invented to fit the routes;
 * the routes were made to say what the roles have been saying all along, which is why the separation
 * falls out for free: Pre-Sales writes the scope (`crm.scope.create/update`) and cannot approve it,
 * the Technical Manager approves it (`crm.scope.approve`) and cannot write one, and neither of them
 * can turn it into an offer (`crm.quotation.create`, which sits with Sales and the Estimator).
 */
@Controller('crm/opportunities')
export class PreAwardController {
  constructor(
    private readonly preAward: PreAwardService,
    private readonly tenant: TenantContext,
  ) {}

  // ── Requirements ──
  @Post(':id/requirements')
  @Permissions('crm.requirement.create')
  addRequirement(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: RequirementDto): Promise<Requirement> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.preAward.addRequirement({ tenantId: ctx.tenantId, opportunityId: id, actorId: ctx.actorId, ...dto });
  }
  @Get(':id/requirements')
  @Permissions('crm.requirement.read')
  listRequirements(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Requirement[]> {
    return this.preAward.listRequirements(this.tenant.get().tenantId, id);
  }
  /**
   * Correct a captured requirement, or retire it with `status: 'dropped'` — the existing semantics,
   * not a row deletion. Scope Assist skips dropped requirements, so retiring one changes the evidence
   * fingerprint and marks live proposals stale rather than rewriting what a scope was grounded on.
   */
  @Patch(':id/requirements/:reqId')
  @Permissions('crm.requirement.update')
  updateRequirement(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('reqId', ParseUuidOr404Pipe) reqId: string,
    @Body() dto: UpdateRequirementDto,
  ): Promise<Requirement> {
    const ctx = this.tenant.get();
    return this.preAward.updateRequirement({ tenantId: ctx.tenantId, opportunityId: id, requirementId: reqId, actorId: ctx.actorId, ...dto });
  }

  // ── Solution scopes ──
  @Post(':id/scopes')
  @Permissions('crm.scope.create')
  createScope(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: CreateScopeDto): Promise<SolutionScope> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    const ctx = this.tenant.get();
    return this.preAward.createScope({ tenantId: ctx.tenantId, opportunityId: id, title: dto.title, lines: dto.lines as NewScopeLine[] | undefined, actorId: ctx.actorId });
  }
  @Get(':id/scopes')
  @Permissions('crm.scope.read')
  listScopes(@Param('id', ParseUuidOr404Pipe) id: string): Promise<SolutionScope[]> {
    return this.preAward.listScopes(this.tenant.get().tenantId, id);
  }

  @Patch(':id/scopes/:sid/lines')
  @Permissions('crm.scope.update')
  setScopeLines(@Param('sid', ParseUuidOr404Pipe) sid: string, @Body() dto: ScopeLinesDto): Promise<SolutionScope> {
    if (!Array.isArray(dto?.lines)) throw new BadRequestException('lines[] is required');
    return this.preAward.setScopeLines(sid, dto.lines as NewScopeLine[]);
  }

  /**
   * SIGN-OFF. `crm.scope.approve` is held by exactly one shipped role, the Technical Manager, whose
   * description already says it: "independently reviews pre-award studies". Pre-Sales, who writes the
   * scope, does not hold it — so authority and the domain rule agree instead of one covering for the
   * other. The domain still refuses a self-approval on top of this, because a person can hold both
   * roles and the permission alone cannot see that.
   */
  @Post(':id/scopes/:sid/approve')
  @Permissions('crm.scope.approve')
  approveScope(@Param('sid', ParseUuidOr404Pipe) sid: string): Promise<SolutionScope> {
    return this.preAward.approveScope(sid, this.tenant.get().actorId);
  }

  /**
   * The moment a scope becomes a CUSTOMER-FACING OFFER — so it is governed as quotation authorship,
   * not as an opportunity edit. Neither Pre-Sales nor the Technical Manager holds `crm.quotation.create`.
   */
  @Post(':id/scopes/:sid/generate-quotation')
  @Permissions('crm.quotation.create')
  generateQuotation(@Param('sid', ParseUuidOr404Pipe) sid: string, @Body() dto: GenerateQuotationDto): Promise<Quotation> {
    if (!dto?.customerName?.trim()) throw new BadRequestException('customerName is required');
    return this.preAward.generateQuotation(sid, { customerName: dto.customerName, accountId: dto.accountId ?? null, actorId: this.tenant.get().actorId });
  }
}
