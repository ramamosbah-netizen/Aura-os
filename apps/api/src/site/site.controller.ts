import { BadRequestException, Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { TenantContext } from '@aura/core';
import {
  type DailyReport,
  type DelayLog,
  type MaterialConsumption,
  type SiteInstruction,
  type LabourAllocation,
  type TradeManHours,
  SiteService,
} from '@aura/site';

class CreateDailyReportDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() projectName?: string;
  @IsString() date!: string;
  @IsString() workDescription!: string;
  @IsOptional() @IsNumber() manpowerCount?: number;
  @IsOptional() @IsNumber() equipmentCount?: number;
}

class CreateDelayLogDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() projectName?: string;
  @IsString() date!: string;
  @IsString() delayType!: DelayLog['delayType'];
  @IsString() description!: string;
  @IsOptional() @IsNumber() impactHours?: number;
}

class CreateMaterialConsumptionDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() projectName?: string;
  @IsString() date!: string;
  @IsString() itemId!: string;
  @IsString() itemName!: string;
  @IsNumber() quantityConsumed!: number;
  @IsString() unit!: string;
}

@Controller('site')
export class SiteController {
  constructor(
    private readonly siteService: SiteService,
    private readonly tenant: TenantContext,
  ) {}

  // ── Daily Reports ──────────────────────────────────────────────────────────

  @Post('daily-reports')
  createDailyReport(@Body() dto: CreateDailyReportDto): Promise<DailyReport> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.date?.trim()) throw new BadRequestException('date is required');
    if (!dto?.workDescription?.trim()) throw new BadRequestException('workDescription is required');

    const ctx = this.tenant.get();
    return this.siteService.createDailyReport({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || undefined,
      projectId: dto.projectId,
      projectName: dto.projectName,
      date: dto.date,
      workDescription: dto.workDescription,
      manpowerCount: dto.manpowerCount,
      equipmentCount: dto.equipmentCount,
      createdBy: ctx.actorId || undefined,
    });
  }

  @Put('daily-reports/:id/submit')
  submitDailyReport(@Param('id') id: string): Promise<DailyReport> {
    const ctx = this.tenant.get();
    return this.siteService.submitDailyReport(ctx.tenantId, ctx.actorId, id);
  }

  @Get('daily-reports')
  listDailyReports(): Promise<DailyReport[]> {
    const ctx = this.tenant.get();
    return this.siteService.listDailyReports(ctx.tenantId);
  }

  // ── Delay Logs ─────────────────────────────────────────────────────────────

  @Post('delay-logs')
  createDelayLog(@Body() dto: CreateDelayLogDto): Promise<DelayLog> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.date?.trim()) throw new BadRequestException('date is required');
    if (!dto?.delayType?.trim()) throw new BadRequestException('delayType is required');
    if (!dto?.description?.trim()) throw new BadRequestException('description is required');

    const validTypes = ['weather', 'material', 'access', 'drawings', 'other'];
    if (!validTypes.includes(dto.delayType)) {
      throw new BadRequestException(`delayType must be one of: ${validTypes.join(', ')}`);
    }

    const ctx = this.tenant.get();
    return this.siteService.createDelayLog({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || undefined,
      projectId: dto.projectId,
      projectName: dto.projectName,
      date: dto.date,
      delayType: dto.delayType,
      description: dto.description,
      impactHours: dto.impactHours,
      createdBy: ctx.actorId || undefined,
    });
  }

  @Put('delay-logs/:id/resolve')
  resolveDelayLog(@Param('id') id: string): Promise<DelayLog> {
    const ctx = this.tenant.get();
    return this.siteService.resolveDelayLog(ctx.tenantId, ctx.actorId, id);
  }

  @Get('delay-logs')
  listDelayLogs(): Promise<DelayLog[]> {
    const ctx = this.tenant.get();
    return this.siteService.listDelayLogs(ctx.tenantId);
  }

  // ── Material Consumption ───────────────────────────────────────────────────

  @Post('material-consumption')
  createMaterialConsumption(@Body() dto: CreateMaterialConsumptionDto): Promise<MaterialConsumption> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.date?.trim()) throw new BadRequestException('date is required');
    if (!dto?.itemId?.trim()) throw new BadRequestException('itemId is required');
    if (!dto?.itemName?.trim()) throw new BadRequestException('itemName is required');
    if (typeof dto?.quantityConsumed !== 'number' || dto.quantityConsumed <= 0) {
      throw new BadRequestException('quantityConsumed must be a positive number');
    }
    if (!dto?.unit?.trim()) throw new BadRequestException('unit is required');

    const ctx = this.tenant.get();
    return this.siteService.createMaterialConsumption({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || undefined,
      projectId: dto.projectId,
      projectName: dto.projectName,
      date: dto.date,
      itemId: dto.itemId,
      itemName: dto.itemName,
      quantityConsumed: dto.quantityConsumed,
      unit: dto.unit,
      createdBy: ctx.actorId || undefined,
    });
  }

  @Get('material-consumption')
  listMaterialConsumption(): Promise<MaterialConsumption[]> {
    const ctx = this.tenant.get();
    return this.siteService.listMaterialConsumption(ctx.tenantId);
  }

  // ── Site Instructions ──────────────────────────────────────────────────────

  @Post('instructions')
  async issueInstruction(@Body() dto: { projectId: string; projectName?: string; reference: string; issuedBy: string; date: string; instruction: string; costImplication?: boolean; timeImplication?: boolean }): Promise<SiteInstruction> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.reference?.trim()) throw new BadRequestException('reference is required');
    if (!dto?.issuedBy?.trim()) throw new BadRequestException('issuedBy is required');
    if (!dto?.instruction?.trim()) throw new BadRequestException('instruction is required');
    if (!dto?.date?.trim()) throw new BadRequestException('date is required');
    const ctx = this.tenant.get();
    return await this.siteService.issueSiteInstruction({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || null,
      projectId: dto.projectId,
      projectName: dto.projectName,
      reference: dto.reference,
      issuedBy: dto.issuedBy,
      date: dto.date,
      instruction: dto.instruction,
      costImplication: dto.costImplication,
      timeImplication: dto.timeImplication,
      createdBy: ctx.actorId || null,
    });
  }

  @Get('instructions')
  listInstructions(): Promise<SiteInstruction[]> {
    return this.siteService.listSiteInstructions(this.tenant.get().tenantId);
  }

  @Put('instructions/:id/acknowledge')
  async acknowledgeInstruction(@Param('id') id: string): Promise<SiteInstruction> {
    return await this.siteService.acknowledgeSiteInstruction(this.tenant.get().tenantId, id);
  }

  @Put('instructions/:id/close')
  async closeInstruction(@Param('id') id: string): Promise<SiteInstruction> {
    return await this.siteService.closeSiteInstruction(this.tenant.get().tenantId, id);
  }

  // ── Labour allocation (manpower by trade) ───────────────────────────────────

  @Post('labour')
  createLabour(
    @Body() dto: { projectId: string; projectName?: string; date: string; trade: string; headcount: number; hours: number; subcontractorName?: string; notes?: string },
  ): Promise<LabourAllocation> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.trade?.trim()) throw new BadRequestException('trade is required');
    if (!dto?.date) throw new BadRequestException('date is required');
    const ctx = this.tenant.get();
    return this.siteService.createLabourAllocation({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId ?? undefined,
      projectId: dto.projectId,
      projectName: dto.projectName,
      date: dto.date,
      trade: dto.trade,
      headcount: Number(dto.headcount) || 0,
      hours: Number(dto.hours) || 0,
      subcontractorName: dto.subcontractorName,
      notes: dto.notes,
      createdBy: ctx.actorId ?? undefined,
    });
  }

  @Get('labour')
  listLabour(): Promise<LabourAllocation[]> {
    return this.siteService.listLabourAllocations(this.tenant.get().tenantId);
  }

  @Get('labour/by-trade/:projectId')
  labourByTrade(@Param('projectId') projectId: string): Promise<TradeManHours[]> {
    return this.siteService.labourByTrade(this.tenant.get().tenantId, projectId);
  }
}
