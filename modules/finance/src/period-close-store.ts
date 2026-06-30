import type { PeriodClose } from './domain/period-close';

export const PERIOD_CLOSE_STORE = Symbol('PERIOD_CLOSE_STORE');

export interface PeriodCloseStore {
  save(close: PeriodClose): Promise<void>;
  findByPeriod(tenantId: string, period: string): Promise<PeriodClose | null>;
  list(tenantId: string): Promise<PeriodClose[]>;
  remove(tenantId: string, period: string): Promise<void>;
}
