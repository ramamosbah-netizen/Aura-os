import { moneyNumber } from '@aura/shared';
import type { QuotationLine } from './quotation-line';
import type { QuotationRevision } from './quotation-family';

/**
 * SUP-06 — COMMERCIAL NORMALISATION.
 *
 * Turning offers made on different terms into facts a buyer can compare, WITHOUT inventing any of
 * the terms nobody stated. It produces governed comparable facts and nothing else: no winner, no
 * ranking, no recommendation. What a decision does with these facts is SUP-13's authority.
 *
 * The frozen decisions this implements, and the reason each one is a refusal rather than a formula:
 *
 *   TAX BASIS is ex-tax. An unstated tax treatment is UNKNOWN, and `inclusive` without a rate is
 *   UNKNOWN, because whether tax sits inside or outside a price changes what the price MEANS. This
 *   is a COMPARISON BASIS only — it asserts nothing about whether any tax is recoverable.
 *
 *   FREIGHT IS NEVER ALLOCATED TO LINES. A quotation-level charge spread across lines is an
 *   allocation the supplier never made. Line values are ex-freight and say so; freight stays a
 *   separate quotation-level component. Nothing here is called a landed total, because the landed
 *   components are not all known.
 *
 *   THE COMPARISON DATE IS EXPLICIT. The domain never reads the clock. A comparison that silently
 *   used "today" would give a different answer tomorrow with no input having changed, and a user
 *   would see data appearing to move on its own. The date comes in with the request and goes out
 *   with every value computed under it.
 *
 *   A DIFFERING QUOTED QUANTITY YIELDS NO REQUESTED-QUANTITY TOTAL. If 10 were offered against 12
 *   requested, 12 × the unit price is an offer the supplier never made. The unit economics are
 *   comparable and are reported; the requisition-line total is UNKNOWN and says why.
 *
 *   A DIFFERING UNIT OF MEASURE IS NOT COMPARABLE. Guessing how many EA are in a BOX is exactly the
 *   assumption this module exists to refuse. When a real UoM equivalence authority exists it can be
 *   consulted; until then the answer is that we do not know.
 *
 * And the invariant under all of it: an UNKNOWN input produces an UNKNOWN derived value. There is no
 * path from partially-known inputs to a plausible number.
 */

/** Everything a comparison is made UNDER, carried into it and back out of it. */
export interface ComparisonContext {
  /** The currency every comparable value is expressed in. */
  baseCurrency: string;
  /** ONE date for the whole comparison. Never defaulted inside the domain. */
  comparisonDate: string;
}

/**
 * The FX fact a caller resolved for this pair and date, or its absence.
 *
 * Passed IN rather than fetched: the domain stays pure, and the governed rate's provenance travels
 * with the number it produced. Shaped to match what the Finance FX authority returns.
 */
export type ResolvedFx =
  | { status: 'governed'; rate: number; source: string; effectiveDate: string | null; rateId: string | null }
  | { status: 'unknown'; reason: string };

export type TaxBasis = 'ex-tax';
export type FreightBasis = 'excluded';

export type UnknownReason =
  | 'not_quoted'
  | 'unit_price_unknown'
  | 'quantity_unknown'
  | 'currency_unknown'
  | 'tax_treatment_unknown'
  | 'tax_rate_unknown'
  | 'uom_mismatch'
  | 'no_governed_rate'
  | 'quoted_quantity_differs';

/**
 * A commercial value that is either comparable and fully accounted for, or not known.
 *
 * A discriminated union for the same reason `GovernedRate` is one: a bare number cannot say what it
 * excluded or what date it was true on, and a caller that cannot see those cannot be trusted with it.
 */
export type NormalisedCommercialValue =
  | {
      status: 'comparable';
      unitValue: number;
      currency: string;
      comparisonDate: string;
      taxBasis: TaxBasis;
      freightBasis: FreightBasis;
      fx: { source: string; effectiveDate: string | null; rateId: string | null; rate: number };
    }
  | {
      status: 'unknown';
      reason: UnknownReason;
      /** The specific inputs that were missing, so a buyer knows what to go and ask for. */
      missingInputs: string[];
    };

/** Whether the OFFER may still be acted on. Separate from whether its value is known. */
export type CommercialStatus = 'live' | 'expired' | 'validity_unknown';

/** Whether the quantity offered answers the quantity asked for. Separate again. */
export type QuantityCompliance = 'exact' | 'deviated' | 'unknown';

/**
 * WHICH OFFER, AND WHICH REVISION OF IT, produced this row.
 *
 * Carried on every comparison row so a sheet reads "Supplier A, Q-1001 Rev 2, received 15 Sep 2026"
 * rather than "Supplier A — AED 95". A comparable figure whose origin cannot be named is not
 * auditable, and a supplier's Rev 1 and Rev 2 are different offers at different prices.
 */
export interface RevisionProvenance {
  familyId: string;
  supplierQuotationRef: string | null;
  offerId: string;
  offerKind: 'base' | 'alternative';
  offerLabel: string | null;
  revisionId: string;
  revisionNo: number;
  supplierRevisionRef: string | null;
  receivedAt: string | null;
}

export interface NormalisedRequirementLine {
  quotationLineId: string | null;
  supplierId: string | null;
  supplierName: string;
  /** Null only when the offer has NO commercially effective revision — see `notComparableReason`. */
  provenance: RevisionProvenance | null;
  /**
   * Why this supplier appears with no values at all. A supplier whose current offer was withdrawn
   * MUST still appear: one vanishing from a comparison is the failure nobody notices.
   */
  notComparableReason: string | null;

  requestedQuantity: number | null;
  requestedUom: string | null;
  quotedQuantity: number | null;
  quotedUom: string | null;
  /** quoted − requested. Negative is a short offer. Null when either side is unknown. */
  quantityDeviation: number | null;
  /** quoted ÷ requested. Null when either side is unknown or the request is zero. */
  coverageRatio: number | null;
  quantityCompliance: QuantityCompliance;

  /** Price for ONE requisition unit, ex-tax, ex-freight, in the base currency. */
  normalisedUnitPrice: NormalisedCommercialValue;
  /**
   * The whole requisition line at that unit price — ONLY when the supplier actually offered the
   * requested quantity. Otherwise UNKNOWN: multiplying up is an offer nobody made.
   */
  normalisedRequestedLineTotal: NormalisedCommercialValue;

  /** The offer's own validity, which is not a statement about whether its price is known. */
  commercialStatus: CommercialStatus;
  validityDate: string | null;
}

const unknown = (reason: UnknownReason, missingInputs: string[]): NormalisedCommercialValue =>
  ({ status: 'unknown', reason, missingInputs });

/**
 * The unit price with this line's own discount applied.
 *
 * The discount is stated on the line, so spreading it across that line's own units is arithmetic,
 * not an assumption — unlike freight, which is stated for the whole quotation and is therefore never
 * pushed down to anything.
 */
function discountedUnitPrice(line: QuotationLine): number | null {
  if (line.quantity === null || line.unitPrice === null || line.quantity <= 0) return null;
  const gross = moneyNumber(line.quantity * line.unitPrice);
  const net = moneyNumber(gross - (line.lineDiscount ?? 0));
  return net / line.quantity;
}

/**
 * Strip tax to reach the ex-tax comparison basis.
 *
 * `exclusive` and `exempt` are already ex-tax. `inclusive` needs the rate to come back out, and
 * without one the price cannot be placed on the same basis as anybody else's.
 */
function toExTax(
  unitPrice: number,
  quote: Pick<QuotationRevision, 'taxTreatment' | 'taxRatePct'>,
): { ok: true; value: number } | { ok: false; reason: UnknownReason; missing: string[] } {
  if (quote.taxTreatment === null) {
    return { ok: false, reason: 'tax_treatment_unknown', missing: ['quotation.taxTreatment'] };
  }
  if (quote.taxTreatment === 'exclusive' || quote.taxTreatment === 'exempt') {
    return { ok: true, value: unitPrice };
  }
  const rate = quote.taxRatePct;
  if (rate === null || !Number.isFinite(rate) || rate < 0) {
    return { ok: false, reason: 'tax_rate_unknown', missing: ['quotation.taxRatePct'] };
  }
  return { ok: true, value: unitPrice / (1 + rate / 100) };
}

/** Is the offer still open on the comparison date? Not a claim about its price. */
export function commercialStatus(quote: Pick<QuotationRevision, 'validityDate'>, context: ComparisonContext): CommercialStatus {
  if (!quote.validityDate) return 'validity_unknown';
  return quote.validityDate >= context.comparisonDate ? 'live' : 'expired';
}

/**
 * ONE supplier's answer to ONE requisition line, expressed comparably.
 *
 * `fx` is what the caller resolved for (quotation currency → base currency) on the comparison date.
 * It is required even when the currencies match, so that the identity case carries provenance too
 * rather than being a silent special case.
 */
export function normaliseRequirementLine(input: {
  line: QuotationLine;
  revision: QuotationRevision;
  supplierName: string;
  supplierId: string | null;
  provenance: RevisionProvenance;
  requestedQuantity: number | null;
  requestedUom: string | null;
  fx: ResolvedFx;
  context: ComparisonContext;
}): NormalisedRequirementLine {
  const { line, revision: quote, supplierName, supplierId, provenance, requestedQuantity, requestedUom, fx, context } = input;

  const quotedQuantity = line.quantity;
  const quotedUom = line.uom;
  const bothQuantities = requestedQuantity !== null && quotedQuantity !== null;
  const quantityDeviation = bothQuantities ? moneyNumber(quotedQuantity - requestedQuantity) : null;
  const coverageRatio =
    bothQuantities && requestedQuantity > 0 ? Number((quotedQuantity / requestedQuantity).toFixed(6)) : null;
  const quantityCompliance: QuantityCompliance =
    !bothQuantities ? 'unknown' : quantityDeviation === 0 ? 'exact' : 'deviated';

  const base = {
    quotationLineId: line.id,
    supplierId,
    supplierName,
    provenance,
    notComparableReason: null,
    requestedQuantity,
    requestedUom,
    quotedQuantity,
    quotedUom,
    quantityDeviation,
    coverageRatio,
    quantityCompliance,
    commercialStatus: commercialStatus(quote, context),
    validityDate: quote.validityDate,
  };

  const refuse = (reason: UnknownReason, missing: string[]): NormalisedRequirementLine => ({
    ...base,
    normalisedUnitPrice: unknown(reason, missing),
    normalisedRequestedLineTotal: unknown(reason, missing),
  });

  if (line.response !== 'quoted') return refuse('not_quoted', ['quotationLine.response']);
  if (quotedQuantity === null) return refuse('quantity_unknown', ['quotationLine.quantity']);
  if (line.unitPrice === null) return refuse('unit_price_unknown', ['quotationLine.unitPrice']);

  /**
   * UNIT OF MEASURE. A price per BOX and a price per EA are different facts, and no factor relating
   * them has been declared anywhere in AURA. Comparing them would be the single most dangerous kind
   * of quiet error here: it produces a number that looks right and is wrong by a whole multiple.
   */
  const normalise = (u: string | null) => (u ?? '').trim().toLowerCase();
  if (!quotedUom || !requestedUom) {
    return refuse('uom_mismatch', [quotedUom ? 'purchaseRequestLine.uom' : 'quotationLine.uom']);
  }
  if (normalise(quotedUom) !== normalise(requestedUom)) {
    return refuse('uom_mismatch', ['quotationLine.uom', 'purchaseRequestLine.uom']);
  }

  if (!quote.currency) return refuse('currency_unknown', ['quotation.currency']);

  const perUnit = discountedUnitPrice(line);
  if (perUnit === null) return refuse('unit_price_unknown', ['quotationLine.unitPrice', 'quotationLine.quantity']);

  const exTax = toExTax(perUnit, quote);
  if (!exTax.ok) return refuse(exTax.reason, exTax.missing);

  if (fx.status !== 'governed') {
    return refuse('no_governed_rate', [`exchangeRate(${quote.currency}->${context.baseCurrency}) at ${context.comparisonDate}`]);
  }

  const unitValue = moneyNumber(exTax.value * fx.rate);
  const comparable: NormalisedCommercialValue = {
    status: 'comparable',
    unitValue,
    currency: context.baseCurrency,
    comparisonDate: context.comparisonDate,
    taxBasis: 'ex-tax',
    freightBasis: 'excluded',
    fx: { source: fx.source, effectiveDate: fx.effectiveDate, rateId: fx.rateId, rate: fx.rate },
  };

  /**
   * THE REQUISITION-LINE TOTAL, and the one case it is allowed to exist.
   *
   * Only when the supplier offered exactly what was asked for. A short offer multiplied up to the
   * requested quantity is a price for goods nobody agreed to supply — the buyer may still prefer
   * that supplier on unit economics, but the cost of the line is not known.
   */
  const total: NormalisedCommercialValue =
    quantityCompliance === 'exact' && requestedQuantity !== null
      ? { ...comparable, unitValue: moneyNumber(unitValue * requestedQuantity) }
      : unknown('quoted_quantity_differs', ['quotationLine.quantity']);

  return { ...base, normalisedUnitPrice: comparable, normalisedRequestedLineTotal: total };
}

/**
 * The quotation-level commercial components that exist BESIDE the line values, never inside them.
 *
 * Freight is the whole point of this being separate. It is quoted for the offer as a whole, so a
 * per-line comparison is genuinely ex-freight and a buyer needs to see the charge that the line
 * comparison does not contain — including the case where accounting for it would change which
 * supplier is cheaper. Making that visible is the job; resolving it silently is not.
 */
export interface QuotationCommercialComponents {
  quotationId: string;
  supplierName: string;
  currency: string | null;
  /** Freight in the BASE currency when it can be converted, otherwise unknown and why. */
  freight: NormalisedCommercialValue | null;
  freightTerms: string | null;
  paymentTerms: string | null;
  commercialStatus: CommercialStatus;
  validityDate: string | null;
  /**
   * Deliberately absent: any "landed" or "all-in" total. The landed components are not all known —
   * duties, insurance and local handling are nowhere in this model — so naming one would claim
   * completeness this data does not have.
   */
  readonly landedTotal?: never;
}

export function quotationCommercialComponents(
  quote: QuotationRevision,
  supplierName: string,
  fx: ResolvedFx,
  context: ComparisonContext,
): QuotationCommercialComponents {
  const shared = {
    quotationId: quote.id,
    supplierName,
    currency: quote.currency,
    freightTerms: quote.freightTerms,
    paymentTerms: quote.paymentTerms,
    commercialStatus: commercialStatus(quote, context),
    validityDate: quote.validityDate,
  };

  if (quote.freightAmount === null) return { ...shared, freight: null };
  if (!quote.currency) return { ...shared, freight: unknown('currency_unknown', ['quotation.currency']) };

  const exTax = toExTax(quote.freightAmount, quote);
  if (!exTax.ok) return { ...shared, freight: unknown(exTax.reason, exTax.missing) };
  if (fx.status !== 'governed') {
    return {
      ...shared,
      freight: unknown('no_governed_rate', [`exchangeRate(${quote.currency}->${context.baseCurrency}) at ${context.comparisonDate}`]),
    };
  }

  return {
    ...shared,
    freight: {
      status: 'comparable',
      unitValue: moneyNumber(exTax.value * fx.rate),
      currency: context.baseCurrency,
      comparisonDate: context.comparisonDate,
      taxBasis: 'ex-tax',
      freightBasis: 'excluded',
      fx: { source: fx.source, effectiveDate: fx.effectiveDate, rateId: fx.rateId, rate: fx.rate },
    },
  };
}
