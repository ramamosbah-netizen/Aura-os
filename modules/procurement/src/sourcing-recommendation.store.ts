import type { TxHandle } from '@aura/core';
import type { Id } from '@aura/shared';
import type { RecommendationSelection, SourcingRecommendation } from './domain/sourcing-recommendation';

/** DI token for the sourcing recommendation store (SUP-13). */
export const SOURCING_RECOMMENDATION_STORE = Symbol('SOURCING_RECOMMENDATION_STORE');

/**
 * The store for a governed sourcing recommendation and its selections.
 *
 * Note what a selection may NOT do: change which revision it was made on. There is no method to
 * re-point one, because a recommendation that follows a supplier to their next revision is a
 * recommendation of a price nobody read. A newer revision makes the recommendation stale; the answer
 * is to review it, and reviewing it means preparing a new one.
 */
export interface SourcingRecommendationStore {
  create(recommendation: SourcingRecommendation, selections: RecommendationSelection[]): Promise<void>;
  get(tenantId: Id, id: Id): Promise<SourcingRecommendation | null>;
  /** The live recommendation for an RFQ — draft, submitted or approved. Null when there is none. */
  findLive(tenantId: Id, rfqId: Id): Promise<SourcingRecommendation | null>;
  /** Every recommendation raised against an RFQ, newest first. Rejected ones stay readable. */
  listByRfq(tenantId: Id, rfqId: Id): Promise<SourcingRecommendation[]>;
  listSelections(tenantId: Id, recommendationId: Id): Promise<RecommendationSelection[]>;
  /** Lifecycle only. Commercial content is never rewritten after it is created. */
  updateStatus(recommendation: SourcingRecommendation): Promise<void>;
  /**
   * CLAIM this recommendation for an award: move it from `approved` to `awarded` and say whether
   * THIS caller was the one who moved it.
   *
   * A conditional update, not a read followed by a write. Two requests awarding the same
   * recommendation can both read `approved` before either writes — the check-then-act that looks
   * safe in one process and is not safe at all in two. The database decides, once, and the loser is
   * told it lost rather than raising a second set of purchase orders.
   */
  claimForAward(tenantId: Id, id: Id, actorId: Id | null, tx: TxHandle | null): Promise<boolean>;
}
