import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import {
  PERIOD_CLOSE_EVENT,
  type PeriodClose,
  isValidPeriod,
  makePeriodClose,
} from './domain/period-close';
import { PERIOD_CLOSE_STORE, type PeriodCloseStore } from './period-close-store';

/**
 * Period-close service — locks/unlocks fiscal periods. Closing a period emits
 * `finance.period.closed` on the spine; `JournalService` consults the same store before
 * every post, so once a period is closed no further journals can be dated into it.
 */
@Injectable()
export class PeriodCloseService {
  private readonly logger = new Logger('FinancePeriodClose');

  constructor(
    @Inject(PERIOD_CLOSE_STORE) private readonly store: PeriodCloseStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  async close(tenantId: Id, period: string, closedBy?: Id | null, note?: string | null): Promise<PeriodClose> {
    const existing = await this.store.findByPeriod(tenantId, period);
    if (existing) return existing; // already closed — idempotent
    const close = makePeriodClose({ tenantId, period, closedBy, note });
    await this.store.save(close);
    await this.events.append([
      makeEvent({
        type: PERIOD_CLOSE_EVENT.closed,
        tenantId,
        companyId: null,
        actorId: closedBy ?? null,
        aggregateType: 'finance.period',
        aggregateId: close.id,
        payload: { period: close.period },
      }),
    ]);
    this.logger.log(`Period closed: ${period}`);
    return close;
  }

  async reopen(tenantId: Id, period: string, actorId?: Id | null): Promise<void> {
    if (!isValidPeriod(period)) throw new Error(`Invalid period "${period}" — expected YYYY-MM`);
    const existing = await this.store.findByPeriod(tenantId, period);
    if (!existing) return; // not closed — nothing to do
    await this.store.remove(tenantId, period);
    await this.events.append([
      makeEvent({
        type: PERIOD_CLOSE_EVENT.reopened,
        tenantId,
        companyId: null,
        actorId: actorId ?? null,
        aggregateType: 'finance.period',
        aggregateId: existing.id,
        payload: { period },
      }),
    ]);
    this.logger.log(`Period reopened: ${period}`);
  }

  async isClosed(tenantId: Id, period: string): Promise<boolean> {
    return (await this.store.findByPeriod(tenantId, period)) !== null;
  }

  list(tenantId: Id): Promise<PeriodClose[]> {
    return this.store.list(tenantId);
  }
}
