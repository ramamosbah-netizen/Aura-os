import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Permissions, TenantContext } from '@aura/core';
import { type PeriodClose, PeriodCloseService } from '@aura/finance';

interface ClosePeriodDto {
  period: string; // 'YYYY-MM'
  note?: string;
}
interface ReopenPeriodDto {
  period: string;
  /** Why the books are being opened again. Required — see the domain for why. */
  reason?: string;
}

/**
 * Finance period close — lock/unlock fiscal months against journal posting.
 *
 * CLOSING AND REOPENING ARE TWO AUTHORITIES, declared here rather than derived (SEC-01 stage 3, the
 * second fix after J1-07). Neither route used to declare anything, so the guard derived
 * `finance.period.close` and `finance.period.reopen` from the path and no role NAMED either — both
 * were reachable through `finance.*`, the wildcard the operational Finance role carried alongside
 * invoices, receipts, payments and cash. One permission covered running the department and closing
 * the books, and reopening them needed nothing more than closing them did.
 *
 * `r-finance` no longer holds that wildcard. The two acts sit with `r-finance-controller`, and the
 * domain then refuses the person who closed a period from reopening their own close — which no
 * permission can express, because one role holding both acts is the normal arrangement and the
 * refusal depends on WHICH close is being undone.
 */
@Controller('finance/periods')
export class PeriodCloseController {
  constructor(
    private readonly periods: PeriodCloseService,
    private readonly tenant: TenantContext,
  ) {}

  /** The register — one row per period, the state it is in now. */
  @Get()
  @Permissions('finance.period.read')
  list(): Promise<PeriodClose[]> {
    return this.periods.list(this.tenant.get().tenantId);
  }

  /**
   * Every close of one period, newest first — who closed it, who opened it again and why. The
   * register shows the current state; this is what stands behind it, and the reason reopening writes
   * onto a generation instead of deleting it.
   */
  @Get(':period/history')
  @Permissions('finance.period.read')
  history(@Param('period') period: string): Promise<PeriodClose[]> {
    if (!period?.trim()) throw new BadRequestException('period (YYYY-MM) is required');
    return this.periods.history(this.tenant.get().tenantId, period.trim());
  }

  @Post('close')
  @Permissions('finance.period.close')
  close(@Body() dto: ClosePeriodDto): Promise<PeriodClose> {
    if (!dto?.period?.trim()) throw new BadRequestException('period (YYYY-MM) is required');
    const ctx = this.tenant.get();
    return this.periods.close(ctx.tenantId, dto.period.trim(), ctx.actorId, dto.note ?? null);
  }

  /**
   * Returns the generation this reopened, not a bare acknowledgement. The previous version answered
   * `{reopened: period}` whether or not anything had happened — a period that was never closed got a
   * 201 reporting a reopen that did not occur.
   */
  @Post('reopen')
  @Permissions('finance.period.reopen')
  reopen(@Body() dto: ReopenPeriodDto): Promise<PeriodClose> {
    if (!dto?.period?.trim()) throw new BadRequestException('period (YYYY-MM) is required');
    const ctx = this.tenant.get();
    return this.periods.reopen(ctx.tenantId, dto.period.trim(), ctx.actorId, dto.reason ?? null);
  }
}
