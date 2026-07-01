import type { Id } from '@aura/shared';
import type { ProjectCashflowForecast } from './domain/cashflow-forecast';

export const CASHFLOW_FORECAST_STORE = Symbol('CASHFLOW_FORECAST_STORE');

export interface CashflowForecastStore {
  create(f: ProjectCashflowForecast): Promise<void>;
  update(f: ProjectCashflowForecast): Promise<void>;
  get(id: Id): Promise<ProjectCashflowForecast | null>;
  getByProject(tenantId: Id, projectId: Id): Promise<ProjectCashflowForecast | null>;
  list(tenantId: Id): Promise<ProjectCashflowForecast[]>;
}
