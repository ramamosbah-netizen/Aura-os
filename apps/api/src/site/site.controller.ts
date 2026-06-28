import { BadRequestException, Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import {
  type DailyReport,
  type DelayLog,
  type MaterialConsumption,
  SiteService,
} from '@aura/site';

interface CreateDailyReportDto {
  projectId: string;
  projectName?: string;
  date: string;
  workDescription: string;
  manpowerCount?: number;
  equipmentCount?: number;
}

interface CreateDelayLogDto {
  projectId: string;
  projectName?: string;
  date: string;
  delayType: DelayLog['delayType'];
  description: string;
  impactHours?: number;
}

interface CreateMaterialConsumptionDto {
  projectId: string;
  projectName?: string;
  date: string;
  itemId: string;
  itemName: string;
  quantityConsumed: number;
  unit: string;
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
}
