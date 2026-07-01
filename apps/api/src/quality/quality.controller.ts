import { BadRequestException, Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import {
  type Ncr,
  type InspectionRequest,
  type Snag,
  type Itp,
  type NewItpPoint,
  type PointResult,
  type MaterialApproval,
  type MarDecision,
  type Calibration,
  type AuditSchedule,
  type ChecklistItem,
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

  // ── Inspection & Test Plans (ITP) ──────────────────────────────────────────

  @Post('itps')
  async createItp(@Body() dto: { projectId: string; projectName?: string; reference: string; title: string; discipline?: string; points: NewItpPoint[] }): Promise<Itp> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.reference?.trim()) throw new BadRequestException('reference is required');
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    if (!Array.isArray(dto?.points) || dto.points.length === 0) throw new BadRequestException('at least one inspection point is required');
    const ctx = this.tenant.get();
    try {
      return await this.qualityService.createItp({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId || null,
        projectId: dto.projectId,
        projectName: dto.projectName,
        reference: dto.reference,
        title: dto.title,
        discipline: dto.discipline,
        points: dto.points,
        createdBy: ctx.actorId || null,
      });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Get('itps')
  listItps(): Promise<Itp[]> {
    return this.qualityService.listItps(this.tenant.get().tenantId);
  }

  @Put('itps/:id/activate')
  async activateItp(@Param('id') id: string): Promise<Itp> {
    try {
      return await this.qualityService.activateItp(this.tenant.get().tenantId, id);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Put('itps/:id/points/:index')
  async recordItpPoint(@Param('id') id: string, @Param('index') index: string, @Body() dto: { result: PointResult }): Promise<Itp> {
    if (dto?.result !== 'passed' && dto?.result !== 'failed') throw new BadRequestException("result must be 'passed' or 'failed'");
    try {
      return await this.qualityService.recordItpPoint(this.tenant.get().tenantId, id, Number(index), dto.result);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Put('itps/:id/close')
  async closeItp(@Param('id') id: string): Promise<Itp> {
    try {
      return await this.qualityService.closeItp(this.tenant.get().tenantId, id);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  // ── Material Approval Requests (MAR) ───────────────────────────────────────

  @Post('material-approvals')
  async createMar(@Body() dto: { projectId: string; projectName?: string; reference: string; materialName: string; manufacturer?: string; supplier?: string; specification?: string; discipline?: string }): Promise<MaterialApproval> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.reference?.trim()) throw new BadRequestException('reference is required');
    if (!dto?.materialName?.trim()) throw new BadRequestException('materialName is required');
    const ctx = this.tenant.get();
    try {
      return await this.qualityService.createMaterialApproval({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId || null,
        projectId: dto.projectId,
        projectName: dto.projectName,
        reference: dto.reference,
        materialName: dto.materialName,
        manufacturer: dto.manufacturer,
        supplier: dto.supplier,
        specification: dto.specification,
        discipline: dto.discipline,
        createdBy: ctx.actorId || null,
      });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Get('material-approvals')
  listMars(): Promise<MaterialApproval[]> {
    return this.qualityService.listMaterialApprovals(this.tenant.get().tenantId);
  }

  @Put('material-approvals/:id/submit')
  async submitMar(@Param('id') id: string): Promise<MaterialApproval> {
    try {
      return await this.qualityService.submitMaterialApproval(this.tenant.get().tenantId, id);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Put('material-approvals/:id/review')
  async reviewMar(@Param('id') id: string, @Body() dto: { decision: MarDecision; comments?: string }): Promise<MaterialApproval> {
    const ctx = this.tenant.get();
    try {
      return await this.qualityService.reviewMaterialApproval(ctx.tenantId, id, dto?.decision, ctx.actorId || null, dto?.comments);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Put('material-approvals/:id/revise')
  async reviseMar(@Param('id') id: string): Promise<MaterialApproval> {
    try {
      return await this.qualityService.reviseMaterialApproval(this.tenant.get().tenantId, id);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  // ── Equipment calibration ──────────────────────────────────────────────────

  @Post('calibrations')
  async recordCalibration(
    @Body() dto: { projectId?: string; projectName?: string; equipmentName: string; equipmentSerial: string; instrumentType?: string; calibrationDate: string; dueDate: string; certificateNumber?: string; calibratedBy?: string; notes?: string },
  ): Promise<Calibration> {
    if (!dto?.equipmentName?.trim()) throw new BadRequestException('equipmentName is required');
    if (!dto?.equipmentSerial?.trim()) throw new BadRequestException('equipmentSerial is required');
    if (!dto?.calibrationDate || !dto?.dueDate) throw new BadRequestException('calibrationDate and dueDate are required');
    const ctx = this.tenant.get();
    try {
      return await this.qualityService.recordCalibration({
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        projectId: dto.projectId ?? null,
        projectName: dto.projectName ?? null,
        equipmentName: dto.equipmentName,
        equipmentSerial: dto.equipmentSerial,
        instrumentType: dto.instrumentType ?? null,
        calibrationDate: dto.calibrationDate,
        dueDate: dto.dueDate,
        certificateNumber: dto.certificateNumber ?? null,
        calibratedBy: dto.calibratedBy ?? null,
        notes: dto.notes ?? null,
        createdBy: ctx.actorId,
      });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Get('calibrations')
  listCalibrations(): Promise<Calibration[]> {
    return this.qualityService.listCalibrations(this.tenant.get().tenantId);
  }

  @Get('calibrations/:id')
  async getCalibration(@Param('id') id: string): Promise<Calibration> {
    const found = await this.qualityService.getCalibration(this.tenant.get().tenantId, id);
    if (!found) throw new BadRequestException(`calibration ${id} not found`);
    return found;
  }

  // ── ISO Checklists & Audits ───────────────────────────────────────────────

  @Post('audits')
  async scheduleAudit(
    @Body()
    dto: {
      projectId: string;
      projectName?: string;
      auditNumber: string;
      auditType: string;
      scheduledDate: string;
      auditorName: string;
      checklist?: ChecklistItem[];
    },
  ): Promise<AuditSchedule> {
    if (!dto?.projectId) throw new BadRequestException('projectId is required');
    if (!dto?.auditNumber?.trim()) throw new BadRequestException('auditNumber is required');
    if (!dto?.auditType?.trim()) throw new BadRequestException('auditType is required');
    if (!dto?.scheduledDate) throw new BadRequestException('scheduledDate is required');
    if (!dto?.auditorName?.trim()) throw new BadRequestException('auditorName is required');

    const ctx = this.tenant.get();
    try {
      return await this.qualityService.scheduleAudit(ctx.actorId, {
        tenantId: ctx.tenantId,
        companyId: ctx.companyId,
        projectId: dto.projectId,
        projectName: dto.projectName,
        auditNumber: dto.auditNumber,
        auditType: dto.auditType,
        scheduledDate: dto.scheduledDate,
        auditorName: dto.auditorName,
        checklist: dto.checklist,
      });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Get('audits')
  listAudits(): Promise<AuditSchedule[]> {
    return this.qualityService.listAudits(this.tenant.get().tenantId);
  }

  @Get('audits/:id')
  async getAudit(@Param('id') id: string): Promise<AuditSchedule> {
    const found = await this.qualityService.getAudit(this.tenant.get().tenantId, id);
    if (!found) throw new BadRequestException(`audit ${id} not found`);
    return found;
  }

  @Put('audits/:id/checklist')
  async updateAuditChecklist(
    @Param('id') id: string,
    @Body() dto: { checklist: ChecklistItem[]; status?: AuditSchedule['status'] },
  ): Promise<AuditSchedule> {
    if (!Array.isArray(dto?.checklist)) throw new BadRequestException('checklist must be an array');
    try {
      return await this.qualityService.updateAuditChecklist(
        this.tenant.get().tenantId,
        id,
        dto.checklist,
        dto.status,
      );
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  @Post('audits/:id/checklist/:itemIndex/ncr')
  async generateNcrFromFailedCheck(
    @Param('id') id: string,
    @Param('itemIndex') itemIndex: string,
  ): Promise<Ncr> {
    const ctx = this.tenant.get();
    try {
      return await this.qualityService.generateNcrFromFailedCheck(
        ctx.tenantId,
        ctx.actorId,
        id,
        Number(itemIndex),
      );
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }
}
