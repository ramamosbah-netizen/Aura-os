import type { Id } from '@aura/shared';
import type { RecommendationSelection, SourcingRecommendation } from './domain/sourcing-recommendation';
import type { SourcingRecommendationStore } from './sourcing-recommendation.store';

const LIVE: ReadonlyArray<SourcingRecommendation['status']> = ['draft', 'submitted', 'approved'];

/**
 * In-memory recommendations, for runs with no database.
 *
 * Enforces the same one-live-per-RFQ rule the partial unique index does. A memory store that is more
 * permissive than the database turns a constraint violation into something only production sees.
 */
export class InMemorySourcingRecommendationStore implements SourcingRecommendationStore {
  private readonly rows = new Map<string, SourcingRecommendation>();
  private readonly selections = new Map<string, RecommendationSelection[]>();

  async create(recommendation: SourcingRecommendation, selections: RecommendationSelection[]): Promise<void> {
    const live = await this.findLive(recommendation.tenantId, recommendation.rfqId);
    if (live) throw new Error('this RFQ already has a live recommendation — withdraw or decide it first');
    this.rows.set(recommendation.id, { ...recommendation });
    this.selections.set(recommendation.id, selections.map((s) => ({ ...s })));
  }

  /**
   * The same conditional claim the database makes. There is no concurrency here to protect against,
   * and that is exactly why it matters: a memory store that lets an already-awarded recommendation
   * be claimed twice turns a real invariant into something only production can catch.
   */
  async claimForAward(tenantId: Id, id: Id, actorId: Id | null): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.tenantId !== tenantId || row.status !== 'approved') return false;
    this.rows.set(id, { ...row, status: 'awarded', awardedBy: actorId, awardedAt: new Date().toISOString() });
    return true;
  }

  async get(tenantId: Id, id: Id): Promise<SourcingRecommendation | null> {
    const row = this.rows.get(id);
    return row && row.tenantId === tenantId ? { ...row } : null;
  }

  async findLive(tenantId: Id, rfqId: Id): Promise<SourcingRecommendation | null> {
    const match = [...this.rows.values()].find(
      (r) => r.tenantId === tenantId && r.rfqId === rfqId && LIVE.includes(r.status));
    return match ? { ...match } : null;
  }

  async listByRfq(tenantId: Id, rfqId: Id): Promise<SourcingRecommendation[]> {
    return [...this.rows.values()]
      .filter((r) => r.tenantId === tenantId && r.rfqId === rfqId)
      .map((r) => ({ ...r }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listSelections(tenantId: Id, recommendationId: Id): Promise<RecommendationSelection[]> {
    return (this.selections.get(recommendationId) ?? [])
      .filter((s) => s.tenantId === tenantId)
      .map((s) => ({ ...s }));
  }

  async updateStatus(recommendation: SourcingRecommendation): Promise<void> {
    const existing = this.rows.get(recommendation.id);
    if (!existing || existing.tenantId !== recommendation.tenantId) throw new Error('recommendation not found');
    // Lifecycle fields only: the selections and the comparison basis are what was decided on.
    this.rows.set(recommendation.id, {
      ...existing,
      status: recommendation.status,
      submittedBy: recommendation.submittedBy, submittedAt: recommendation.submittedAt,
      decidedBy: recommendation.decidedBy, decidedAt: recommendation.decidedAt,
      decisionNote: recommendation.decisionNote,
    });
  }
}
