import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import {
  PERIOD_CLOSE_EVENT,
  type PeriodClose,
  closePeriod,
  isValidPeriod,
  reopenPeriod,
  reopenSeparation,
} from './domain/period-close';
import { PERIOD_CLOSE_STORE, type PeriodCloseStore } from './period-close-store';

/**
 * Period-close service — locks and unlocks fiscal periods. Closing a period emits
 * `finance.period.closed` on the spine; `JournalService` consults the same store before every post,
 * so once a period is closed no further journals can be dated into it.
 *
 * Each close is a GENERATION and a reopen writes onto it rather than deleting it, so the register
 * answers "who closed this, who opened it again, and why" for every cycle rather than only the last.
 */
@Injectable()
export class PeriodCloseService {
  private readonly logger = new Logger('FinancePeriodClose');

  constructor(
    @Inject(PERIOD_CLOSE_STORE) private readonly store: PeriodCloseStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  async close(tenantId: Id, period: string, closedBy?: Id | null, note?: string | null): Promise<PeriodClose> {
    // The whole history, because the next generation number is a function of it and "already closed"
    // is a question only the current generation can answer.
    const history = await this.store.history(tenantId, period);
    const close = closePeriod(history, { tenantId, period, closedBy, note });
    await this.store.save(close);
    await this.events.append([
      makeEvent({
        type: PERIOD_CLOSE_EVENT.closed,
        tenantId,
        companyId: null,
        actorId: closedBy ?? null,
        aggregateType: 'finance.period',
        aggregateId: close.id,
        payload: { period: close.period, generation: close.generation },
      }),
    ]);
    this.logger.log(`Period closed: ${period} (generation ${close.generation}) by ${closedBy ?? 'unknown'}`);
    return close;
  }

  /**
   * Reopen the period by writing the reopen onto the generation that holds it closed. Returns that
   * generation as it now stands, so the caller sees the close it undid and not a bare acknowledgement
   * — the previous version answered `{reopened: period}` whether or not anything had happened.
   */
  async reopen(tenantId: Id, period: string, actorId?: Id | null, reason?: string | null): Promise<PeriodClose> {
    if (!isValidPeriod(period)) throw new Error(`Invalid period "${period}" — expected YYYY-MM`);
    const history = await this.store.history(tenantId, period);
    const reopened = reopenPeriod(history, period, actorId ?? null, reason);
    await this.store.save(reopened);
    await this.events.append([
      makeEvent({
        type: PERIOD_CLOSE_EVENT.reopened,
        tenantId,
        companyId: null,
        actorId: actorId ?? null,
        aggregateType: 'finance.period',
        aggregateId: reopened.id,
        payload: {
          period,
          generation: reopened.generation,
          reason: reopened.reopenReason,
          // Whether the closer/reopener separation could actually be checked on this one. Derived
          // from the row, so the event cannot claim a control the record does not support.
          separation: reopenSeparation(reopened),
        },
      }),
    ]);
    this.logger.log(`Period reopened: ${period} (generation ${reopened.generation}) by ${actorId ?? 'unknown'}`);
    return reopened;
  }

  async isClosed(tenantId: Id, period: string): Promise<boolean> {
    return (await this.store.findByPeriod(tenantId, period)) !== null;
  }

  /** The register — one row per period, the state it is in now. */
  list(tenantId: Id): Promise<PeriodClose[]> {
    return this.store.list(tenantId);
  }

  /** Every close of one period, newest first: the drill-down behind the register row. */
  history(tenantId: Id, period: string): Promise<PeriodClose[]> {
    return this.store.history(tenantId, period);
  }
}
