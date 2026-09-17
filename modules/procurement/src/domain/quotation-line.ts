import { type Id, moneyNumber, newId } from '@aura/shared';

/**
 * What a supplier is OFFERING, item by item (Wave 4 — supplier decision spine).
 *
 * A quotation was one scalar `amount`, so the twelve comparison leaves `SUP-01`…`SUP-12` were not
 * unbuilt but STRUCTURALLY IMPOSSIBLE — make and model, deviations, quantity, unit price, lead time
 * and warranty had nowhere to exist. This is the fourth time this wave has met the same shape: a
 * header with a scalar where the business needs items.
 *
 * THE ONE RULE THIS FILE EXISTS TO HOLD:
 *
 *   A QUOTATION LINE IS A DECLARATION, NEVER A DETERMINATION.
 *
 * Everything here is what the SUPPLIER asserts. There is no compliance verdict, no eligibility, no
 * rank and no comparable value, and their absence is the design rather than an omission:
 *
 *   · `SUP-01`'s frozen authority is the Procurement RFQ context with the Technical Manager among
 *     its roles. The verdict is an INTERNAL determination made later and recorded BESIDE this row.
 *     A boolean here would become a decision field by gravity, and the supplier would be filling it.
 *   · Quality's MAR is a SEPARATE authority and is NOT consumed here. It says a make/model is
 *     approved for the project, which cannot answer whether this offer meets this requisition line:
 *     the same approved model can be offered with a deviation, a missing accessory or a narrower
 *     warranty and be approved and non-compliant at once. Nothing on this path reads a MAR, so it is
 *     not evidence this capability uses, and whether one is even required for a given material is
 *     undetermined — some may need none.
 *   · A normalised or landed value is DERIVED from these facts against the Finance FX authority. One
 *     stored here would be a second commercial truth, free to drift from the supplier's own.
 */

/** What the supplier did about this requirement. An OMITTED line has no record at all — UNKNOWN. */
export const QUOTE_RESPONSES = ['quoted', 'no_bid'] as const;
export type QuoteResponse = (typeof QUOTE_RESPONSES)[number];

/**
 * The supplier's own answer to the specification. A CLAIM, with exactly the standing of their price.
 *
 * `comply` here means "the supplier says it complies". It is never eligibility, and nothing in this
 * module may read it as such — see `isSupplierClaimOnly`.
 */
export const COMPLIANCE_RESPONSES = ['comply', 'comply_with_deviation', 'not_offered'] as const;
export type ComplianceResponse = (typeof COMPLIANCE_RESPONSES)[number];

export interface QuotationLine {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  /** Supplier and RFQ are reached through this, not copied onto every line. */
  /**
   * LEGACY. Null on any line captured against a revision (QC-01).
   *
   * A line used to belong to a quotation, which was a single mutable row — so a supplier revision
   * overwrote the prices on it. A line now belongs to an immutable REVISION, and the previous
   * revision keeps its own lines at the prices it actually quoted.
   */
  quotationId: Id | null;
  /** The immutable revision this line belongs to. Null only on a line not yet backfilled. */
  revisionId: Id | null;
  /** The supplier's own words for what they are offering, which is not always the material's name. */
  supplierDescription: string | null;
  partNumber: string | null;
  /**
   * A commercial deviation — payment terms, part shipment, a price condition. Separate from
   * `deviations`, which is the supplier's TECHNICAL departure from the specification: they are
   * different claims about different things, and folding them together loses which a buyer is
   * reading.
   */
  commercialDeviation: string | null;
  /** The requisition line this answers. An offer answering nothing cannot be compared. */
  prLineId: Id;
  response: QuoteResponse;
  offeredManufacturer: string | null;
  offeredModel: string | null;
  /** The supplier says this differs from what was asked. It does not become an equivalent by saying so. */
  isAlternate: boolean;
  complianceResponse: ComplianceResponse | null;
  deviations: string | null;
  exclusions: string | null;
  quantity: number | null;
  uom: string | null;
  /** In the QUOTATION's currency. Never converted here. */
  unitPrice: number | null;
  lineDiscount: number | null;
  leadTimeDays: number | null;
  warrantyMonths: number | null;
  notes: string | null;
  createdBy: Id | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewQuotationLine {
  tenantId: Id;
  companyId?: Id | null;
  quotationId?: Id | null;
  revisionId?: Id | null;
  supplierDescription?: string | null;
  partNumber?: string | null;
  commercialDeviation?: string | null;
  prLineId: Id;
  response?: QuoteResponse;
  offeredManufacturer?: string | null;
  offeredModel?: string | null;
  isAlternate?: boolean;
  complianceResponse?: ComplianceResponse | null;
  deviations?: string | null;
  exclusions?: string | null;
  quantity?: number | null;
  uom?: string | null;
  unitPrice?: number | null;
  lineDiscount?: number | null;
  leadTimeDays?: number | null;
  warrantyMonths?: number | null;
  notes?: string | null;
  createdBy?: Id | null;
}

export const QUOTED_MUST_BE_PRICED =
  'a quoted line requires a quantity and a unit price — an offer with neither is not a cheaper offer, ' +
  'it is an unanswerable one, and a supplier who will not price this requirement records no_bid instead';

export const ALTERNATE_MUST_BE_NAMED =
  'an alternate offer requires the make and model actually being offered — "something else" cannot be ' +
  'compared with what was asked for';

export const NO_BID_CARRIES_NO_PRICE =
  'a declined line cannot carry a price: no_bid means the supplier is not offering this requirement';

export function makeQuotationLine(input: NewQuotationLine): QuotationLine {
  /**
   * A line must belong to SOMETHING — a revision for anything captured now, or a legacy quotation
   * for a row that predates the family model. It may not float free: a price with no offer behind it
   * cannot be attributed to a supplier, and a comparison would have no terms to read it under.
   */
  if (!input.revisionId && !input.quotationId) {
    throw new Error('a quotation line must belong to a quotation revision');
  }
  if (!input.prLineId) throw new Error('a quotation line must answer a requisition line');

  const response: QuoteResponse = input.response ?? 'quoted';
  const quantity = input.quantity ?? null;
  const unitPrice = input.unitPrice ?? null;

  if (response === 'quoted') {
    if (quantity === null || !(Number(quantity) > 0) || unitPrice === null) {
      throw new Error(QUOTED_MUST_BE_PRICED);
    }
  } else if (unitPrice !== null) {
    // Silence and refusal are different facts, and a declined line with a price is neither.
    throw new Error(NO_BID_CARRIES_NO_PRICE);
  }

  if (input.isAlternate && !(input.offeredManufacturer?.trim() && input.offeredModel?.trim())) {
    throw new Error(ALTERNATE_MUST_BE_NAMED);
  }

  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    quotationId: input.quotationId ?? null,
    revisionId: input.revisionId ?? null,
    supplierDescription: input.supplierDescription?.trim() || null,
    partNumber: input.partNumber?.trim() || null,
    commercialDeviation: input.commercialDeviation?.trim() || null,
    prLineId: input.prLineId,
    response,
    offeredManufacturer: input.offeredManufacturer?.trim() || null,
    offeredModel: input.offeredModel?.trim() || null,
    isAlternate: input.isAlternate ?? false,
    complianceResponse: input.complianceResponse ?? null,
    deviations: input.deviations?.trim() || null,
    exclusions: input.exclusions?.trim() || null,
    quantity: quantity === null ? null : Number(quantity),
    uom: input.uom?.trim() || null,
    unitPrice: unitPrice === null ? null : Number(unitPrice),
    lineDiscount: input.lineDiscount ?? null,
    leadTimeDays: input.leadTimeDays ?? null,
    warrantyMonths: input.warrantyMonths ?? null,
    notes: input.notes?.trim() || null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The supplier's own arithmetic, in the supplier's own currency.
 *
 * DERIVED, never stored — the line keeps quantity and unit price, and any total is computed from
 * them so two figures cannot disagree. This is NOT a comparable value: it is not converted, not
 * tax-adjusted and carries no freight, so it may only ever be shown beside the currency it is in.
 * Comparison across suppliers is a later slice with the Finance FX authority behind it.
 */
export function lineAmountInQuotedCurrency(line: QuotationLine): number | null {
  if (line.response !== 'quoted' || line.quantity === null || line.unitPrice === null) return null;
  const gross = moneyNumber(line.quantity * line.unitPrice);
  return moneyNumber(gross - (line.lineDiscount ?? 0));
}

/**
 * Does this line carry a supplier COMPLIANCE CLAIM rather than any determination?
 *
 * Always true, and that is the point. It exists so the question "is this compliant?" has somewhere
 * to land in this module with the honest answer — nobody here knows. A caller that wants eligibility
 * must go to the technical evaluation authority, and this function is what a reviewer greps for when
 * they suspect the boundary has been crossed.
 */
export function isSupplierClaimOnly(_line: QuotationLine): true {
  return true;
}

export interface RequirementCoverage {
  requirements: number;
  quoted: number;
  declined: number;
  /** Requirements with no line at all — nobody asked, or nobody answered. Never counted as declined. */
  unanswered: number;
}

/**
 * How much of what was ASKED FOR this quotation actually answers.
 *
 * The three outcomes are kept apart deliberately. A partial bidder is a legitimate supplier, a
 * declined line is an answer, and an unanswered one is an absence — reporting "3 of 5" without
 * saying which kind of missing is which is how a comparison starts looking complete.
 */
export function requirementCoverage(prLineIds: string[], lines: QuotationLine[]): RequirementCoverage {
  const byRequirement = new Map(lines.map((l) => [l.prLineId, l]));
  let quoted = 0;
  let declined = 0;
  let unanswered = 0;
  for (const id of prLineIds) {
    const line = byRequirement.get(id);
    if (!line) unanswered += 1;
    else if (line.response === 'quoted') quoted += 1;
    else declined += 1;
  }
  return { requirements: prLineIds.length, quoted, declined, unanswered };
}
