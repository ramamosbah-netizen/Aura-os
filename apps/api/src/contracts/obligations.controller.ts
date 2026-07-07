import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import { type ContractObligation, type ObligationStatus, type ObligationType, type ObligationParty, ObligationService } from '@aura/contracts';

/** Contract obligation-tracking API — deliverables/milestones/compliance with due-date reminders. */
@Controller('contracts/obligations')
export class ObligationsController {
  constructor(
    private readonly obligations: ObligationService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  create(
    @Body() dto: { contractId: string; contractTitle?: string; title: string; description?: string; obligationType?: ObligationType; responsibleParty?: ObligationParty; dueDate: string; notes?: string },
  ): Promise<ContractObligation> {
    if (!dto?.contractId) throw new BadRequestException('contractId is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    if (!dto?.dueDate) throw new BadRequestException('dueDate is required');
    const ctx = this.tenant.get();
    return this.obligations.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      contractId: dto.contractId,
      contractTitle: dto.contractTitle ?? null,
      title: dto.title,
      description: dto.description ?? null,
      obligationType: dto.obligationType,
      responsibleParty: dto.responsibleParty,
      dueDate: dto.dueDate,
      notes: dto.notes ?? null,
      createdBy: ctx.actorId,
    });
  }

  @Get()
  list(
    @Query('contractId') contractId?: string,
    @Query('status') status?: string,
  ): Promise<ContractObligation[]> {
    return this.obligations.list({ tenantId: this.tenant.get().tenantId, contractId, status, limit: 200 });
  }

  // literal routes before :id
  @Get('due-soon')
  dueSoon(@Query('withinDays') withinDays?: string): Promise<ContractObligation[]> {
    const d = withinDays ? Number(withinDays) : 14;
    return this.obligations.dueSoon(this.tenant.get().tenantId, Number.isFinite(d) ? d : 14);
  }

  @Get('paged')
  paged(
    @Query('contractId') contractId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.obligations.listPaged(
      { tenantId: this.tenant.get().tenantId, contractId, status },
      parsePageParams(limit, offset),
    );
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<ContractObligation> {
    const found = await this.obligations.get(id);
    if (!found) throw new NotFoundException(`obligation ${id} not found`);
    return found;
  }

  @Patch(':id/status')
  async changeStatus(@Param('id') id: string, @Body() dto: { status: ObligationStatus; on?: string }): Promise<ContractObligation> {
    if (!dto?.status) throw new BadRequestException('status is required');
    return await this.obligations.changeStatus(id, dto.status, dto.on);
  }
}
