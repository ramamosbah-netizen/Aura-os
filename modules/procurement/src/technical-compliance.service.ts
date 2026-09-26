import { Inject, Injectable } from '@nestjs/common';
import type { Id } from '@aura/shared';
import { PR_LINE_STORE, type PurchaseRequestLineStore } from './purchase-request-line-store';
import { QUOTATION_LINE_STORE, type QuotationLineStore } from './quotation-line.store';
import { QUOTATION_FAMILY_STORE, type QuotationFamilyStore } from './quotation-family.store';
import { QUOTATION_LINE_EVALUATION_STORE, type QuotationLineEvaluationStore } from './quotation-line-evaluation.store';
import { RFQ_STORE, type RfqStore } from './rfq-store';
import { effectiveRevision } from './domain/quotation-family';
import type { ComplianceResponse, QuoteResponse } from './domain/quotation-line';
import type { TechnicalVerdict } from './domain/quotation-line-evaluation';

/**
 * ONE SUPPLIER LINE, AS A TECHNICAL FACT — and nothing commercial.
 *
 * EST-12 (the owner's decision of 2026-09-25): "Keep commercial prices out of this technical
 * document." So this shape is BUILT, field by field, rather than spread from a quotation line: a
 * line carries its unit price, discount and lead time, and a spread would carry them too. What a
 * technical reader needs is here — what was asked, who offered what against it in which revision,
 * what the supplier claimed, and what the Technical Manager decided, why, and when.
 */
export interface TechnicalComplianceOffer {
  prId: Id;
  prLineId: Id;
  prLineNo: number;
  sourceBoqItemId: Id | null;
  materialCode: string;
  materialName: string;
  requested: { quantity: number; uom: string; specification: string | null; manufacturer: string | null; model: string | null };
  supplierId: Id | null;
  supplierName: string;
  supplierQuotationRef: string | null;
  offerLabel: string | null;
  revisionId: Id;
  revisionNo: number;
  supplierRevisionRef: string | null;
  quotationLineId: Id;
  response: QuoteResponse;
  offered: { description: string | null; manufacturer: string | null; model: string | null; partNumber: string | null; quantity: number | null; uom: string | null };
  /** What the SUPPLIER says — a claim, with exactly the standing of their price. */
  complianceClaim: ComplianceResponse | null;
  deviations: string | null;
  exclusions: string | null;
  /** What the COMPANY decided — SUP-13's current verdict (ADR-0022), read and never re-derived. */
  verdict: TechnicalVerdict | null;
  rationale: string | null;
  evaluatedBy: Id | null;
  evaluatedAt: string | null;
  /** Set when the current verdict amended an earlier one — the reason the earlier one fell. */
  amendmentReason: string | null;
}

@Injectable()
export class TechnicalComplianceService {
  constructor(
    @Inject(PR_LINE_STORE) private readonly prLines: PurchaseRequestLineStore,
    @Inject(QUOTATION_LINE_STORE) private readonly quotationLines: QuotationLineStore,
    @Inject(QUOTATION_FAMILY_STORE) private readonly families: QuotationFamilyStore,
    @Inject(RFQ_STORE) private readonly rfqs: RfqStore,
    @Inject(QUOTATION_LINE_EVALUATION_STORE) private readonly evaluations: QuotationLineEvaluationStore,
  ) {}

  /**
   * Every supplier line answering these requisitions, in each supplier offer's EFFECTIVE revision —
   * the revision a comparison would read today — with its current technical verdict.
   *
   * Walked from the RFQs and their families (as the commercial comparison walks them), so a
   * supplier is reached through the requisition it was asked about and never by guessing.
   */
  async forRequisitions(tenantId: Id, prIds: readonly Id[]): Promise<TechnicalComplianceOffer[]> {
    if (prIds.length === 0) return [];
    const requirements = new Map<Id, Awaited<ReturnType<PurchaseRequestLineStore['listForRequest']>>[number]>();
    for (const prId of prIds) {
      for (const line of await this.prLines.listForRequest(prId, tenantId)) requirements.set(line.id, line);
    }
    const out: TechnicalComplianceOffer[] = [];
    for (const rfq of await this.rfqs.listByPrIds(tenantId, prIds)) {
      for (const family of await this.families.listFamiliesByRfq(tenantId, rfq.id)) {
        for (const offer of await this.families.listOffers(tenantId, family.id)) {
          const current = effectiveRevision(await this.families.listRevisions(tenantId, offer.id));
          if (!current) continue;
          for (const line of await this.quotationLines.listByRevision(tenantId, current.id)) {
            const requirement = requirements.get(line.prLineId);
            if (!requirement) continue;
            const evaluation = await this.evaluations.findCurrent(tenantId, line.id);
            out.push({
              prId: requirement.prId,
              prLineId: requirement.id,
              prLineNo: requirement.lineNo,
              sourceBoqItemId: requirement.sourceBoqItemId ?? null,
              materialCode: requirement.materialCode,
              materialName: requirement.materialName,
              requested: {
                quantity: Number(requirement.quantity),
                uom: requirement.uom,
                specification: requirement.specification ?? null,
                manufacturer: requirement.manufacturer ?? null,
                model: requirement.model ?? null,
              },
              supplierId: family.supplierId,
              supplierName: family.supplierName,
              supplierQuotationRef: family.supplierQuotationRef,
              offerLabel: offer.label,
              revisionId: current.id,
              revisionNo: current.revisionNo,
              supplierRevisionRef: current.supplierRevisionRef,
              quotationLineId: line.id,
              response: line.response,
              offered: {
                description: line.supplierDescription,
                manufacturer: line.offeredManufacturer,
                model: line.offeredModel,
                partNumber: line.partNumber,
                quantity: line.quantity,
                uom: line.uom,
              },
              complianceClaim: line.complianceResponse,
              deviations: line.deviations,
              exclusions: line.exclusions,
              verdict: evaluation?.verdict ?? null,
              rationale: evaluation?.rationale ?? null,
              evaluatedBy: evaluation?.decidedBy ?? null,
              evaluatedAt: evaluation?.decidedAt ?? null,
              amendmentReason: evaluation?.amendmentReason ?? null,
            });
          }
        }
      }
    }
    return out.sort((a, b) => a.prLineNo - b.prLineNo || a.supplierName.localeCompare(b.supplierName));
  }
}
