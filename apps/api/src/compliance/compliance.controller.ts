import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { TenantContext } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import {
  COMPLIANCE_SCOPES,
  COVERAGE_MODES,
  CASE_STATUSES,
  DECISION_OUTCOMES,
  INSPECTION_OUTCOMES,
  ComplianceService,
  type ComplianceCase,
  type ComplianceCaseStatus,
  type ComplianceScope,
  type CoverageMode,
  type DecisionOutcome,
  type InspectionOutcome,
} from '@aura/compliance';

class RegisterAuthorityDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsString() jurisdiction!: string;
  @IsOptional() @IsString() portalUrl?: string;
}

class OpenCaseDto {
  @IsString() authorityCode!: string;
  @IsString() obligationCode!: string;
  @IsIn(COMPLIANCE_SCOPES as unknown as string[]) scope!: ComplianceScope;
  @IsString() subjectId!: string;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() system?: string;
  @IsOptional() @IsIn(COVERAGE_MODES as unknown as string[]) coverage?: CoverageMode;
  @IsOptional() deviceIds?: string[];
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() notes?: string;
}

class SubmitDto {
  @IsString() submittedAt!: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsInt() @Min(0) fee?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() notes?: string;
}

class ScheduleInspectionDto {
  @IsOptional() @IsString() requestedAt?: string;
  @IsOptional() @IsString() scheduledAt?: string;
}

class InspectionOutcomeDto {
  @IsIn(INSPECTION_OUTCOMES as unknown as string[]) outcome!: InspectionOutcome;
  @IsString() conductedAt!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() inspectorReference?: string;
  @IsOptional() @IsString() inspectionReference?: string;
  @IsOptional() @IsString() reinspectionDate?: string;
}

class DecideDto {
  @IsIn(DECISION_OUTCOMES as unknown as string[]) outcome!: DecisionOutcome;
  @IsString() decisionDate!: string;
  @IsOptional() @IsString() decisionBy?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() conditions?: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() submissionId?: string;
}

class IssueCertificateDto {
  @IsString() number!: string;
  @IsString() issuedAt!: string;
  @IsOptional() @IsString() expiresAt?: string;
  @IsOptional() @IsString() notes?: string;
}

class CaseStatusDto {
  @IsIn(CASE_STATUSES as unknown as string[]) status!: ComplianceCaseStatus;
}

/**
 * Compliance Core API (G-20 / ADR-0018).
 *
 * One surface for every authority. SIRA and DCD are rows in `/compliance/authorities`, not
 * separate endpoints — the test of the design is that adding Trakhees needs no code here.
 *
 * **Ships with zero seeded rules.** `/compliance/authorities` is empty until someone registers
 * one, and no obligation, fee or validity period is shipped: an un-sourced regulatory fact looks
 * authoritative and would be relied on by someone deciding whether a system may legally operate.
 *
 * Domain guards throw plain Errors classified by the global taxonomy (404 not-found,
 * 409 already/only-can, 400 required), so no 500 leaks.
 */
@Controller('compliance')
export class ComplianceController {
  constructor(
    private readonly service: ComplianceService,
    private readonly tenant: TenantContext,
  ) {}

  // ── Authorities ──────────────────────────────────────────────────────────────

  @Post('authorities')
  registerAuthority(@Body() dto: RegisterAuthorityDto) {
    if (!dto?.code?.trim()) throw new BadRequestException('code is required');
    if (!dto?.name?.trim()) throw new BadRequestException('name is required');
    if (!dto?.jurisdiction?.trim()) throw new BadRequestException('jurisdiction is required');
    return this.service.registerAuthority({
      tenantId: this.tenant.get().tenantId,
      code: dto.code,
      name: dto.name,
      jurisdiction: dto.jurisdiction,
      portalUrl: dto.portalUrl ?? null,
    });
  }

  @Get('authorities')
  listAuthorities() {
    return this.service.listAuthorities(this.tenant.get().tenantId);
  }

  // ── Cases ────────────────────────────────────────────────────────────────────

  @Post('cases')
  openCase(@Body() dto: OpenCaseDto): Promise<ComplianceCase> {
    if (!dto?.authorityCode?.trim()) throw new BadRequestException('authorityCode is required');
    if (!dto?.obligationCode?.trim()) throw new BadRequestException('obligationCode is required');
    if (!dto?.subjectId?.trim()) throw new BadRequestException('subjectId is required');
    const ctx = this.tenant.get();
    return this.service.openCase({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      authorityCode: dto.authorityCode,
      obligationCode: dto.obligationCode,
      scope: dto.scope,
      subjectId: dto.subjectId,
      projectId: dto.projectId ?? null,
      system: dto.system,
      coverage: dto.coverage,
      deviceIds: dto.deviceIds,
      reference: dto.reference ?? null,
      notes: dto.notes ?? null,
      createdBy: ctx.actorId,
    });
  }

  /** The compliance register: every case, filterable by authority, scope, subject, project or status. */
  @Get('cases')
  listCases(
    @Query('authorityCode') authorityCode?: string,
    @Query('scope') scope?: string,
    @Query('subjectId') subjectId?: string,
    @Query('projectId') projectId?: string,
    @Query('status') status?: string,
  ): Promise<ComplianceCase[]> {
    return this.service.listCases(this.tenant.get().tenantId, { authorityCode, scope, subjectId, projectId, status });
  }

  @Get('cases/paged')
  pagedCases(
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.listCasesPaged(this.tenant.get().tenantId, parsePageParams({ limit, offset }), { status });
  }

  /**
   * Certificates that have lapsed or are about to. Already-expired ones stay on the list —
   * operating on an expired approval is the most urgent item here, not the least.
   */
  @Get('renewals')
  renewals(@Query('asOf') asOf?: string, @Query('withinDays') withinDays?: string) {
    const on = asOf ?? new Date().toISOString().slice(0, 10);
    return this.service.renewalWatchlist(this.tenant.get().tenantId, on, Number(withinDays) || 90);
  }

  @Get('cases/:id')
  async getCase(@Param('id') id: string): Promise<ComplianceCase> {
    const found = await this.service.getCase(id, this.tenant.get().tenantId);
    if (!found) throw new NotFoundException(`compliance case ${id} not found`);
    return found;
  }

  @Put('cases/:id/status')
  changeStatus(@Param('id') id: string, @Body() dto: CaseStatusDto): Promise<ComplianceCase> {
    return this.service.changeCaseStatus(id, this.tenant.get().tenantId, dto.status);
  }

  // ── Submissions ──────────────────────────────────────────────────────────────

  /** Submit or resubmit. The attempt number is derived, so a resubmission never overwrites the first. */
  @Post('cases/:id/submissions')
  submit(@Param('id') id: string, @Body() dto: SubmitDto) {
    if (!dto?.submittedAt) throw new BadRequestException('submittedAt is required');
    const ctx = this.tenant.get();
    return this.service.submit(id, ctx.tenantId, { ...dto, submittedBy: ctx.actorId });
  }

  @Get('cases/:id/submissions')
  listSubmissions(@Param('id') id: string) {
    return this.service.listSubmissions(this.tenant.get().tenantId, id);
  }

  // ── Inspections (optional) ───────────────────────────────────────────────────

  @Post('cases/:id/inspections')
  scheduleInspection(@Param('id') id: string, @Body() dto: ScheduleInspectionDto) {
    return this.service.scheduleInspection(id, this.tenant.get().tenantId, dto ?? {});
  }

  @Put('inspections/:inspectionId/outcome')
  recordInspection(@Param('inspectionId') inspectionId: string, @Body() dto: InspectionOutcomeDto) {
    if (!dto?.conductedAt) throw new BadRequestException('conductedAt is required');
    return this.service.recordInspection(inspectionId, this.tenant.get().tenantId, dto.outcome, dto.conductedAt, dto);
  }

  @Get('cases/:id/inspections')
  listInspections(@Param('id') id: string) {
    return this.service.listInspections(this.tenant.get().tenantId, id);
  }

  // ── Decisions (append-only) ──────────────────────────────────────────────────

  @Post('cases/:id/decisions')
  decide(@Param('id') id: string, @Body() dto: DecideDto) {
    if (!dto?.decisionDate) throw new BadRequestException('decisionDate is required');
    return this.service.decide(id, this.tenant.get().tenantId, dto);
  }

  /** The decision history, oldest first — a rejection followed by an approval keeps both. */
  @Get('cases/:id/decisions')
  listDecisions(@Param('id') id: string) {
    return this.service.listDecisions(this.tenant.get().tenantId, id);
  }

  // ── Certificates (append-only series) ────────────────────────────────────────

  /** Issue, or renew: if a live certificate exists it is superseded rather than edited. */
  @Post('cases/:id/certificates')
  issueCertificate(@Param('id') id: string, @Body() dto: IssueCertificateDto) {
    if (!dto?.number?.trim()) throw new BadRequestException('number is required');
    if (!dto?.issuedAt) throw new BadRequestException('issuedAt is required');
    return this.service.issueCertificate(id, this.tenant.get().tenantId, dto);
  }

  @Get('cases/:id/certificates')
  listCertificates(@Param('id') id: string) {
    return this.service.listCertificates(this.tenant.get().tenantId, id);
  }
}
