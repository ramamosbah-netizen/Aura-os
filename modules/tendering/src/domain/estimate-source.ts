import { type Id, newId } from '@aura/shared';

/**
 * Bid-time sourcing link (R5 / G-P1-4): records that a rate-build-up COMPONENT was priced from
 * a procurement pre-award RFQ QUOTE. `sourcedUnitCost` is the quote unit cost stamped when the
 * component was sourced; comparing it to the live quote's amount flags a stale estimate.
 * `previousUnitCost` is the component's rate before sourcing, restored on un-source.
 */
export interface EstimateSource {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  tenderId: Id;
  buildUpId: Id;
  boqItemId: Id;
  componentId: Id;
  rfqId: Id;
  quoteId: Id;
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
  rfqId: Id;
  quoteId: Id;
  supplierName: string;
  sourcedUnitCost: number;
  previousUnitCost: number;
  createdBy?: Id | null;
}

export function makeEstimateSource(input: NewEstimateSource): EstimateSource {
  if (!input.componentId) throw new Error('componentId is required');
  if (!input.quoteId || !input.rfqId) throw new Error('rfqId and quoteId are required to source a component');
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
    rfqId: input.rfqId,
    quoteId: input.quoteId,
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
