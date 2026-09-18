import type { Pool, PoolClient } from 'pg';
import type { TxHandle } from '@aura/core';
import type { Id } from '@aura/shared';
import type {
  OfferKind, QuotationFamily, QuotationOffer, QuotationRevision, RevisionOrigin, RevisionStatus,
} from './domain/quotation-family';
import type { QuotationFamilyStore } from './quotation-family.store';

const iso = (v: Date | string | null): string | null => (v === null ? null : v instanceof Date ? v.toISOString() : String(v));
const num = (v: string | number | null): number | null => (v === null ? null : Number(v));

const FAMILY_COLS = 'id, tenant_id, company_id, rfq_id, supplier_id, supplier_name, supplier_quotation_ref, created_by, created_at';
const OFFER_COLS = 'id, tenant_id, family_id, kind, label, created_by, created_at';
const REVISION_COLS =
  'id, tenant_id, offer_id, revision_no, supplier_revision_ref, origin, received_at, ' +
  'quotation_date::text AS quotation_date, validity_date::text AS validity_date, currency, tax_treatment, ' +
  'tax_rate_pct, freight_amount, freight_terms, payment_terms, notes, status, supersedes_revision_id, ' +
  'source_attachment_id, created_by, created_at';

/* eslint-disable @typescript-eslint/no-explicit-any */
const toFamily = (r: any): QuotationFamily => ({
  id: r.id, tenantId: r.tenant_id, companyId: r.company_id, rfqId: r.rfq_id,
  supplierId: r.supplier_id, supplierName: r.supplier_name,
  supplierQuotationRef: r.supplier_quotation_ref,
  createdBy: r.created_by, createdAt: iso(r.created_at)!,
});

const toOffer = (r: any): QuotationOffer => ({
  id: r.id, tenantId: r.tenant_id, familyId: r.family_id,
  kind: r.kind as OfferKind, label: r.label,
  createdBy: r.created_by, createdAt: iso(r.created_at)!,
});

const toRevision = (r: any): QuotationRevision => ({
  id: r.id, tenantId: r.tenant_id, offerId: r.offer_id, revisionNo: Number(r.revision_no),
  supplierRevisionRef: r.supplier_revision_ref, origin: r.origin as RevisionOrigin,
  receivedAt: iso(r.received_at), quotationDate: r.quotation_date, validityDate: r.validity_date,
  currency: r.currency, taxTreatment: r.tax_treatment, taxRatePct: num(r.tax_rate_pct),
  freightAmount: num(r.freight_amount), freightTerms: r.freight_terms, paymentTerms: r.payment_terms,
  notes: r.notes, status: r.status as RevisionStatus,
  supersedesRevisionId: r.supersedes_revision_id, sourceAttachmentId: r.source_attachment_id,
  createdBy: r.created_by, createdAt: iso(r.created_at)!,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export class PostgresQuotationFamilyStore implements QuotationFamilyStore {
  constructor(private readonly pool: Pool) {}

  async createFamily(f: QuotationFamily): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_procurement_quotation_families (${FAMILY_COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [f.id, f.tenantId, f.companyId, f.rfqId, f.supplierId, f.supplierName, f.supplierQuotationRef, f.createdBy, f.createdAt],
    );
  }

  async getFamily(tenantId: Id, id: Id): Promise<QuotationFamily | null> {
    const res = await this.pool.query(
      `SELECT ${FAMILY_COLS} FROM public.aura_procurement_quotation_families WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    return res.rows[0] ? toFamily(res.rows[0]) : null;
  }

  async listFamiliesByRfq(tenantId: Id, rfqId: Id): Promise<QuotationFamily[]> {
    const res = await this.pool.query(
      `SELECT ${FAMILY_COLS} FROM public.aura_procurement_quotation_families
        WHERE tenant_id = $1 AND rfq_id = $2 ORDER BY created_at`,
      [tenantId, rfqId],
    );
    return res.rows.map(toFamily);
  }

  async findFamily(tenantId: Id, rfqId: Id, supplierId: Id | null, supplierName: string): Promise<QuotationFamily | null> {
    // A canonical supplier is matched by id. A legacy free-text supplier is matched by the exact
    // name only — never fuzzily, because two suppliers share a name and one gets typed three ways.
    const res = supplierId
      ? await this.pool.query(
          `SELECT ${FAMILY_COLS} FROM public.aura_procurement_quotation_families
            WHERE tenant_id = $1 AND rfq_id = $2 AND supplier_id = $3 LIMIT 1`,
          [tenantId, rfqId, supplierId])
      : await this.pool.query(
          `SELECT ${FAMILY_COLS} FROM public.aura_procurement_quotation_families
            WHERE tenant_id = $1 AND rfq_id = $2 AND supplier_id IS NULL AND supplier_name = $3 LIMIT 1`,
          [tenantId, rfqId, supplierName]);
    return res.rows[0] ? toFamily(res.rows[0]) : null;
  }

  async createOffer(o: QuotationOffer): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_procurement_quotation_offers (${OFFER_COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [o.id, o.tenantId, o.familyId, o.kind, o.label, o.createdBy, o.createdAt],
    );
  }

  async getOffer(tenantId: Id, id: Id): Promise<QuotationOffer | null> {
    const res = await this.pool.query(
      `SELECT ${OFFER_COLS} FROM public.aura_procurement_quotation_offers WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    return res.rows[0] ? toOffer(res.rows[0]) : null;
  }

  async listOffers(tenantId: Id, familyId: Id): Promise<QuotationOffer[]> {
    const res = await this.pool.query(
      `SELECT ${OFFER_COLS} FROM public.aura_procurement_quotation_offers
        WHERE tenant_id = $1 AND family_id = $2
        ORDER BY (kind <> 'base'), created_at`,
      [tenantId, familyId],
    );
    return res.rows.map(toOffer);
  }

  async createRevision(r: QuotationRevision): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.aura_procurement_quotation_revisions (${REVISION_COLS.replace(/::text AS \w+/g, '')})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [r.id, r.tenantId, r.offerId, r.revisionNo, r.supplierRevisionRef, r.origin, r.receivedAt,
       r.quotationDate, r.validityDate, r.currency, r.taxTreatment, r.taxRatePct, r.freightAmount,
       r.freightTerms, r.paymentTerms, r.notes, r.status, r.supersedesRevisionId,
       r.sourceAttachmentId, r.createdBy, r.createdAt],
    );
  }

  async getRevision(tenantId: Id, id: Id): Promise<QuotationRevision | null> {
    const res = await this.pool.query(
      `SELECT ${REVISION_COLS} FROM public.aura_procurement_quotation_revisions WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    return res.rows[0] ? toRevision(res.rows[0]) : null;
  }

  async listRevisions(tenantId: Id, offerId: Id): Promise<QuotationRevision[]> {
    const res = await this.pool.query(
      `SELECT ${REVISION_COLS} FROM public.aura_procurement_quotation_revisions
        WHERE tenant_id = $1 AND offer_id = $2 ORDER BY revision_no DESC`,
      [tenantId, offerId],
    );
    return res.rows.map(toRevision);
  }

  async findConfirmedRevision(tenantId: Id, offerId: Id): Promise<QuotationRevision | null> {
    const res = await this.pool.query(
      `SELECT ${REVISION_COLS} FROM public.aura_procurement_quotation_revisions
        WHERE tenant_id = $1 AND offer_id = $2 AND status = 'confirmed' LIMIT 1`,
      [tenantId, offerId],
    );
    return res.rows[0] ? toRevision(res.rows[0]) : null;
  }

  /**
   * The confirmed revision, HELD against supersede for the life of the caller's transaction.
   *
   * `FOR SHARE` rather than `FOR UPDATE`: an award does not change the revision, it depends on the
   * row still meaning what it said. Other readers pass; a concurrent `applyConfirmation` — which
   * must UPDATE this row to 'superseded' before it can promote the next one past the partial unique
   * index — waits until the award commits or rolls back. So the award's view of "not stale" is true
   * AT COMMIT, not merely when it was checked.
   */
  async findConfirmedRevisionForAward(tenantId: Id, offerId: Id, tx: TxHandle | null): Promise<QuotationRevision | null> {
    const executor = (tx as PoolClient) ?? this.pool;
    const res = await executor.query(
      `SELECT ${REVISION_COLS} FROM public.aura_procurement_quotation_revisions
        WHERE tenant_id = $1 AND offer_id = $2 AND status = 'confirmed' LIMIT 1 FOR SHARE`,
      [tenantId, offerId],
    );
    return res.rows[0] ? toRevision(res.rows[0]) : null;
  }

  async updateDraftRevision(r: QuotationRevision): Promise<void> {
    // `AND status = 'draft'` in the predicate, not only in the service: a received revision must be
    // unwritable even if a future caller forgets to ask first.
    const res = await this.pool.query(
      `UPDATE public.aura_procurement_quotation_revisions
          SET supplier_revision_ref = $3, received_at = $4, quotation_date = $5, validity_date = $6,
              currency = $7, tax_treatment = $8, tax_rate_pct = $9, freight_amount = $10,
              freight_terms = $11, payment_terms = $12, notes = $13, source_attachment_id = $14
        WHERE tenant_id = $1 AND id = $2 AND status = 'draft'`,
      [r.tenantId, r.id, r.supplierRevisionRef, r.receivedAt, r.quotationDate, r.validityDate,
       r.currency, r.taxTreatment, r.taxRatePct, r.freightAmount, r.freightTerms, r.paymentTerms,
       r.notes, r.sourceAttachmentId],
    );
    if (res.rowCount === 0) throw new Error('only a draft revision may be edited');
  }

  /**
   * DEMOTE THEN PROMOTE, IN ONE TRANSACTION.
   *
   * The partial unique index on `status = 'confirmed'` means the order is not a preference: promoting
   * first is rejected outright by the database. Doing it in two separate statements would leave an
   * offer with no effective revision — or two — if anything failed between them.
   */
  async applyConfirmation(demote: QuotationRevision | null, promote: QuotationRevision): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (demote) {
        await client.query(
          `UPDATE public.aura_procurement_quotation_revisions SET status = 'superseded'
            WHERE tenant_id = $1 AND id = $2`,
          [demote.tenantId, demote.id],
        );
      }
      await client.query(
        `UPDATE public.aura_procurement_quotation_revisions
            SET status = 'confirmed', supersedes_revision_id = $3
          WHERE tenant_id = $1 AND id = $2`,
        [promote.tenantId, promote.id, promote.supersedesRevisionId],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async setRevisionStatus(tenantId: Id, id: Id, status: RevisionStatus): Promise<void> {
    const res = await this.pool.query(
      `UPDATE public.aura_procurement_quotation_revisions SET status = $3 WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id, status],
    );
    if (res.rowCount === 0) throw new Error('revision not found');
  }
}
