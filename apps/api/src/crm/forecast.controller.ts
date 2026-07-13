import { Controller, Get, Post, Query } from '@nestjs/common';
import { TenantContext } from '@aura/core';
import { ForecastSnapshotService, type ForecastCapture, type ForecastHistory } from '@aura/crm';

// Forecast snapshots — capture the weighted pipeline as immutable history, then read slippage.
// Literal `forecast/*` paths (declared on this controller, registered before the `:id` opportunity
// controller) beat the opportunity `:id` route.
@Controller('crm/opportunities')
export class ForecastController {
  constructor(
    private readonly forecast: ForecastSnapshotService,
    private readonly tenant: TenantContext,
  ) {}

  @Post('forecast/snapshot')
  capture(): Promise<ForecastCapture> {
    const ctx = this.tenant.get();
    return this.forecast.capture(ctx.tenantId, ctx.actorId);
  }

  @Get('forecast/history')
  history(@Query('limit') limit?: string): Promise<ForecastHistory> {
    const n = Math.min(Math.max(Number(limit) || 12, 2), 52);
    return this.forecast.history(this.tenant.get().tenantId, n);
  }
}
