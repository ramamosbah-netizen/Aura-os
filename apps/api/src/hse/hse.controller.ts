import { BadRequestException, Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import {
  type HseIncident,
  type PermitToWork,
  type CapaAction,
  HseService,
} from '@aura/hse';

interface ReportIncidentDto {
  projectId: string;
  projectName?: string;
  date: string;
  severity: HseIncident['severity'];
  description: string;
  locationDetail: string;
}

interface RequestPermitDto {
  projectId: string;
  projectName?: string;
  permitType: PermitToWork['permitType'];
  validFrom: string;
  validTo: string;
  description: string;
}

interface RaiseCapaDto {
  projectId: string;
  projectName?: string;
  sourceType: CapaAction['sourceType'];
  sourceId?: string;
  actionRequired: string;
  assignedTo?: string;
  dueDate: string;
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
}
