import { BadRequestException, Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import {
  type Ncr,
  type InspectionRequest,
  type Snag,
  QualityService,
} from '@aura/quality';

interface RaiseNcrDto {
  projectId: string;
  projectName?: string;
  ncrNumber: string;
  description: string;
  rootCause?: string;
  proposedCorrection?: string;
  severity: Ncr['severity'];
  assignedTo?: string;
}

interface UpdateNcrStatusDto {
  status: Ncr['status'];
  rootCause?: string;
  proposedCorrection?: string;
}

interface RequestInspectionDto {
  projectId: string;
  projectName?: string;
  irNumber: string;
  discipline: InspectionRequest['discipline'];
  locationDetail: string;
  inspectionDate: string;
}

interface ResolveInspectionDto {
  status: 'approved' | 'rejected';
  comments?: string;
}

interface LogSnagDto {
  projectId: string;
  projectName?: string;
  description: string;
  locationDetail: string;
  severity: Snag['severity'];
  assignedTo?: string;
}

@Controller('quality')
export class QualityController {
  constructor(
    private readonly qualityService: QualityService,
    private readonly tenant: TenantContext,
  ) {}

  // ── NCR (Non-Conformance Reports) ──────────────────────────────────────────

  @Post('ncrs')
  raiseNcr(@Body() dto: RaiseNcrDto): Promise<Ncr> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.ncrNumber?.trim()) throw new BadRequestException('ncrNumber is required');
    if (!dto?.description?.trim()) throw new BadRequestException('description is required');
    if (!dto?.severity?.trim()) throw new BadRequestException('severity is required');

    const validSeverities = ['minor', 'major'];
    if (!validSeverities.includes(dto.severity)) {
      throw new BadRequestException(`severity must be one of: ${validSeverities.join(', ')}`);
    }

    const ctx = this.tenant.get();
    return this.qualityService.raiseNcr({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || undefined,
      projectId: dto.projectId,
      projectName: dto.projectName,
      ncrNumber: dto.ncrNumber,
      description: dto.description,
      rootCause: dto.rootCause,
      proposedCorrection: dto.proposedCorrection,
      severity: dto.severity,
      assignedTo: dto.assignedTo,
      raisedBy: ctx.actorId || undefined,
    });
  }

  @Put('ncrs/:id/status')
  updateNcrStatus(
    @Param('id') id: string,
    @Body() dto: UpdateNcrStatusDto,
  ): Promise<Ncr> {
    if (!dto?.status?.trim()) throw new BadRequestException('status is required');

    const validStatuses = ['raised', 'corrected', 'closed'];
    if (!validStatuses.includes(dto.status)) {
      throw new BadRequestException(`status must be one of: ${validStatuses.join(', ')}`);
    }

    const ctx = this.tenant.get();
    return this.qualityService.updateNcrStatus(
      ctx.tenantId,
      ctx.actorId,
      id,
      dto.status,
      dto.rootCause,
      dto.proposedCorrection,
    );
  }

  @Get('ncrs')
  listNcrs(): Promise<Ncr[]> {
    const ctx = this.tenant.get();
    return this.qualityService.listNcrs(ctx.tenantId);
  }

  // ── Inspection Requests (IR) ────────────────────────────────────────────────

  @Post('irs')
  requestInspection(@Body() dto: RequestInspectionDto): Promise<InspectionRequest> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.irNumber?.trim()) throw new BadRequestException('irNumber is required');
    if (!dto?.discipline?.trim()) throw new BadRequestException('discipline is required');
    if (!dto?.locationDetail?.trim()) throw new BadRequestException('locationDetail is required');
    if (!dto?.inspectionDate?.trim()) throw new BadRequestException('inspectionDate is required');

    const validDisciplines = ['civil', 'mechanical', 'electrical', 'plumbing'];
    if (!validDisciplines.includes(dto.discipline)) {
      throw new BadRequestException(`discipline must be one of: ${validDisciplines.join(', ')}`);
    }

    const ctx = this.tenant.get();
    return this.qualityService.requestInspection({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || undefined,
      projectId: dto.projectId,
      projectName: dto.projectName,
      irNumber: dto.irNumber,
      discipline: dto.discipline,
      locationDetail: dto.locationDetail,
      inspectionDate: dto.inspectionDate,
      inspectedBy: ctx.actorId || undefined,
    });
  }

  @Put('irs/:id/resolve')
  resolveInspection(
    @Param('id') id: string,
    @Body() dto: ResolveInspectionDto,
  ): Promise<InspectionRequest> {
    if (!dto?.status?.trim()) throw new BadRequestException('status is required');

    const validStatuses = ['approved', 'rejected'];
    if (!validStatuses.includes(dto.status)) {
      throw new BadRequestException(`status must be one of: ${validStatuses.join(', ')}`);
    }

    const ctx = this.tenant.get();
    return this.qualityService.resolveInspection(
      ctx.tenantId,
      ctx.actorId,
      id,
      dto.status,
      dto.comments,
    );
  }

  @Get('irs')
  listInspections(): Promise<InspectionRequest[]> {
    const ctx = this.tenant.get();
    return this.qualityService.listInspections(ctx.tenantId);
  }

  // ── Snagging / Punch List ──────────────────────────────────────────────────

  @Post('snags')
  logSnag(@Body() dto: LogSnagDto): Promise<Snag> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.description?.trim()) throw new BadRequestException('description is required');
    if (!dto?.locationDetail?.trim()) throw new BadRequestException('locationDetail is required');
    if (!dto?.severity?.trim()) throw new BadRequestException('severity is required');

    const validSeverities = ['low', 'medium', 'high'];
    if (!validSeverities.includes(dto.severity)) {
      throw new BadRequestException(`severity must be one of: ${validSeverities.join(', ')}`);
    }

    const ctx = this.tenant.get();
    return this.qualityService.logSnag({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId || undefined,
      projectId: dto.projectId,
      projectName: dto.projectName,
      description: dto.description,
      locationDetail: dto.locationDetail,
      severity: dto.severity,
      assignedTo: dto.assignedTo,
      createdBy: ctx.actorId || undefined,
    });
  }

  @Put('snags/:id/resolve')
  resolveSnag(@Param('id') id: string): Promise<Snag> {
    const ctx = this.tenant.get();
    return this.qualityService.resolveSnag(ctx.tenantId, ctx.actorId, id, 'resolved');
  }

  @Put('snags/:id/close')
  closeSnag(@Param('id') id: string): Promise<Snag> {
    const ctx = this.tenant.get();
    return this.qualityService.resolveSnag(ctx.tenantId, ctx.actorId, id, 'closed');
  }

  @Get('snags')
  listSnags(): Promise<Snag[]> {
    const ctx = this.tenant.get();
    return this.qualityService.listSnags(ctx.tenantId);
  }
}
