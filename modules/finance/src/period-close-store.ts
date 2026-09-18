import type { PeriodClose } from './domain/period-close';

export const PERIOD_CLOSE_STORE = Symbol('PERIOD_CLOSE_STORE');

export interface PeriodCloseStore {
  save(close: PeriodClose): Promise<void>;
  /**
   * The generation that currently holds this period closed, or null if it is open. This is the
   * question every caller outside the close/reopen path is really asking — `JournalService` included
   * — and answering it here keeps "closed" meaning one thing.
   */
  findByPeriod(tenantId: string, period: string): Promise<PeriodClose | null>;
  /**
   * Every generation of one period, newest first. The drill-down behind the register: which closes
   * happened, who reopened each and why.
   */
  history(tenantId: string, period: string): Promise<PeriodClose[]>;
  /** The CURRENT state of every period — one row each, the register itself. */
  list(tenantId: string): Promise<PeriodClose[]>;
  /** Every generation of every period. The register's full history, newest period first. */
  listAll(tenantId: string): Promise<PeriodClose[]>;
}
