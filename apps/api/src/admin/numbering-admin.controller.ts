import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { type NumberSequence, NumberingService, Permissions, TenantContext } from '@aura/core';

/**
 * Document-numbering admin (gap register Vol 23 #12). View the configured sequences and their
 * current counters, and set the next number / prefix / padding per module-entity-year.
 * Guarded by `admin.numbering.manage`.
 */
@Controller('admin/numbering')
export class NumberingAdminController {
  constructor(
    private readonly numbering: NumberingService,
    private readonly tenant: TenantContext,
  ) {}

  @Permissions('admin.numbering.manage')
  @Get()
  list(): Promise<NumberSequence[]> {
    return this.numbering.listSequences(this.tenant.get().tenantId);
  }

  @Permissions('admin.numbering.manage')
  @Post()
  async set(@Body() dto: { module?: string; entity?: string; fiscalYear?: number; currentSeq?: number; prefix?: string; padWidth?: number }): Promise<{ ok: true; nextNumber: number }> {
    const module = dto?.module?.trim();
    const entity = dto?.entity?.trim();
    if (!module) throw new BadRequestException('module is required');
    if (!entity) throw new BadRequestException('entity is required');
    const fiscalYear = Number(dto.fiscalYear) || new Date().getFullYear();
    const currentSeq = Number.isFinite(Number(dto.currentSeq)) && Number(dto.currentSeq) >= 0 ? Math.floor(Number(dto.currentSeq)) : 0;
    await this.numbering.setSequence(this.tenant.get().tenantId, {
      module,
      entity,
      fiscalYear,
      currentSeq,
      prefix: dto.prefix?.trim(),
      padWidth: dto.padWidth ? Math.max(1, Math.floor(Number(dto.padWidth))) : undefined,
    });
    return { ok: true, nextNumber: currentSeq + 1 };
  }
}
