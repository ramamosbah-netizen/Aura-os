import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import {
  CASHFLOW_EVENT,
  type ProjectCashflowForecast,
  type NewCashflowForecast,
  type NewCashflowPeriod,
  type CashflowSummary,
  makeCashflowForecast,
  setForecastPeriods,
  summariseCashflow,
} from './domain/cashflow-forecast';
import { CASHFLOW_FORECAST_STORE, type CashflowForecastStore } from './cashflow-forecast-store';

/**
 * Project cash-flow forecast service — one forecast per project. Owns
 * `aura_projects_cashflow_forecasts` and emits `projects.cashflow_forecast.*`.
 * `summary()` returns the net + running-cumulative projection (the funding S-curve).
 */
@Injectable()
export class CashflowForecastService {
  private readonly logger = new Logger('CashflowForecast');

  constructor(
    @Inject(CASHFLOW_FORECAST_STORE) private readonly store: CashflowForecastStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  /** Create-or-replace the project's forecast (idempotent per project). */
  async save(input: NewCashflowForecast): Promise<ProjectCashflowForecast> {
    const existing = await this.store.getByProject(input.tenantId, input.projectId);
    let forecast: ProjectCashflowForecast;
    if (existing) {
      forecast = setForecastPeriods(existing, input.periods ?? []);
      await this.store.update(forecast);
    } else {
      forecast = makeCashflowForecast(input);
      await this.store.create(forecast);
    }
    await this.events.append([
      makeEvent({
        type: CASHFLOW_EVENT.saved,
        tenantId: forecast.tenantId, companyId: forecast.companyId, actorId: forecast.createdBy,
        aggregateType: 'projects.cashflow_forecast', aggregateId: forecast.id,
        payload: { projectId: forecast.projectId, periods: forecast.periods.length },
      }),
    ]);
    this.logger.log(`Cash-flow forecast saved for project ${forecast.projectId} (${forecast.periods.length} periods)`);
    return forecast;
  }

  async summary(tenantId: Id, projectId: Id): Promise<CashflowSummary | null> {
    const f = await this.store.getByProject(tenantId, projectId);
    return f ? summariseCashflow(f) : null;
  }

  list(tenantId: Id): Promise<ProjectCashflowForecast[]> {
    return this.store.list(tenantId);
  }
}
