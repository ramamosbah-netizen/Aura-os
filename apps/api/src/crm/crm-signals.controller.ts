import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import {
  parsePageParams, SIGNAL_OPEN_STATUSES,
  type Signal, type SignalSource, type SignalStatus, type SignalType,
} from '@aura/shared';
import { SignalService, type PromoteSignalResult } from '@aura/crm';

class CreateSignalDto {
  @IsString() title!: string;
  @IsString() source!: SignalSource;
  @IsString() type!: SignalType;
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
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsBoolean() asDuplicate?: boolean;
}

@Controller('crm/signals')
export class CrmSignalsController {
  constructor(
    private readonly signals: SignalService,
    private readonly tenant: TenantContext,
  ) {}

  @Post()
  create(@Body() dto: CreateSignalDto): Promise<Signal> {
    if (!dto?.title?.trim()) throw new BadRequestException('title is required');
    if (!dto?.source) throw new BadRequestException('source is required');
    if (!dto?.type) throw new BadRequestException('type is required');
    const ctx = this.tenant.get();
    return this.signals.create({ tenantId: ctx.tenantId, companyId: ctx.companyId, actorId: ctx.actorId, ...dto });
  }

  @Get()
  list(@Query('status') status?: SignalStatus, @Query('source') source?: string): Promise<Signal[]> {
    return this.signals.list({ tenantId: this.tenant.get().tenantId, status, source, limit: 200 });
  }

  @Get('paged')
  paged(@Query('status') status?: SignalStatus, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.signals.listPaged({ tenantId: this.tenant.get().tenantId, status }, parsePageParams(limit, offset));
  }

  /** Opportunity Radar — the triage cockpit: open signals + counts by status / source / type. */
  @Get('radar')
  async radar(): Promise<unknown> {
    const tenantId = this.tenant.get().tenantId;
    const all = await this.signals.list({ tenantId, limit: 5000 });
    const openSet = new Set(SIGNAL_OPEN_STATUSES as readonly string[]);
    const open = all.filter((s) => openSet.has(s.status));

    const tally = <K extends string>(rows: Signal[], key: (s: Signal) => K): Array<{ key: K; count: number }> => {
      const m = new Map<K, number>();
      for (const s of rows) m.set(key(s), (m.get(key(s)) ?? 0) + 1);
      return [...m.entries()].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count);
    };

    const counts = {
      open: open.length,
      new: all.filter((s) => s.status === 'NEW').length,
      reviewing: all.filter((s) => s.status === 'REVIEWING').length,
      researching: all.filter((s) => s.status === 'RESEARCHING').length,
      promoted: all.filter((s) => s.status === 'PROMOTED').length,
      dismissed: all.filter((s) => s.status === 'DISMISSED' || s.status === 'DUPLICATE').length,
    };

    const signals = [...open]
      .sort((a, b) => b.confidence - a.confidence || (a.detectedAt < b.detectedAt ? 1 : -1))
      .map((s) => ({
        id: s.id, title: s.title, source: s.source, type: s.type, status: s.status,
        accountId: s.accountId, accountName: s.accountName, confidence: s.confidence,
        detectedAt: s.detectedAt, ownerId: s.ownerId, evidence: s.evidence,
      }));

    return {
      generatedAt: new Date().toISOString(),
      counts,
      bySource: tally(open, (s) => s.source),
      byType: tally(open, (s) => s.type),
      signals,
    };
  }

  @Get(':id')
  async get(@Param('id', ParseUuidOr404Pipe) id: string): Promise<Signal> {
    const found = await this.signals.get(id);
    if (!found) throw new NotFoundException(`Signal ${id} not found`);
    return found;
  }

  @Patch(':id/advance')
  advance(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: AdvanceSignalDto): Promise<Signal> {
    if (dto?.to !== 'REVIEWING' && dto?.to !== 'RESEARCHING') throw new BadRequestException('to must be REVIEWING or RESEARCHING');
    return this.signals.advance(id, dto.to, this.tenant.get().actorId);
  }

  /** Promote to a Lead (transactional, idempotent, lineage-preserving). */
  @Post(':id/promote')
  promote(@Param('id', ParseUuidOr404Pipe) id: string): Promise<PromoteSignalResult> {
    return this.signals.promote(id, this.tenant.get().actorId);
  }

  @Post(':id/dismiss')
  dismiss(@Param('id', ParseUuidOr404Pipe) id: string, @Body() dto: DismissSignalDto): Promise<Signal> {
    return this.signals.dismiss(id, dto?.reason ?? '', dto?.asDuplicate ?? false, this.tenant.get().actorId);
  }
}
