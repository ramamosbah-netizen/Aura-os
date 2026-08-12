import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { TenantContext } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import {
  type DailyReport,
  type SiteLabourEntry,
  type SitePlantEntry,
  type SiteProgressEntry,
  type SiteDelayEntry,
  type SiteEvidence,
  type PlantStatus,
  type DelayCategory,
  type EvidenceCategory,
  type DelayLog,
  type MaterialConsumption,
  type SiteInstruction,
  type LabourAllocation,
  type TradeManHours,
  type PlantUsage,
  type InstallationRecord,
  SiteService,
} from '@aura/site';

class CreateDailyReportDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() projectName?: string;
  @IsOptional() @IsString() reportNumber?: string;
  @IsString() date!: string;
  @IsString() workDescription!: string;
  @IsOptional() @IsString() siteConditions?: string;
  @IsOptional() @IsString() safetyNotes?: string;
  @IsOptional() @IsNumber() manpowerCount?: number;
  @IsOptional() @IsNumber() equipmentCount?: number;
}

class RejectReportDto {
  @IsString() reason!: string;
}
class LabourLineDto {
  @IsString() trade!: string;
  @IsOptional() @IsString() contractor?: string;
  @IsNumber() headcount!: number;
  @IsNumber() hours!: number;
  @IsOptional() @IsString() notes?: string;
}
class PlantLineDto {
  @IsString() equipmentType!: string;
  @IsOptional() @IsString() equipmentId?: string;
  @IsOptional() @IsNumber() quantity?: number;
  @IsOptional() @IsNumber() operatingHours?: number;
  @IsOptional() @IsString() status?: PlantStatus;
  @IsOptional() @IsString() notes?: string;
}
class ProgressLineDto {
  @IsOptional() @IsString() activityId?: string;
  @IsOptional() @IsString() boqItemId?: string;
  @IsString() description!: string;
  @IsOptional() @IsNumber() plannedQty?: number;
  @IsNumber() installedQty!: number;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() notes?: string;
}
class DelayLineDto {
  @IsString() category!: DelayCategory;
  @IsString() description!: string;
  @IsOptional() @IsNumber() durationHours?: number;
  @IsOptional() @IsString() responsibleParty?: string;
  @IsOptional() @IsString() impact?: string;
  @IsOptional() @IsString() mitigation?: string;
}
class EvidenceDto {
  @IsString() fileId!: string;
  @IsOptional() @IsString() capturedAt?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() category?: EvidenceCategory;
  @IsOptional() @IsString() hash?: string;
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
      reportNumber: dto.reportNumber,
      workDescription: dto.workDescription,
      siteConditions: dto.siteConditions,
      safetyNotes: dto.safetyNotes,
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

  // ── Daily-report workflow commands (state machine; POST verbs, never PATCH status) ──

  @Post('daily-reports/:id/start-review')
  startReviewReport(@Param('id') id: string): Promise<DailyReport> {
    const ctx = this.tenant.get();
    return this.siteService.startReviewReport(ctx.tenantId, ctx.actorId, id);
  }

  @Post('daily-reports/:id/approve')
  approveReport(@Param('id') id: string): Promise<DailyReport> {
    const ctx = this.tenant.get();
    return this.siteService.approveDailyReport(ctx.tenantId, ctx.actorId, id);
  }

  @Post('daily-reports/:id/reject')
  rejectReport(@Param('id') id: string, @Body() dto: RejectReportDto): Promise<DailyReport> {
    if (!dto?.reason?.trim()) throw new BadRequestException('a rejection reason is required');
    const ctx = this.tenant.get();
    return this.siteService.rejectDailyReport(ctx.tenantId, ctx.actorId, id, dto.reason);
  }

  // ── Report line-items (draft-only) ──────────────────────────────────────────

  @Post('daily-reports/:id/labour')
  addLabour(@Param('id') id: string, @Body() dto: LabourLineDto): Promise<SiteLabourEntry> {
    if (!dto?.trade?.trim()) throw new BadRequestException('trade is required');
    const ctx = this.tenant.get();
    return this.siteService.addReportLabour(ctx.tenantId, ctx.actorId, id, dto);
  }

  @Post('daily-reports/:id/plant')
  addPlant(@Param('id') id: string, @Body() dto: PlantLineDto): Promise<SitePlantEntry> {
    if (!dto?.equipmentType?.trim()) throw new BadRequestException('equipmentType is required');
    const ctx = this.tenant.get();
    return this.siteService.addReportPlant(ctx.tenantId, ctx.actorId, id, dto);
  }

  @Post('daily-reports/:id/progress')
  addProgress(@Param('id') id: string, @Body() dto: ProgressLineDto): Promise<SiteProgressEntry> {
    if (!dto?.description?.trim()) throw new BadRequestException('description is required');
    const ctx = this.tenant.get();
    return this.siteService.addReportProgress(ctx.tenantId, ctx.actorId, id, dto);
  }

  @Post('daily-reports/:id/delays')
  addDelay(@Param('id') id: string, @Body() dto: DelayLineDto): Promise<SiteDelayEntry> {
    if (!dto?.description?.trim()) throw new BadRequestException('description is required');
    const ctx = this.tenant.get();
    return this.siteService.addReportDelay(ctx.tenantId, ctx.actorId, id, dto);
  }

  @Post('daily-reports/:id/evidence')
  addEvidence(@Param('id') id: string, @Body() dto: EvidenceDto): Promise<SiteEvidence> {
    if (!dto?.fileId?.trim()) throw new BadRequestException('fileId is required');
    const ctx = this.tenant.get();
    return this.siteService.addReportEvidence(ctx.tenantId, ctx.actorId, id, dto);
  }

  @Get('daily-reports/paged')
  listDailyReportsPaged(
    @Query('projectId') projectId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.siteService.listDailyReportsPaged(
      { tenantId: this.tenant.get().tenantId, projectId, status },
      parsePageParams(limit, offset),
    );
  }

  @Get('daily-reports')
  listDailyReports(): Promise<DailyReport[]> {
    const ctx = this.tenant.get();
    return this.siteService.listDailyReports(ctx.tenantId);
  }

  /** The Site Daily Report 360: the report with all its line-items. */
  @Get('daily-reports/:id')
  async getDailyReport(@Param('id') id: string) {
    const ctx = this.tenant.get();
    const detail = await this.siteService.getDailyReportDetail(ctx.tenantId, id);
    if (!detail) throw new Error(`daily report ${id} not found`); // taxonomy → 404
    return detail;
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

  @Get('delay-logs/paged')
  listDelayLogsPaged(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.siteService.listDelayLogsPaged(this.tenant.get().tenantId, parsePageParams(limit, offset));
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

  @Get('material-consumption/paged')
  listMaterialConsumptionPaged(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.siteService.listMaterialConsumptionPaged(this.tenant.get().tenantId, parsePageParams(limit, offset));
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

  @Get('instructions/paged')
  listInstructionsPaged(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.siteService.listSiteInstructionsPaged(this.tenant.get().tenantId, parsePageParams(limit, offset));
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
    @Body() dto: { projectId: string; projectName?: string; date: string; trade: string; headcount: number; hours: number; costRate?: number; cbsNodeId?: string | null; subcontractorName?: string; notes?: string },
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
      costRate: dto.costRate !== undefined ? Number(dto.costRate) : undefined,
      cbsNodeId: dto.cbsNodeId ?? null,
      subcontractorName: dto.subcontractorName,
      notes: dto.notes,
      createdBy: ctx.actorId ?? undefined,
    });
  }

  @Get('labour/paged')
  listLabourPaged(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.siteService.listLabourAllocationsPaged(this.tenant.get().tenantId, parsePageParams(limit, offset));
  }

  @Get('labour')
  listLabour(): Promise<LabourAllocation[]> {
    return this.siteService.listLabourAllocations(this.tenant.get().tenantId);
  }

  @Get('labour/by-trade/:projectId')
  labourByTrade(@Param('projectId') projectId: string): Promise<TradeManHours[]> {
    return this.siteService.labourByTrade(this.tenant.get().tenantId, projectId);
  }

  // ── Plant / equipment usage ─────────────────────────────────────────────────

  @Post('plant')
  createPlant(
    @Body() dto: { projectId: string; projectName?: string; cbsNodeId?: string | null; date: string; equipment: string; hours: number; rate?: number; notes?: string },
  ): Promise<PlantUsage> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.equipment?.trim()) throw new BadRequestException('equipment is required');
    if (!dto?.date) throw new BadRequestException('date is required');
    const ctx = this.tenant.get();
    return this.siteService.createPlantUsage({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId ?? undefined,
      projectId: dto.projectId,
      projectName: dto.projectName,
      cbsNodeId: dto.cbsNodeId ?? null,
      date: dto.date,
      equipment: dto.equipment,
      hours: Number(dto.hours) || 0,
      rate: dto.rate !== undefined ? Number(dto.rate) : undefined,
      notes: dto.notes,
      createdBy: ctx.actorId ?? undefined,
    });
  }

  @Get('plant')
  listPlant(): Promise<PlantUsage[]> {
    return this.siteService.listPlantUsage(this.tenant.get().tenantId);
  }

  // ── Installation records (INSTALLED quantity against a BOQ item) ─────────────

  @Post('installations')
  createInstallation(
    @Body() dto: { projectId: string; projectName?: string; boqItemId: string; cbsNodeId?: string | null; date: string; description: string; quantity: number; unit?: string; notes?: string },
  ): Promise<InstallationRecord> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.boqItemId?.trim()) throw new BadRequestException('boqItemId is required');
    if (!dto?.description?.trim()) throw new BadRequestException('description is required');
    if (!dto?.date) throw new BadRequestException('date is required');
    if (!(Number(dto.quantity) > 0)) throw new BadRequestException('quantity must be positive');
    const ctx = this.tenant.get();
    return this.siteService.createInstallation({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId ?? undefined,
      projectId: dto.projectId,
      projectName: dto.projectName,
      boqItemId: dto.boqItemId,
      cbsNodeId: dto.cbsNodeId ?? null,
      date: dto.date,
      description: dto.description,
      quantity: Number(dto.quantity),
      unit: dto.unit ?? null,
      notes: dto.notes,
      createdBy: ctx.actorId ?? undefined,
    });
  }

  @Get('installations')
  listInstallations(): Promise<InstallationRecord[]> {
    return this.siteService.listInstallations(this.tenant.get().tenantId);
  }
}
