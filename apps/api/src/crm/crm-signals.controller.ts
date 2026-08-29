import { BadRequestException, Body, Controller, Get, Header, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { Permissions, TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import {
  parsePageParams, SIGNAL_OPEN_STATUSES, SIGNAL_SOURCES, SIGNAL_TYPES, SIGNAL_DISMISS_REASON_CODES, toCsv,
  type Signal, type SignalSource, type SignalStatus, type SignalType,
} from '@aura/shared';
import { SignalService, type PromoteSignalResult } from '@aura/crm';

class CreateSignalDto {
  @IsString() title!: string;
  @IsIn(SIGNAL_SOURCES as readonly string[]) source!: SignalSource;
  @IsIn(SIGNAL_TYPES as readonly string[]) type!: SignalType;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() accountName?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() contextType?: string;
  @IsOptional() @IsString() contextId?: string;
  @IsOptional() @IsString() evidence?: string;
  @IsOptional() @IsInt() confidence?: number;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() dedupeKey?: string;
}
class AdvanceSignalDto {
  @IsString() to!: 'REVIEWING' | 'RESEARCHING';
}
class DismissSignalDto {
  @IsOptional() @IsIn(SIGNAL_DISMISS_REASON_CODES as readonly string[]) reasonCode?: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsBoolean() asDuplicate?: boolean;
}

@Controller('crm/signals')
export class CrmSignalsController {
  constructor(
    private readonly signals: SignalService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  @Permissions('crm.signal.create')
  create(@Body() dto: CreateSignalDto): Promise<Signal> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    if (!dto?.source) throw new BadRequestException('source is required');
    if (!dto?.type) throw new BadRequestException('type is required');
    const ctx = this.tenant.get();
    return this.signals.create({ tenantId: ctx.tenantId, companyId: ctx.companyId, actorId: ctx.actorId, ...dto });
  }

  @Get()
  @Permissions('crm.signal.read')
  list(@Query('status') status?: SignalStatus, @Query('source') source?: string): Promise<Signal[]> {
    const ctx = this.tenant.get();
    return this.signals.list({ tenantId: ctx.tenantId, status, source, limit: 200 }, ctx.actorId);
  }

  @Get('paged')
  @Permissions('crm.signal.read')
  paged(@Query('status') status?: SignalStatus, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const ctx = this.tenant.get();
    return this.signals.listPaged({ tenantId: ctx.tenantId, status }, parsePageParams(limit, offset), ctx.actorId);
  }

  /** Opportunity Radar — paged, server-filtered rows plus page-independent summary. */
  @Get('radar')
  @Permissions('crm.signal.read')
  async radar(
    @Query('status') status?: SignalStatus,
    @Query('source') source?: string,
    @Query('type') type?: SignalType,
    @Query('ownerId') ownerId?: string,
    @Query('accountId') accountId?: string,
    @Query('contextType') contextType?: string,
    @Query('contextId') contextId?: string,
    @Query('search') search?: string,
    @Query('detectedFrom') detectedFrom?: string,
    @Query('detectedTo') detectedTo?: string,
    @Query('confidenceMin') confidenceMin?: string,
    @Query('confidenceMax') confidenceMax?: string,
    @Query('sort') sort?: 'detectedAt' | 'confidence' | 'title',
    @Query('direction') direction?: 'asc' | 'desc',
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<unknown> {
    const ctx = this.tenant.get();
    const tenantId = ctx.tenantId;
    const parsedMin = confidenceMin === undefined ? undefined : Number(confidenceMin);
    const parsedMax = confidenceMax === undefined ? undefined : Number(confidenceMax);
    const filter = { tenantId, status, statuses: status ? undefined : [...SIGNAL_OPEN_STATUSES], source, type, ownerId, accountId,
      contextType, contextId, search, detectedFrom, detectedTo,
      confidenceMin: Number.isFinite(parsedMin) ? parsedMin : undefined, confidenceMax: Number.isFinite(parsedMax) ? parsedMax : undefined,
      sort, direction };
    const [page, summary] = await Promise.all([
      this.signals.listPaged(filter, parsePageParams(limit, offset), ctx.actorId),
      this.signals.summary({ tenantId, source, type, ownerId, accountId, contextType, contextId, search, detectedFrom, detectedTo,
        confidenceMin: Number.isFinite(parsedMin) ? parsedMin : undefined, confidenceMax: Number.isFinite(parsedMax) ? parsedMax : undefined }, ctx.actorId),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      counts: { open: summary.open, new: summary.new, reviewing: summary.reviewing, researching: summary.researching, promoted: summary.promoted, dismissed: summary.dismissed },
      bySource: summary.bySource,
      byType: summary.byType,
      summary,
      page: { ...page, items: page.items.map(this.radarRow) },
      signals: page.items.map(this.radarRow),
    };
  }

  /** Focused page-independent read contract for dashboard consumers that do not need rows. */
  @Get('radar/summary')
  @Permissions('crm.signal.read')
  async radarSummary(
    @Query('status') status?: SignalStatus, @Query('source') source?: string, @Query('type') type?: SignalType,
    @Query('ownerId') ownerId?: string, @Query('accountId') accountId?: string, @Query('contextType') contextType?: string,
    @Query('contextId') contextId?: string, @Query('search') search?: string, @Query('detectedFrom') detectedFrom?: string,
    @Query('detectedTo') detectedTo?: string, @Query('confidenceMin') confidenceMin?: string, @Query('confidenceMax') confidenceMax?: string,
  ): Promise<unknown> {
    const ctx = this.tenant.get(); const min = confidenceMin === undefined ? undefined : Number(confidenceMin); const max = confidenceMax === undefined ? undefined : Number(confidenceMax);
    return { generatedAt: new Date().toISOString(), summary: await this.signals.summary({ tenantId: ctx.tenantId, status, source, type, ownerId, accountId, contextType, contextId, search, detectedFrom, detectedTo,
      confidenceMin: Number.isFinite(min) ? min : undefined, confidenceMax: Number.isFinite(max) ? max : undefined }, ctx.actorId) };
  }

  @Get('radar/export')
  @Permissions('crm.signal.read')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="sales-radar.csv"')
  async radarExport(
    @Query('status') status?: SignalStatus, @Query('source') source?: string, @Query('type') type?: SignalType,
    @Query('ownerId') ownerId?: string, @Query('accountId') accountId?: string, @Query('contextType') contextType?: string,
    @Query('contextId') contextId?: string, @Query('search') search?: string, @Query('detectedFrom') detectedFrom?: string,
    @Query('detectedTo') detectedTo?: string, @Query('confidenceMin') confidenceMin?: string, @Query('confidenceMax') confidenceMax?: string,
  ): Promise<string> {
    const ctx = this.tenant.get(); const min = confidenceMin === undefined ? undefined : Number(confidenceMin); const max = confidenceMax === undefined ? undefined : Number(confidenceMax);
    const rows = await this.signals.exportAll({ tenantId: ctx.tenantId, status, statuses: status ? undefined : [...SIGNAL_OPEN_STATUSES], source, type, ownerId, accountId, contextType, contextId, search, detectedFrom, detectedTo,
      confidenceMin: Number.isFinite(min) ? min : undefined, confidenceMax: Number.isFinite(max) ? max : undefined }, ctx.actorId);
    return toCsv(rows.map((s) => ({ id: s.id, title: s.title, account: s.accountName ?? '', type: s.type, source: s.source, status: s.status, confidence: s.confidence, ownerId: s.ownerId ?? '', detectedAt: s.detectedAt, promotedLeadId: s.promotedLeadId ?? '' })),
      ['id', 'title', 'account', 'type', 'source', 'status', 'confidence', 'ownerId', 'detectedAt', 'promotedLeadId']);
  }

  private readonly radarRow = (s: Signal) => ({
    id: s.id, title: s.title, source: s.source, type: s.type, status: s.status, accountId: s.accountId, accountName: s.accountName,
    confidence: s.confidence, detectedAt: s.detectedAt, ownerId: s.ownerId, evidence: s.evidence, description: s.description,
    contextType: s.contextType, contextId: s.contextId, reviewedBy: s.reviewedBy, reviewedAt: s.reviewedAt,
    dismissalReasonCode: s.dismissalReasonCode, dismissalNote: s.dismissalNote, promotedLeadId: s.promotedLeadId,
  });

  @Get(':id')
  @Permissions('crm.signal.read')
  async get(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Signal> {
    const found = await this.signals.get(id, this.tenant.get().actorId);
    if (!found) throw new NotFoundException(`Signal ${id} not found`);
    return found;
  }

  @Patch(':id/advance')
  @Permissions('crm.signal.update')
  advance(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: AdvanceSignalDto): Promise<Signal> {
    if (dto?.to !== 'REVIEWING' && dto?.to !== 'RESEARCHING') throw new BadRequestException('to must be REVIEWING or RESEARCHING');
    return this.signals.advance(id, dto.to, this.tenant.get().actorId);
  }

  /** Promote to a Lead (transactional, idempotent, lineage-preserving). */
  @Post(':id/promote')
  @Permissions('crm.signal.update', 'crm.lead.create')
  promote(@Param('id', ParseUuidOr404Pipe) id: string): Promise<PromoteSignalResult> {
    return this.signals.promote(id, this.tenant.get().actorId);
  }

  @Get(':id/promotion-preview')
  @Permissions('crm.signal.update', 'crm.lead.create')
  promotionPreview(@Param('id', ParseUuidOr404Pipe) id: string) {
    return this.signals.promotionPreview(id, this.tenant.get().actorId);
  }

  @Post(':id/dismiss')
  @Permissions('crm.signal.update')
  dismiss(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: DismissSignalDto): Promise<Signal> {
    return this.signals.dismiss(id, dto?.reasonCode ?? dto?.reason ?? '', dto?.asDuplicate ?? false, this.tenant.get().actorId, dto?.note);
  }
}
