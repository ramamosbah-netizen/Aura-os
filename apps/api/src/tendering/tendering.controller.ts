import { BadRequestException, Body, Controller, Delete, Get, Headers, NotFoundException, Param, Patch, Post, Put, Query, UseInterceptors, UploadedFile } from '@nestjs/common';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { FileInterceptor } from '@nestjs/platform-express';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import { parsePageParams } from '@aura/shared';
import { type Tender, type TenderStatus, TenderService, type BOQ, type BOQItem, type TenderSubmission, type SubmissionMethod, SUBMISSION_METHODS, type TenderSource, TENDER_SOURCES, type TenderClarification, type ClarificationKind, CLARIFICATION_KINDS, ClarificationService, parseBoqRows, type BoqImportResult } from '@aura/tendering';
import { AccountService } from '@aura/crm';
import { accountSnapshotPatch, resolveAccountSnapshot } from '../common/account-snapshot';
import * as xlsx from 'xlsx';

class CreateTenderDto {
  @IsString() title!: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() accountId?: string | null;
  @IsOptional() @IsString() accountName?: string | null;
  @IsOptional() @IsString() status?: TenderStatus;
  @IsOptional() @IsString() source?: TenderSource;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsString() submissionDeadline?: string;
  @IsOptional() @IsString() sourceOpportunityId?: string;
}

class UpdateTenderDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() accountName?: string;
  @IsOptional() @IsString() source?: TenderSource;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsString() submissionDeadline?: string;
}

class CreateClarificationDto {
  @IsString() title!: string;
  @IsOptional() @IsString() kind?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsString() issuedAt?: string;
  @IsOptional() @IsString() responseDue?: string;
  @IsOptional() @IsString() deadlineExtendedTo?: string;
}

const assertSource = (source?: string): void => {
  if (source !== undefined && !TENDER_SOURCES.includes(source as TenderSource)) {
    throw new BadRequestException(`source must be one of: ${TENDER_SOURCES.join(', ')}`);
  }
};

class SubmitTenderDto {
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsString() portal?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() submittedAt?: string;
  @IsOptional() @IsString() addendaAcknowledged?: string;
  @IsOptional() @IsString() validUntil?: string;
  @IsOptional() @IsString() notes?: string;
}

/** Tendering API — stamps tenant/actor from context, delegates to TenderService. */
@Controller('tendering/tenders')
export class TenderingController {
  constructor(
    private readonly tenders: TenderService,
    private readonly clarifications: ClarificationService,
    private readonly accounts: AccountService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  async create(@Body() dto: CreateTenderDto, @Headers('idempotency-key') idempotencyKey?: string): Promise<Tender> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    assertSource(dto.source);
    const ctx = this.tenant.get();
    return this.tenders.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      title: dto.title,
      reference: dto.reference,
      accountId: dto.accountId ?? null,
      accountName: await resolveAccountSnapshot(this.accounts, dto.accountId, dto.accountName),
      status: dto.status,
      source: dto.source,
      value: dto.value,
      submissionDeadline: dto.submissionDeadline,
      sourceOpportunityId: dto.sourceOpportunityId,
      ownerId: ctx.actorId,
      createdBy: ctx.actorId,
    }, idempotencyKey);
  }

  /** PATCH /api/tendering/tenders/:id — update mutable fields (title, reference, value, account). */
  @Patch(':id')
  async update(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: UpdateTenderDto): Promise<Tender> {
    assertSource(dto.source);
    try {
      return await this.tenders.update(id, {
        title: dto.title,
        reference: dto.reference,
        source: dto.source,
        value: dto.value,
        accountId: dto.accountId,
        ...(await accountSnapshotPatch(this.accounts, dto.accountId, dto.accountName)),
        submissionDeadline: dto.submissionDeadline,
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('not found')) throw new NotFoundException(msg);
      throw new BadRequestException(msg);
    }
  }

  /**
   * PATCH /api/tendering/tenders/:id/status
   * Transition a tender's status. Setting status to 'won' triggers the deal chain:
   * tender.awarded → auto-create Contract.
   */
  @Patch(':id/status')
  async changeStatus(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: { status: TenderStatus },
  ): Promise<Tender> {
    if (!dto?.status) throw new BadRequestException('status is required');
    const found = await this.tenders.get(id);
    if (!found) throw new NotFoundException(`tender ${id} not found`);
    return this.tenders.changeStatus(id, dto.status);
  }

  /**
   * POST /api/tendering/tenders/:id/submit — T2: the `→ submitted` transition WITH its facts
   * (method, portal, reference, addenda acknowledged, validity). Same gate as the status route;
   * on an already-submitted tender this records a resubmission (a second record, not an edit).
   */
  @Post(':id/submit')
  async submit(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: SubmitTenderDto,
  ): Promise<{ tender: Tender; submission: TenderSubmission }> {
    if (dto.method !== undefined && !SUBMISSION_METHODS.includes(dto.method as SubmissionMethod)) {
      throw new BadRequestException(`method must be one of: ${SUBMISSION_METHODS.join(', ')}`);
    }
    const found = await this.tenders.get(id);
    if (!found) throw new NotFoundException(`tender ${id} not found`);
    const ctx = this.tenant.get();
    return this.tenders.submit(id, {
      method: (dto.method as SubmissionMethod) ?? null,
      portal: dto.portal ?? null,
      reference: dto.reference ?? null,
      submittedAt: dto.submittedAt ?? null,
      addendaAcknowledged: dto.addendaAcknowledged ?? null,
      validUntil: dto.validUntil ?? null,
      notes: dto.notes ?? null,
      submittedBy: ctx.actorId,
      createdBy: ctx.actorId,
    });
  }

  /** GET /api/tendering/tenders/:id/submissions — the submission records, latest first. */
  @Get(':id/submissions')
  async submissions(@Param('id', ParseUuidOr404Pipe) id: string): Promise<TenderSubmission[]> {
    const found = await this.tenders.get(id);
    if (!found) throw new NotFoundException(`tender ${id} not found`);
    return this.tenders.listSubmissions(this.tenant.get().tenantId, id);
  }

  /**
   * T4 — clarifications & addenda: the Q&A/change traffic on a tender. An addendum with
   * `deadlineExtendedTo` also moves the tender's submission deadline.
   */
  @Post(':id/clarifications')
  async addClarification(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: CreateClarificationDto,
  ): Promise<TenderClarification> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    if (dto.kind !== undefined && !CLARIFICATION_KINDS.includes(dto.kind as ClarificationKind)) {
      throw new BadRequestException(`kind must be one of: ${CLARIFICATION_KINDS.join(', ')}`);
    }
    const found = await this.tenders.get(id);
    if (!found) throw new NotFoundException(`tender ${id} not found`);
    const ctx = this.tenant.get();
    return this.clarifications.record({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      tenderId: id,
      kind: (dto.kind as ClarificationKind) ?? null,
      reference: dto.reference ?? null,
      title: dto.title,
      body: dto.body ?? null,
      issuedAt: dto.issuedAt ?? null,
      responseDue: dto.responseDue ?? null,
      deadlineExtendedTo: dto.deadlineExtendedTo ?? null,
      createdBy: ctx.actorId,
    });
  }

  /** The clarification/addendum trail, latest first. `?open=true` filters to unanswered. */
  @Get(':id/clarifications')
  async listClarifications(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Query('kind') kind?: string,
    @Query('open') open?: string,
  ): Promise<TenderClarification[]> {
    const found = await this.tenders.get(id);
    if (!found) throw new NotFoundException(`tender ${id} not found`);
    return this.clarifications.list({ tenantId: this.tenant.get().tenantId, tenderId: id, kind, open: open === 'true' });
  }

  /** Answer a clarification / acknowledge an addendum. */
  @Patch(':id/clarifications/:clarificationId/answer')
  async answerClarification(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('clarificationId', ParseUuidOr404Pipe) clarificationId: string,
    @Body() dto: { answer?: string },
  ): Promise<TenderClarification> {
    if (!dto?.answer?.trim()) throw new BadRequestException('answer is required');
    const ctx = this.tenant.get();
    try {
      return await this.clarifications.answer(ctx.tenantId, clarificationId, dto.answer, ctx.actorId);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('not found')) throw new NotFoundException(msg);
      throw e;
    }
  }

  @Get()
  list(
    @Query('status') status?: string,
    @Query('accountId') accountId?: string,
    @Query('source') source?: string,
  ): Promise<Tender[]> {
    return this.tenders.list({ status, accountId, source, limit: 100 });
  }

  @Get('paged')
  paged(
    @Query('status') status?: string,
    @Query('accountId') accountId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.tenders.listPaged(
      { tenantId: this.tenant.get().tenantId, status, accountId },
      parsePageParams(limit, offset),
    );
  }

  @Get(':id')
  async get(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Tender> {
    const found = await this.tenders.get(id);
    if (!found) throw new NotFoundException(`tender ${id} not found`);
    return found;
  }

  // ── BOQ & Cost Estimating ─────────────────────────────────────

  @Get(':id/boq')
  async getBOQ(@Param('id', ParseUuidOr404Pipe) id: string): Promise<{ boq: BOQ; items: BOQItem[] }> {
    const tender = await this.tenders.get(id);
    if (!tender) throw new NotFoundException(`tender ${id} not found`);
    const ctx = this.tenant.get();
    return this.tenders.getOrCreateBOQ(ctx.tenantId, ctx.companyId, id);
  }

  @Post(':id/boq/items')
  async addBOQItem(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: { boqId: string; itemCode: string; description: string; unit: string; quantity: number; rate: number; ifcGuid?: string },
  ): Promise<BOQItem> {
    if (!dto.boqId) throw new BadRequestException('boqId is required');
    if (!dto.itemCode?.trim()) throw new BadRequestException('itemCode is required');
    if (!dto.description?.trim()) throw new BadRequestException('description is required');
    if (!dto.unit?.trim()) throw new BadRequestException('unit is required');
    if (dto.quantity === undefined || dto.quantity < 0) throw new BadRequestException('quantity must be >= 0');
    if (dto.rate === undefined || dto.rate < 0) throw new BadRequestException('rate must be >= 0');

    const ctx = this.tenant.get();
    return this.tenders.addBOQItem(ctx.tenantId, ctx.companyId, dto.boqId, {
      itemCode: dto.itemCode,
      description: dto.description,
      unit: dto.unit,
      quantity: dto.quantity,
      rate: dto.rate,
      ifcGuid: dto.ifcGuid,
    });
  }

  @Put(':id/boq/items/:itemId')
  async updateBOQItem(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('itemId') itemId: string,
    @Body() dto: { itemCode?: string; description?: string; unit?: string; quantity?: number; rate?: number; ifcGuid?: string | null },
  ): Promise<BOQItem> {
    const ctx = this.tenant.get();
    return this.tenders.updateBOQItem(ctx.tenantId, itemId, dto);
  }

  @Delete(':id/boq/items/:itemId')
  async deleteBOQItem(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Param('itemId') itemId: string,
  ): Promise<void> {
    const ctx = this.tenant.get();
    return this.tenders.deleteBOQItem(ctx.tenantId, itemId);
  }

  /** JSON bulk import (the paste-text path). `mode: 'replace'` clears the existing BOQ first. */
  @Post(':id/boq/import')
  async importBOQ(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: { boqId: string; mode?: 'append' | 'replace'; items: Array<{ itemCode: string; description: string; unit: string; quantity: number; rate: number; ifcGuid?: string }> },
  ): Promise<{ items: BOQItem[]; replaced: number }> {
    if (!dto.boqId) throw new BadRequestException('boqId is required');
    if (!Array.isArray(dto.items) || dto.items.length === 0) throw new BadRequestException('items must be a non-empty array');
    if (dto.mode !== undefined && dto.mode !== 'append' && dto.mode !== 'replace') {
      throw new BadRequestException("mode must be 'append' or 'replace'");
    }

    const ctx = this.tenant.get();
    return this.tenders.importBOQItems(ctx.tenantId, ctx.companyId, dto.boqId, dto.items, { replace: dto.mode === 'replace' });
  }

  /**
   * T5 — Excel BOQ import. The workbook's first sheet is parsed by the domain parser
   * (header-row scan, synonym columns, cleaned numbers, per-row issues — see
   * `domain/boq-import.ts`). `dryRun=true` returns the parse WITHOUT importing (the preview);
   * `mode=replace` clears the existing BOQ first (each cleared item takes its build-up along).
   */
  @Post(':id/boq/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadBOQ(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body('boqId') boqId: string,
    @Body('mode') mode: string | undefined,
    @Body('dryRun') dryRun: string | undefined,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ): Promise<{ items: BOQItem[]; replaced: number; issues: BoqImportResult['issues']; headerRow: number } | (BoqImportResult & { dryRun: true })> {
    if (!file) throw new BadRequestException('file is required');
    if (!boqId) throw new BadRequestException('boqId is required');
    if (mode !== undefined && mode !== 'append' && mode !== 'replace') {
      throw new BadRequestException("mode must be 'append' or 'replace'");
    }

    let parsed: BoqImportResult;
    try {
      const workbook = xlsx.read(file.buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error('the workbook has no sheets — an .xlsx file with at least one sheet is required');
      const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
      parsed = parseBoqRows(rows);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Failed to parse the Excel file');
    }
    if (parsed.items.length === 0) {
      throw new BadRequestException(
        `no importable rows found (header on row ${parsed.headerRow}; ${parsed.issues.length} issue(s): ${parsed.issues.slice(0, 3).map((i) => `row ${i.row} — ${i.problem}`).join('; ')})`,
      );
    }

    if (dryRun === 'true') return { ...parsed, dryRun: true };

    const ctx = this.tenant.get();
    const result = await this.tenders.importBOQItems(ctx.tenantId, ctx.companyId, boqId, parsed.items, { replace: mode === 'replace' });
    return { ...result, issues: parsed.issues, headerRow: parsed.headerRow };
  }
}
