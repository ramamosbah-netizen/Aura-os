import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { TenantContext } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import {
  type HseIncident,
  type PermitToWork,
  type CapaAction,
  type ToolboxTalk,
  type RiskAssessment,
  type RiskLine,
  type RiskAssessmentStatus,
  type SafetyTrainingRecord,
  HseService,
} from '@aura/hse';

class ReportIncidentDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() projectName?: string;
  @IsString() date!: string;
  @IsString() severity!: HseIncident['severity'];
  @IsString() description!: string;
  @IsString() locationDetail!: string;
}

class RequestPermitDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() projectName?: string;
  @IsString() permitType!: PermitToWork['permitType'];
  @IsString() validFrom!: string;
  @IsString() validTo!: string;
  @IsString() description!: string;
}

class RaiseCapaDto {
  @IsString() projectId!: string;
  @IsOptional() @IsString() projectName?: string;
  @IsString() sourceType!: CapaAction['sourceType'];
  @IsOptional() @IsString() sourceId?: string;
  @IsString() actionRequired!: string;
  @IsOptional() @IsString() assignedTo?: string;
  @IsString() dueDate!: string;
}

class RecordSafetyTrainingDto {
  @IsString() workerName!: string;
  @IsString() workerId!: string;
  @IsString() inductionDate!: string;
  @IsOptional() @IsString() cardNumber?: string;
  @IsOptional() @IsString() cardExpiry?: string;
  @IsOptional() @IsArray() certifications?: string[];
}

@Controller('hse')
export class HseController {
  constructor(
    private readonly hseService: HseService,
    private readonly tenant: TenantContext,
  ) {}

  // ── Incidents ──────────────────────────────────────────────────────────────

  @Post('incidents')
  reportIncident(@Body() dto: ReportIncidentDto): Promise<HseIncident> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.date?.trim()) throw new BadRequestException('date is required');
    if (!dto?.severity?.trim()) throw new BadRequestException('severity is required');
    if (!dto?.description?.trim()) throw new BadRequestException('description is required');
    if (!dto?.locationDetail?.trim()) throw new BadRequestException('locationDetail is required');

    const validSeverities = ['near_miss', 'minor', 'major', 'fatal'];
    if (!validSeverities.includes(dto.severity)) {
      throw new BadRequestException(`severity must be one of: ${validSeverities.join(', ')}`);
    }

    const ctx = this.tenant.get();
    return this.hseService.reportIncident({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || undefined,
      projectId: dto.projectId,
      projectName: dto.projectName,
      date: dto.date,
      severity: dto.severity,
      description: dto.description,
      locationDetail: dto.locationDetail,
      createdBy: ctx.actorId || undefined,
    });
  }

  @Put('incidents/:id/close')
  closeIncident(@Param('id') id: string): Promise<HseIncident> {
    const ctx = this.tenant.get();
    return this.hseService.closeIncident(ctx.tenantId, ctx.actorId, id);
  }

  @Get('incidents')
  listIncidents(): Promise<HseIncident[]> {
    const ctx = this.tenant.get();
    return this.hseService.listIncidents(ctx.tenantId);
  }

  @Get('incidents/paged')
  pagedIncidents(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.hseService.listIncidentsPaged(this.tenant.get().tenantId, parsePageParams(limit, offset));
  }

  // ── Permits to Work ────────────────────────────────────────────────────────

  @Post('ptws')
  requestPermit(@Body() dto: RequestPermitDto): Promise<PermitToWork> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.permitType?.trim()) throw new BadRequestException('permitType is required');
    if (!dto?.validFrom?.trim()) throw new BadRequestException('validFrom is required');
    if (!dto?.validTo?.trim()) throw new BadRequestException('validTo is required');
    if (!dto?.description?.trim()) throw new BadRequestException('description is required');

    const validTypes = ['hot_work', 'confined_space', 'height_work', 'electrical', 'excavation'];
    if (!validTypes.includes(dto.permitType)) {
      throw new BadRequestException(`permitType must be one of: ${validTypes.join(', ')}`);
    }

    const ctx = this.tenant.get();
    return this.hseService.requestPermit({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || undefined,
      projectId: dto.projectId,
      projectName: dto.projectName,
      permitType: dto.permitType,
      validFrom: dto.validFrom,
      validTo: dto.validTo,
      description: dto.description,
      createdBy: ctx.actorId || undefined,
    });
  }

  @Put('ptws/:id/approve')
  approvePermit(@Param('id') id: string): Promise<PermitToWork> {
    const ctx = this.tenant.get();
    return this.hseService.approvePermit(ctx.tenantId, ctx.actorId, id);
  }

  @Get('ptws')
  listPermits(): Promise<PermitToWork[]> {
    const ctx = this.tenant.get();
    return this.hseService.listPermits(ctx.tenantId);
  }

  @Get('ptws/paged')
  pagedPermits(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.hseService.listPermitsPaged(this.tenant.get().tenantId, parsePageParams(limit, offset));
  }

  // ── Corrective Actions (CAPA) ──────────────────────────────────────────────

  @Post('capas')
  raiseCapa(@Body() dto: RaiseCapaDto): Promise<CapaAction> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.sourceType?.trim()) throw new BadRequestException('sourceType is required');
    if (!dto?.actionRequired?.trim()) throw new BadRequestException('actionRequired is required');
    if (!dto?.dueDate?.trim()) throw new BadRequestException('dueDate is required');

    const validSources = ['incident', 'audit', 'inspection'];
    if (!validSources.includes(dto.sourceType)) {
      throw new BadRequestException(`sourceType must be one of: ${validSources.join(', ')}`);
    }

    const ctx = this.tenant.get();
    return this.hseService.raiseCapa({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || undefined,
      projectId: dto.projectId,
      projectName: dto.projectName,
      sourceType: dto.sourceType,
      sourceId: dto.sourceId || undefined,
      actionRequired: dto.actionRequired,
      assignedTo: dto.assignedTo,
      dueDate: dto.dueDate,
      createdBy: ctx.actorId || undefined,
    });
  }

  @Put('capas/:id/complete')
  completeCapa(@Param('id') id: string): Promise<CapaAction> {
    const ctx = this.tenant.get();
    return this.hseService.completeCapa(ctx.tenantId, ctx.actorId, id);
  }

  @Get('capas')
  listCapas(): Promise<CapaAction[]> {
    const ctx = this.tenant.get();
    return this.hseService.listCapas(ctx.tenantId);
  }

  // ── Toolbox Talks ──────────────────────────────────────────────────────────

  @Post('toolbox-talks')
  async recordToolboxTalk(@Body() dto: { projectId: string; projectName?: string; topic: string; conductedBy: string; talkDate: string; attendeeCount: number; notes?: string }): Promise<ToolboxTalk> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.topic?.trim()) throw new BadRequestException('topic is required');
    if (!dto?.conductedBy?.trim()) throw new BadRequestException('conductedBy is required');
    if (!dto?.talkDate?.trim()) throw new BadRequestException('talkDate is required');
    const ctx = this.tenant.get();
    try {
      return await this.hseService.recordToolboxTalk({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId || null,
        projectId: dto.projectId,
        projectName: dto.projectName,
        topic: dto.topic,
        conductedBy: dto.conductedBy,
        talkDate: dto.talkDate,
        attendeeCount: Number(dto.attendeeCount),
        notes: dto.notes,
        createdBy: ctx.actorId || null,
      });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Get('toolbox-talks')
  listToolboxTalks(): Promise<ToolboxTalk[]> {
    const ctx = this.tenant.get();
    return this.hseService.listToolboxTalks(ctx.tenantId);
  }

  // ── Risk assessments (JSA) ──────────────────────────────────────────────────

  @Post('risk-assessments')
  createRiskAssessment(
    @Body() dto: { projectId: string; projectName?: string; reference: string; activity: string; assessor?: string; hazards: RiskLine[]; status?: RiskAssessmentStatus; reviewDate?: string },
  ): Promise<RiskAssessment> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.reference?.trim()) throw new BadRequestException('reference is required');
    if (!dto?.activity?.trim()) throw new BadRequestException('activity is required');
    if (!Array.isArray(dto?.hazards) || dto.hazards.length === 0) throw new BadRequestException('at least one hazard is required');
    const ctx = this.tenant.get();
    return this.hseService.createRiskAssessment({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId ?? undefined,
      projectId: dto.projectId,
      projectName: dto.projectName,
      reference: dto.reference,
      activity: dto.activity,
      assessor: dto.assessor,
      hazards: dto.hazards,
      status: dto.status,
      reviewDate: dto.reviewDate,
      createdBy: ctx.actorId ?? undefined,
    });
  }

  @Get('risk-assessments')
  listRiskAssessments(): Promise<RiskAssessment[]> {
    return this.hseService.listRiskAssessments(this.tenant.get().tenantId);
  }

  @Put('risk-assessments/:id/approve')
  async approveRiskAssessment(@Param('id') id: string): Promise<RiskAssessment> {
    try {
      return await this.hseService.approveRiskAssessment(this.tenant.get().tenantId, id);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  // ── Safety Training Matrix ──────────────────────────────────────────────────

  @Post('training')
  async recordSafetyTraining(@Body() dto: RecordSafetyTrainingDto): Promise<SafetyTrainingRecord> {
    if (!dto?.workerName?.trim()) throw new BadRequestException('workerName is required');
    if (!dto?.workerId?.trim()) throw new BadRequestException('workerId is required');
    if (!dto?.inductionDate?.trim()) throw new BadRequestException('inductionDate is required');

    const ctx = this.tenant.get();
    try {
      return await this.hseService.recordSafetyTraining({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId || null,
        workerName: dto.workerName,
        workerId: dto.workerId,
        inductionDate: dto.inductionDate,
        cardNumber: dto.cardNumber,
        cardExpiry: dto.cardExpiry,
        certifications: dto.certifications,
        createdBy: ctx.actorId || null,
      });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Get('training')
  listSafetyTraining(): Promise<SafetyTrainingRecord[]> {
    const ctx = this.tenant.get();
    return this.hseService.listSafetyTraining(ctx.tenantId);
  }

  @Get('training/worker/:workerId')
  getSafetyTrainingForWorker(@Param('workerId') workerId: string): Promise<SafetyTrainingRecord[]> {
    const ctx = this.tenant.get();
    return this.hseService.getSafetyTrainingForWorker(ctx.tenantId, workerId);
  }
}
