import type { Id } from '@aura/shared';
import type { ProjectCashflowForecast } from './domain/cashflow-forecast';
import type { CashflowForecastStore } from './cashflow-forecast-store';

export class InMemoryCashflowForecastStore implements CashflowForecastStore {
  private readonly rows = new Map<string, ProjectCashflowForecast>();

  private clone(f: ProjectCashflowForecast): ProjectCashflowForecast {
    return { ...f, periods: f.periods.map((p) => ({ ...p })) };
  }

  async create(f: ProjectCashflowForecast): Promise<void> {
    this.rows.set(f.id, this.clone(f));
  }

  async update(f: ProjectCashflowForecast): Promise<void> {
    this.rows.set(f.id, this.clone(f));
  }

  async get(id: Id): Promise<ProjectCashflowForecast | null> {
    const f = this.rows.get(id);
    return f ? this.clone(f) : null;
  }

  async getByProject(tenantId: Id, projectId: Id): Promise<ProjectCashflowForecast | null> {
    const f = [...this.rows.values()].find((x) => x.tenantId === tenantId && x.projectId === projectId);
    return f ? this.clone(f) : null;
  }

  async list(tenantId: Id): Promise<ProjectCashflowForecast[]> {
    return [...this.rows.values()].filter((x) => x.tenantId === tenantId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
}
