import type { Pool } from 'pg';
import type { Id } from '@aura/shared';
import type {
  RecommendationMode, RecommendationReasonCode, RecommendationSelection,
  RecommendationStatus, SourcingRecommendation,
} from './domain/sourcing-recommendation';
import type { SourcingRecommendationStore } from './sourcing-recommendation.store';

const iso = (v: Date | string | null): string | null => (v === null ? null : v instanceof Date ? v.toISOString() : String(v));
const num = (v: string | number | null): number | null => (v === null ? null : Number(v));

const RECO_COLS =
  'id, tenant_id, company_id, rfq_id, comparison_date::text AS comparison_date, comparison_currency, ' +
  'mode, status, reason_code, reason, created_by, created_at, submitted_by, submitted_at, ' +
  'decided_by, decided_at, decision_note, withdrawn_by, withdrawn_at, withdrawal_reason';

const SELECTION_COLS =
  'id, tenant_id, recommendation_id, family_id, offer_id, revision_id, supplier_name, ' +
  'covered_pr_line_ids, governed_total, governed_total_basis, technical_status, commercial_status, created_at';

/* eslint-disable @typescript-eslint/no-explicit-any */
const toReco = (r: any): SourcingRecommendation => ({
  id: r.id, tenantId: r.tenant_id, companyId: r.company_id, rfqId: r.rfq_id,
  comparisonDate: r.comparison_date, comparisonCurrency: r.comparison_currency,
  mode: r.mode as RecommendationMode, status: r.status as RecommendationStatus,
  reasonCode: r.reason_code as RecommendationReasonCode | null, reason: r.reason,
  createdBy: r.created_by, createdAt: iso(r.created_at)!,
  submittedBy: r.submitted_by, submittedAt: iso(r.submitted_at),
  decidedBy: r.decided_by, decidedAt: iso(r.decided_at), decisionNote: r.decision_note,
  // Read as well as written — a withdrawal nobody can see is not an audit trail.
  withdrawnBy: r.withdrawn_by, withdrawnAt: iso(r.withdrawn_at), withdrawalReason: r.withdrawal_reason,
});

const toSelection = (r: any): RecommendationSelection => ({
  id: r.id, tenantId: r.tenant_id, recommendationId: r.recommendation_id,
  familyId: r.family_id, offerId: r.offer_id, revisionId: r.revision_id,
  supplierName: r.supplier_name, coveredPrLineIds: r.covered_pr_line_ids ?? [],
  governedTotal: num(r.governed_total), governedTotalBasis: r.governed_total_basis,
  technicalStatus: r.technical_status, commercialStatus: r.commercial_status,
  createdAt: iso(r.created_at)!,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export class PostgresSourcingRecommendationStore implements SourcingRecommendationStore {
  constructor(private readonly pool: Pool) {}

  /**
   * The recommendation and its selections land together or not at all.
   *
   * A recommendation with no selections is not a lesser record, it is a meaningless one: it says a
   * decision was made without saying what was chosen.
   */
  async create(r: SourcingRecommendation, selections: RecommendationSelection[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO public.aura_procurement_sourcing_recommendations (${RECO_COLS.replace(/::text AS \w+/g, '')})
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        // One column list serves the SELECT and the INSERT, so every column added to it needs a
        // placeholder here too. Adding the withdrawal columns without these three made every
        // recommendation fail with "INSERT has more target columns than expressions" — invisible to
        // the API e2e, which runs on in-memory stores, and immediate in the browser.
        [r.id, r.tenantId, r.companyId, r.rfqId, r.comparisonDate, r.comparisonCurrency,
         r.mode, r.status, r.reasonCode, r.reason, r.createdBy, r.createdAt,
         r.submittedBy, r.submittedAt, r.decidedBy, r.decidedAt, r.decisionNote,
         r.withdrawnBy, r.withdrawnAt, r.withdrawalReason],
      );
      for (const s of selections) {
        await client.query(
          `INSERT INTO public.aura_procurement_recommendation_selections (${SELECTION_COLS})
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [s.id, s.tenantId, s.recommendationId, s.familyId, s.offerId, s.revisionId,
           s.supplierName, s.coveredPrLineIds, s.governedTotal, s.governedTotalBasis,
           s.technicalStatus, s.commercialStatus, s.createdAt],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async get(tenantId: Id, id: Id): Promise<SourcingRecommendation | null> {
    const res = await this.pool.query(
      `SELECT ${RECO_COLS} FROM public.aura_procurement_sourcing_recommendations WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id]);
    return res.rows[0] ? toReco(res.rows[0]) : null;
  }

  async findLive(tenantId: Id, rfqId: Id): Promise<SourcingRecommendation | null> {
    const res = await this.pool.query(
      `SELECT ${RECO_COLS} FROM public.aura_procurement_sourcing_recommendations
        WHERE tenant_id = $1 AND rfq_id = $2 AND status IN ('draft','submitted','approved') LIMIT 1`,
      [tenantId, rfqId]);
    return res.rows[0] ? toReco(res.rows[0]) : null;
  }

  async listByRfq(tenantId: Id, rfqId: Id): Promise<SourcingRecommendation[]> {
    const res = await this.pool.query(
      `SELECT ${RECO_COLS} FROM public.aura_procurement_sourcing_recommendations
        WHERE tenant_id = $1 AND rfq_id = $2 ORDER BY created_at DESC`,
      [tenantId, rfqId]);
    return res.rows.map(toReco);
  }

  async listSelections(tenantId: Id, recommendationId: Id): Promise<RecommendationSelection[]> {
    const res = await this.pool.query(
      `SELECT ${SELECTION_COLS} FROM public.aura_procurement_recommendation_selections
        WHERE tenant_id = $1 AND recommendation_id = $2 ORDER BY created_at`,
      [tenantId, recommendationId]);
    return res.rows.map(toSelection);
  }

  /** Lifecycle only: the commercial content of a decision is never rewritten after the fact. */
  async updateStatus(r: SourcingRecommendation): Promise<void> {
    const res = await this.pool.query(
      `UPDATE public.aura_procurement_sourcing_recommendations
          SET status = $3, submitted_by = $4, submitted_at = $5,
              decided_by = $6, decided_at = $7, decision_note = $8,
              withdrawn_by = $9, withdrawn_at = $10, withdrawal_reason = $11
        WHERE tenant_id = $1 AND id = $2`,
      [r.tenantId, r.id, r.status, r.submittedBy, r.submittedAt, r.decidedBy, r.decidedAt, r.decisionNote,
       r.withdrawnBy, r.withdrawnAt, r.withdrawalReason]);
    if (res.rowCount === 0) throw new Error('recommendation not found');
  }
}
