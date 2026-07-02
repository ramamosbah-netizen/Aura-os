import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, type PageParams, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import {
  TENDER_OUTCOME_EVENT,
  type NewTenderOutcome,
  type TenderOutcome,
  type WinLossAnalytics,
  buildWinLossAnalytics,
  makeTenderOutcome,
} from './domain/win-loss';
import { TENDER_OUTCOME_STORE, type TenderOutcomeFilter, type TenderOutcomeStore } from './win-loss-store';

/**
 * Win/loss service — competitor analytics behind tender outcomes. Owns
 * `aura_tendering_outcomes` and emits `tendering.outcome.*`. Separate from
 * TenderService to keep that service's command pipeline unchanged (same
 * split as BidScoreService).
 */
@Injectable()
export class WinLossService {
  private readonly logger = new Logger('Tendering');

  constructor(
    @Inject(TENDER_OUTCOME_STORE) private readonly store: TenderOutcomeStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  async record(input: NewTenderOutcome): Promise<TenderOutcome> {
    const outcome = makeTenderOutcome(input);
    await this.store.save(outcome);
    await this.events.append([
      makeEvent({
        type: TENDER_OUTCOME_EVENT.recorded,
        tenantId: outcome.tenantId,
        companyId: outcome.companyId,
        actorId: outcome.createdBy,
        aggregateType: 'tendering.outcome',
        aggregateId: outcome.id,
        payload: {
          tenderId: outcome.tenderId,
          result: outcome.result,
          ourBidValue: outcome.ourBidValue,
          winnerName: outcome.winnerName,
          competitors: outcome.competitors.length,
        },
      }),
    ]);
    this.logger.log(
      `Tender outcome recorded: ${outcome.tenderId} ${outcome.result}` +
        (outcome.winnerName ? ` (lost to ${outcome.winnerName})` : ''),
    );
    return outcome;
  }

  get(id: Id): Promise<TenderOutcome | null> {
    return this.store.get(id);
  }

  list(filter?: TenderOutcomeFilter): Promise<TenderOutcome[]> {
    return this.store.list(filter);
  }

  listPaged(filter: TenderOutcomeFilter, page: PageParams) {
    return this.store.listPaged(filter, page);
  }

  /** Win-rate + head-to-head competitor stats over all recorded outcomes. */
  async analytics(tenantId: Id): Promise<WinLossAnalytics> {
    // Postgres list defaults to LIMIT 100 — lift it so the roll-up covers the full history.
    const outcomes = await this.store.list({ tenantId, limit: 100_000 });
    return buildWinLossAnalytics(outcomes);
  }
}
