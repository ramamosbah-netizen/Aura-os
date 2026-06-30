import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { type PeriodClose, PeriodCloseService } from '@aura/finance';

interface ClosePeriodDto {
  period: string; // 'YYYY-MM'
  note?: string;
}
interface ReopenPeriodDto {
  period: string;
}

/** Finance period close — lock/unlock fiscal months against journal posting. */
@Controller('finance/periods')
export class PeriodCloseController {
  constructor(
    private readonly periods: PeriodCloseService,
    private readonly tenant: TenantContext,
  ) {}

  @Get()
  list(): Promise<PeriodClose[]> {
    return this.periods.list(this.tenant.get().tenantId);
  }

  @Post('close')
  close(@Body() dto: ClosePeriodDto): Promise<PeriodClose> {
    if (!dto?.period?.trim()) throw new BadRequestException('period (YYYY-MM) is required');
    const ctx = this.tenant.get();
    return this.periods.close(ctx.tenantId, dto.period.trim(), ctx.actorId, dto.note ?? null);
  }

  @Post('reopen')
  async reopen(@Body() dto: ReopenPeriodDto): Promise<{ reopened: string }> {
    if (!dto?.period?.trim()) throw new BadRequestException('period (YYYY-MM) is required');
    const ctx = this.tenant.get();
    await this.periods.reopen(ctx.tenantId, dto.period.trim(), ctx.actorId);
    return { reopened: dto.period.trim() };
  }
}
