import type { Id } from '@aura/shared';

/**
 * ADR-0021 follow-up — the COMMERCIAL BASIS behind a tender award.
 *
 * Distinct from `TenderAwardEvidence`, and the distinction is the whole point:
 *
 *   TenderAwardEvidence   = what the CUSTOMER awarded   -> governs the DEAL's provenance
 *   TenderCommercialBasis = OUR approved offer          -> governs the CONTRACT's value
 *
 * Before this existed, the contract reactor resolved the basis at DELIVERY time: it ranked the
 * tender's quotations (accepted > approved > sent) and took the latest locked baseline, so a
 * quotation accepted between the award and the handler running changed what the contract inherited.
 * The baseline ROW was always immutable; WHICH baseline applied was not pinned to anything. This
 * pins it.
 *
 * `kind` is load-bearing and must never be collapsed. A basis fixed AT the award and one linked
 * AFTER it are different historical claims, and a single field with a discriminator makes "both at
 * once" unrepresentable rather than merely discouraged.
 *
 * NO CURRENCY, deliberately. `CommercialBaseline` has `subtotal`/`vatTotal`/`total` and no currency
 * field, and `aura_contracts_contracts` has no currency column either. Stamping 'AED' here would be
 * an invented value dressed as provenance, and would quietly turn "the platform is de-facto AED"
 * into a new implicit invariant. Money/currency is handled end-to-end in its own slice.
 */

export const TENDER_COMMERCIAL_BASIS_VERSION = 1;

/**
 * WHEN the basis was fixed relative to the award.
 *   AT_AWARD           — a locked baseline existed at the moment of award; captured in that same tx.
 *   POST_AWARD_LINKED  — none existed then; a baseline locked later and was linked to the award.
 */
export type CommercialBasisKind = 'AT_AWARD' | 'POST_AWARD_LINKED';

export interface TenderCommercialBasis {
  version: number;
  kind: CommercialBasisKind;
  baselineId: Id;
  quotationId: Id;
  /**
   * `baseline.total` — the Contract Value measure, VAT-INCLUSIVE. Deliberately the same figure the
   * contract reactor already used, because this change moves WHERE the number comes from and WHEN it
   * is fixed; it does not redefine Contract Value. Distinct from the deal's Award Value
   * (`awardEvidence.awardedValue`, excl. VAT) and from `Tender.value` (our estimate).
   */
  value: number;
  /** When this basis became the basis: the award instant, or the later lock instant. */
  establishedAt: string;
}

export interface NewTenderCommercialBasis {
  kind: CommercialBasisKind;
  baselineId: Id;
  quotationId: Id;
  value: number;
  establishedAt: string;
}

const isIsoInstant = (s: string): boolean => !Number.isNaN(Date.parse(s));

/** Build a validated basis, or throw. Messages land on 400 through the API error taxonomy. */
export function makeTenderCommercialBasis(input: NewTenderCommercialBasis): TenderCommercialBasis {
  if (input.kind !== 'AT_AWARD' && input.kind !== 'POST_AWARD_LINKED') {
    throw new Error('Commercial basis requires a kind of AT_AWARD or POST_AWARD_LINKED');
  }
  const baselineId = typeof input.baselineId === 'string' ? input.baselineId.trim() : '';
  if (!baselineId) throw new Error('Commercial basis requires the baseline it came from');
  const quotationId = typeof input.quotationId === 'string' ? input.quotationId.trim() : '';
  if (!quotationId) throw new Error('Commercial basis requires the quotation carrying the baseline');
  // THE ZERO RULE: a real 0 is a valid approved total; only non-finite or negative is refused.
  if (typeof input.value !== 'number' || !Number.isFinite(input.value)) {
    throw new Error('Commercial basis requires a value (a finite number)');
  }
  if (input.value < 0) throw new Error('Commercial basis value must be 0 or more');
  const establishedAt = typeof input.establishedAt === 'string' ? input.establishedAt.trim() : '';
  if (!establishedAt) throw new Error('Commercial basis requires the moment it was established');
  if (!isIsoInstant(establishedAt)) throw new Error('Commercial basis established date must be a valid date');

  return {
    version: TENDER_COMMERCIAL_BASIS_VERSION,
    kind: input.kind,
    baselineId,
    quotationId,
    value: input.value,
    establishedAt: new Date(establishedAt).toISOString(),
  };
}

/**
 * Read a persisted basis back, or `null`.
 *
 * REFUSES anything it cannot fully parse, for the same reason as `readTenderAwardEvidence`: a
 * half-understood basis rendered as a contract value would be exactly the fabricated authority this
 * work exists to remove. `null` reads as "no commercial basis", which every consumer already treats
 * as "awaiting commercial basis".
 */
export function readTenderCommercialBasis(raw: unknown): TenderCommercialBasis | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  if (b.version !== TENDER_COMMERCIAL_BASIS_VERSION) return null;
  if (b.kind !== 'AT_AWARD' && b.kind !== 'POST_AWARD_LINKED') return null;
  if (typeof b.baselineId !== 'string' || !b.baselineId) return null;
  if (typeof b.quotationId !== 'string' || !b.quotationId) return null;
  if (typeof b.value !== 'number' || !Number.isFinite(b.value) || b.value < 0) return null;
  if (typeof b.establishedAt !== 'string' || !isIsoInstant(b.establishedAt)) return null;
  return {
    version: TENDER_COMMERCIAL_BASIS_VERSION,
    kind: b.kind,
    baselineId: b.baselineId,
    quotationId: b.quotationId,
    value: b.value,
    establishedAt: b.establishedAt,
  };
}
