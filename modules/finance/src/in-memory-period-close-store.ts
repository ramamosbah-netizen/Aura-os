import type { PeriodClose } from './domain/period-close';
import type { PeriodCloseStore } from './period-close-store';

export class InMemoryPeriodCloseStore implements PeriodCloseStore {
  private readonly closes = new Map<string, PeriodClose>();

  private key(tenantId: string, period: string): string {
    return `${tenantId}:${period}`;
  }

  async save(close: PeriodClose): Promise<void> {
    this.closes.set(this.key(close.tenantId, close.period), { ...close });
  }

  async findByPeriod(tenantId: string, period: string): Promise<PeriodClose | null> {
    return this.closes.get(this.key(tenantId, period)) ?? null;
  }

  async list(tenantId: string): Promise<PeriodClose[]> {
    return [...this.closes.values()]
      .filter((c) => c.tenantId === tenantId)
      .sort((a, b) => (a.period < b.period ? 1 : -1));
  }

  async remove(tenantId: string, period: string): Promise<void> {
    this.closes.delete(this.key(tenantId, period));
  }
}
