import { type Id, newId } from '@aura/shared';
import type { Quotation, QuotationLine } from './quotation';

/**
 * Commercial Baseline (R3 / G-P1-1) — the immutable, point-in-time snapshot of the price a
 * quotation was APPROVED at. It is written once, on quotation approval, and never mutated: the
 * quotation may then be revised, re-priced or superseded, but the baseline records exactly what
 * the business signed off. A Contract references its baseline, so the commercial truth ("what we
 * agreed to deliver, at what price") is traceable end-to-end and any drift between the contract
 * value and the approved price is measurable (`commercialVariance`).
 *
 * Distinct from the mutable Quotation (an operational record) — this is a locked snapshot.
 */
export interface CommercialBaseline {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  /** The quotation whose approval locked this baseline (reference + snapshot). */
  quotationId: Id;
  quoteNumber: string;
  revision: number;
  customerName: string;
  accountId: Id | null;
  /** Provenance up the deal chain (reference, not join). */
  sourceOpportunityId: Id | null;
  sourceTenderId: Id | null;
  /** Frozen copy of the approved lines + totals. */
  lines: QuotationLine[];
  subtotal: number;
  vatTotal: number;
  total: number;
  /** Who locked it and when — the approval sign-off. */
  lockedBy: Id | null;
  lockedAt: string;
  createdAt: string;
}

/**
 * Build the immutable baseline from a quotation at the moment it is approved. Copies the lines and
 * totals by value so later edits to the quotation cannot change the baseline.
 */
export function makeCommercialBaseline(q: Quotation, lockedBy: Id | null): CommercialBaseline {
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: q.tenantId,
    companyId: q.companyId,
    quotationId: q.id,
    quoteNumber: q.quoteNumber,
    revision: q.revision,
    customerName: q.customerName,
    accountId: q.accountId,
    sourceOpportunityId: q.sourceOpportunityId,
    sourceTenderId: q.sourceTenderId,
    lines: q.lines.map((l) => ({ ...l })),
    subtotal: q.subtotal,
    vatTotal: q.vatTotal,
    total: q.total,
    lockedBy,
    lockedAt: now,
    createdAt: now,
  };
}

export interface CommercialVariance {
  /** The locked approved total. */
  baselineTotal: number;
  /** The contract's current value. */
  contractValue: number;
  /** contractValue − baselineTotal (positive = contract above the approved price). */
  variance: number;
  /** Variance as a % of the baseline (0 when the baseline total is 0). */
  variancePct: number;
  /** True when the contract value differs from the approved price beyond a rounding tolerance. */
  drifted: boolean;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Compare a contract's value against its locked commercial baseline — the drift detector. */
export function commercialVariance(baselineTotal: number, contractValue: number): CommercialVariance {
  const variance = round2(contractValue - baselineTotal);
  const variancePct = baselineTotal === 0 ? 0 : round2((variance / baselineTotal) * 100);
  return {
    baselineTotal: round2(baselineTotal),
    contractValue: round2(contractValue),
    variance,
    variancePct,
    drifted: Math.abs(variance) > 0.01,
  };
}

export const COMMERCIAL_BASELINE_EVENT = {
  locked: 'crm.commercial_baseline.locked',
} as const;
