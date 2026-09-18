import { isCurrentClose, type PeriodClose } from './domain/period-close';
import type { PeriodCloseStore } from './period-close-store';

export class InMemoryPeriodCloseStore implements PeriodCloseStore {
  /** Keyed by GENERATION, not by period — a period holds as many closes as it has had. */
  private readonly closes = new Map<string, PeriodClose>();

  private key(tenantId: string, period: string, generation: number): string {
    return `${tenantId}:${period}:${generation}`;
  }

  async save(close: PeriodClose): Promise<void> {
    this.closes.set(this.key(close.tenantId, close.period, close.generation), { ...close });
  }

  async findByPeriod(tenantId: string, period: string): Promise<PeriodClose | null> {
    return (await this.history(tenantId, period)).find(isCurrentClose) ?? null;
  }

  async history(tenantId: string, period: string): Promise<PeriodClose[]> {
    return [...this.closes.values()]
      .filter((c) => c.tenantId === tenantId && c.period === period)
      .sort((a, b) => b.generation - a.generation);
  }

  async list(tenantId: string): Promise<PeriodClose[]> {
    return (await this.listAll(tenantId)).filter(isCurrentClose);
  }

  async listAll(tenantId: string): Promise<PeriodClose[]> {
    return [...this.closes.values()]
      .filter((c) => c.tenantId === tenantId)
      .sort((a, b) => (a.period === b.period ? b.generation - a.generation : a.period < b.period ? 1 : -1));
  }
}
