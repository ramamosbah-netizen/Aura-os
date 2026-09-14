import { ConflictException, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { type Id, makeEvent, type PageParams, sameTenantOrNull } from '@aura/shared';
import { AuditService, EVENT_STORE, type EventStore, TenantContext } from '@aura/core';
import { BID_SCORE_EVENT, type BidScore, type NewBidScore, makeBidScore } from './domain/bid-score';
import { BID_SCORE_STORE, BidScoreLockedError, type BidScoreFilter, type BidScoreStore } from './bid-score-store';

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
    // @Optional() @Inject(...) explicitly: a union-typed ctor param emits `Object` for
    // design:paramtypes and Nest injects null silently, which would make the guards inert.
    @Optional() @Inject(TenantContext) private readonly tenant: TenantContext | null = null,
    @Optional() @Inject(AuditService) private readonly audit: AuditService | null = null,
  ) {}

  async create(input: NewBidScore): Promise<BidScore> {
    const score = makeBidScore(input);
    try {
      await this.store.save(score);
    } catch (error) {
      if (error instanceof BidScoreLockedError) throw new ConflictException(error.message);
      throw error;
    }
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
    if (this.audit) {
      await this.audit.log(
        score.tenantId,
        score.companyId,
        score.createdBy,
        'tendering',
        'bid_score',
        score.id,
        'decide',
        { tenderId: score.tenderId, totalScore: score.totalScore, recommendation: score.recommendation },
        { source: BID_SCORE_EVENT.scored },
      );
    }
    this.logger.log(`Bid scored for tender ${score.tenderId}: ${score.totalScore}/100 → ${score.recommendation}`);
    return score;
  }

  async amend(
    previousId: Id,
    input: Pick<NewBidScore, 'criteria' | 'notes'>,
    reason: string,
    actorId: Id,
  ): Promise<BidScore> {
    const previous = await this.get(previousId);
    if (!previous) throw new ConflictException('the locked qualification decision is unavailable or outside this tenant');
    if (previous.supersededAt) throw new ConflictException('only the current qualification decision can be amended');
    if (!reason.trim()) throw new ConflictException('an amendment reason is required');
    const replacement = makeBidScore({
      tenantId: previous.tenantId,
      companyId: previous.companyId,
      tenderId: previous.tenderId,
      tenderTitle: previous.tenderTitle,
      criteria: input.criteria,
      notes: input.notes,
      decidedBy: actorId,
      createdBy: actorId,
      supersedesId: previous.id,
      amendmentReason: reason,
    });
    try {
      await this.store.amend(previous.id, replacement, actorId);
    } catch (error) {
      if (error instanceof BidScoreLockedError) throw new ConflictException(error.message);
      throw error;
    }
    await this.events.append([
      makeEvent({
        type: BID_SCORE_EVENT.amended,
        tenantId: replacement.tenantId,
        companyId: replacement.companyId,
        actorId,
        aggregateType: 'tendering.bid_score',
        aggregateId: replacement.id,
        payload: {
          tenderId: replacement.tenderId,
          supersedesId: previous.id,
          reason: reason.trim(),
          previousRecommendation: previous.recommendation,
          recommendation: replacement.recommendation,
        },
      }),
    ]);
    if (this.audit) {
      await this.audit.log(
        replacement.tenantId,
        replacement.companyId,
        actorId,
        'tendering',
        'bid_score',
        replacement.id,
        'amend',
        { tenderId: replacement.tenderId, supersedesId: previous.id, reason: reason.trim(), totalScore: replacement.totalScore, recommendation: replacement.recommendation },
        { source: BID_SCORE_EVENT.amended },
      );
    }
    return replacement;
  }

  /** Tenant-scoped read (N-08): never hand back another tenant's record. */
  async get(id: Id): Promise<BidScore | null> {
    return sameTenantOrNull(await this.store.get(id), this.tenant?.boundTenantId());
  }

  list(filter?: BidScoreFilter): Promise<BidScore[]> {
    return this.store.list(filter);
  }

  listPaged(filter: BidScoreFilter, page: PageParams) {
    return this.store.listPaged(filter, page);
  }
}
