import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Id, type PageParams, makeEvent } from '@aura/shared';
import { EVENT_STORE, type EventStore } from '@aura/core';
import { BID_SCORE_EVENT, type BidScore, type NewBidScore, makeBidScore } from './domain/bid-score';
import { BID_SCORE_STORE, type BidScoreFilter, type BidScoreStore } from './bid-score-store';

/**
 * Bid-score service — go/no-go tender qualification. Owns `aura_tendering_bid_scores`
 * and emits `tendering.bid_score.*`. Separate from TenderService to keep that service's
 * command pipeline unchanged.
 */
@Injectable()
export class BidScoreService {
  private readonly logger = new Logger('Tendering');

  constructor(
    @Inject(BID_SCORE_STORE) private readonly store: BidScoreStore,
    @Inject(EVENT_STORE) private readonly events: EventStore,
  ) {}

  async create(input: NewBidScore): Promise<BidScore> {
    const score = makeBidScore(input);
    await this.store.save(score);
    await this.events.append([
      makeEvent({
        type: BID_SCORE_EVENT.scored,
        tenantId: score.tenantId,
        companyId: score.companyId,
        actorId: score.createdBy,
        aggregateType: 'tendering.bid_score',
        aggregateId: score.id,
        payload: { tenderId: score.tenderId, totalScore: score.totalScore, recommendation: score.recommendation },
      }),
    ]);
    this.logger.log(`Bid scored for tender ${score.tenderId}: ${score.totalScore}/100 → ${score.recommendation}`);
    return score;
  }

  get(id: Id): Promise<BidScore | null> {
    return this.store.get(id);
  }

  list(filter?: BidScoreFilter): Promise<BidScore[]> {
    return this.store.list(filter);
  }

  listPaged(filter: BidScoreFilter, page: PageParams) {
    return this.store.listPaged(filter, page);
  }
}
