import { Body, Controller, Get, Header, Param, Post, StreamableFile } from '@nestjs/common';
import { AccessService, ParseUuidOr404Pipe, Permissions, TenantContext } from '@aura/core';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { TenderComplianceMatrixService } from './compliance-matrix.service';

class IssueComplianceMatrixDto {
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

/**
 * EST-12 — the Technical Compliance Matrix of a tender.
 *
 * ISSUING it is the Technical Manager's act (`engineering.compliance-matrix.issue`, reached only by
 * the role that holds `engineering.*`): the same authority that judges each supplier line. READING it
 * is the internal tender team's (`tendering.compliance-matrix.read`). It is filed in the tender's
 * internal dossier and is not part of the client submission.
 */
@Controller('tendering/tenders')
export class TenderComplianceMatrixController {
  constructor(
    private readonly matrices: TenderComplianceMatrixService,
    private readonly access: AccessService,
    private readonly tenant: TenantContext,
  ) {}

  /** The live matrix and its issued revisions — and whether THIS reader may issue, decided here. */
  @Permissions('tendering.compliance-matrix.read')
  @Get(':id/compliance-matrix')
  async view(@Param('id', ParseUuidOr404Pipe) id: string) {
    const ctx = this.tenant.get();
    const canIssue = Boolean(ctx.actorId) && this.access.can(ctx.actorId!, {
      permission: 'engineering.compliance-matrix.issue',
      orgPath: [{ level: 'tenant', id: ctx.tenantId }, ...(ctx.companyId ? [{ level: 'company' as const, id: ctx.companyId }] : [])],
    }).allowed;
    return { ...(await this.matrices.view(id)), canIssue };
  }

  @Permissions('engineering.compliance-matrix.issue')
  @Post(':id/compliance-matrix/issue')
  issue(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: IssueComplianceMatrixDto) {
    return this.matrices.issue(id, dto?.reason ?? null);
  }

  @Permissions('tendering.compliance-matrix.read')
  @Get(':id/compliance-matrix/issues/:issueId/workbook')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  async workbook(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('issueId', ParseUuidOr404Pipe) issueId: string,
  ): Promise<StreamableFile> {
    const { fileName, bytes } = await this.matrices.workbook(id, issueId);
    return new StreamableFile(bytes, { disposition: `attachment; filename="${fileName}"` });
  }
}
