import { type Id, newId } from '@aura/shared';

/**
 * Bid-time sourcing link (R5 / G-P1-4): records that a rate-build-up COMPONENT was priced from
 * a procurement pre-award RFQ QUOTE. `sourcedUnitCost` is the quote unit cost stamped when the
 * component was sourced; comparing it to the live quote's amount flags a stale estimate.
 * `previousUnitCost` is the component's rate before sourcing, restored on un-source.
 */
/**
 * WHERE A GOVERNED PRICE CAME FROM — enough to find it again and to say why it was allowed.
 *
 * The legacy link named an RFQ QUOTE HEADER: a whole-quote amount with no material, no line and no
 * technical judgement, which is BID-01. A governed source names the supplier's immutable REVISION
 * and the LINE on it that priced this material, the requisition line it answered, the currency the
 * supplier quoted in, the technical verdict that made it eligible, and the date the comparison was
 * read on. A price with no nameable origin is not a basis anybody can check.
 */
export interface GovernedSourceLineage {
  quotationRevisionId: Id;
  quotationLineId: Id;
  prLineId: Id;
  materialId: Id;
  currency: string;
  /** Snapshot at the moment of sourcing. Only an ELIGIBLE verdict can be a price basis. */
  technicalVerdict: 'compliant' | 'compliant_with_deviation';
  comparisonDate: string;
}

export interface EstimateSource {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  tenderId: Id;
  buildUpId: Id;
  boqItemId: Id;
  componentId: Id;
  /** The RFQ the price answered. Present on both lineages. */
  rfqId: Id | null;
  /** LEGACY lineage only — the whole-quote header. Null on a governed source. */
  quoteId: Id | null;
  /** GOVERNED lineage only. Exactly one of `quoteId` and `governed` is present. */
  governed: GovernedSourceLineage | null;
  supplierName: string;
  sourcedUnitCost: number;
  previousUnitCost: number;
  sourcedAt: string;
  createdBy: Id | null;
}

export interface NewEstimateSource {
  tenantId: Id;
  companyId?: Id | null;
  tenderId: Id;
  buildUpId: Id;
  boqItemId: Id;
  componentId: Id;
  rfqId?: Id | null;
  quoteId?: Id | null;
  governed?: GovernedSourceLineage | null;
  supplierName: string;
  sourcedUnitCost: number;
  previousUnitCost: number;
  createdBy?: Id | null;
}

const ELIGIBLE_VERDICTS: ReadonlyArray<GovernedSourceLineage['technicalVerdict']> = ['compliant', 'compliant_with_deviation'];

export function makeEstimateSource(input: NewEstimateSource): EstimateSource {
  if (!input.componentId) throw new Error('componentId is required');
  const governed = input.governed ?? null;
  // EXACTLY ONE LINEAGE. Both would make the record claim two origins; neither, none.
  if (governed && input.quoteId) {
    throw new Error('validation: a source must be either a legacy quote header or a governed quotation line, never both');
  }
  if (!governed && (!input.quoteId || !input.rfqId)) throw new Error('rfqId and quoteId are required to source a component');
  if (governed) {
    const missing = (['quotationRevisionId', 'quotationLineId', 'prLineId', 'materialId', 'currency', 'comparisonDate'] as const)
      .filter((k) => !String(governed[k] ?? '').trim());
    if (missing.length) throw new Error(`validation: a governed source is missing ${missing.join(', ')} — a price with no nameable origin is not a basis`);
    // A line the technical authority judged non-compliant is not a market alternative for this
    // requirement, whatever its price. Refused here as well as upstream, so no caller can smuggle one in.
    if (!ELIGIBLE_VERDICTS.includes(governed.technicalVerdict)) {
      throw new Error('validation: only a technically eligible quotation line can price a component — it must be compliant or compliant with deviation');
    }
  }
  const cost = Number(input.sourcedUnitCost);
  if (!Number.isFinite(cost) || cost < 0) throw new Error('sourced unit cost cannot be negative');
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    tenderId: input.tenderId,
    buildUpId: input.buildUpId,
    boqItemId: input.boqItemId,
    componentId: input.componentId,
    rfqId: input.rfqId ?? null,
    quoteId: governed ? null : input.quoteId ?? null,
    governed: governed ? { ...governed, currency: governed.currency.trim().toUpperCase() } : null,
    supplierName: input.supplierName.trim() || 'Supplier',
    sourcedUnitCost: cost,
    previousUnitCost: Math.max(0, Number(input.previousUnitCost) || 0),
    sourcedAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/** A source is stale when the live quote's amount no longer matches what was stamped. */
export function isSourceStale(source: Pick<EstimateSource, 'sourcedUnitCost'>, liveQuoteAmount: number | null | undefined): boolean {
  if (liveQuoteAmount == null) return true; // quote gone → definitely stale
  return Math.abs(Number(liveQuoteAmount) - source.sourcedUnitCost) > 1e-9;
}
