import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { TenantContext, ParseUuidOr404Pipe } from '@aura/core';
import {
  RETENTION_RELEASE_KINDS,
  RetentionReleaseService,
  type RetentionRelease,
  type RetentionReleaseKind,
} from '@aura/contracts';

class CreateRetentionReleaseDto {
  @IsString() contractId!: string;
  @IsOptional() @IsString() kind?: RetentionReleaseKind;
  @IsNumber() amount!: number;
  @IsOptional() @IsString() releaseDate?: string;
  @IsOptional() @IsString() notes?: string;
}

const DECISIONS = ['approved', 'rejected'] as const;

/**
 * Retention releases API — giving back the retention withheld on interim certificates.
 * `GET position/:contractId` is the screen's source of truth: held / released / pending /
 * releasable plus the conventional tranche for each milestone.
 */
@Controller('contracts/retention')
export class RetentionController {
  constructor(
    private readonly retention: RetentionReleaseService,
    private readonly tenant: TenantContext,
  ) {}

  // literal route before :id
  @Get('position/:contractId')
  position(@Param('contractId', ParseUuidOr404Pipe) contractId: string) {
    return this.retention.position(this.tenant.get().tenantId, contractId);
  }

  @Post()
  create(@Body() dto: CreateRetentionReleaseDto): Promise<RetentionRelease> {
    if (!dto?.contractId) throw new BadRequestException('contractId is required');
    if (dto.kind && !RETENTION_RELEASE_KINDS.includes(dto.kind)) {
      throw new BadRequestException(`kind must be one of ${RETENTION_RELEASE_KINDS.join(', ')}`);
    }
    const ctx = this.tenant.get();
    return this.retention.create({
      tenantId: ctx.tenantId,
      companyId: ctx.companyId,
      contractId: dto.contractId,
      kind: dto.kind,
      amount: Number(dto.amount),
      releaseDate: dto.releaseDate ?? null,
      notes: dto.notes ?? null,
      createdBy: ctx.actorId,
    });
  }

  @Get()
  list(@Query('contractId') contractId?: string, @Query('status') status?: string): Promise<RetentionRelease[]> {
    return this.retention.list({ tenantId: this.tenant.get().tenantId, contractId, status, limit: 200 });
  }

  @Get(':id')
  async get(@Param('id', ParseUuidOr404Pipe) id: string): Promise<RetentionRelease> {
    const found = await this.retention.get(id);
    if (!found) throw new NotFoundException(`retention release ${id} not found`);
    return found;
  }

  /** Approve (bills the client for the tranche) or reject. */
  @Patch(':id/status')
  decide(
    @Param('id', ParseUuidOr404Pipe) id: string,
    @Body() dto: { status: (typeof DECISIONS)[number] },
  ): Promise<RetentionRelease> {
    if (!DECISIONS.includes(dto?.status)) throw new BadRequestException(`status must be one of ${DECISIONS.join(', ')}`);
    return this.retention.decide(id, dto.status, this.tenant.get().actorId ?? undefined);
  }
}
