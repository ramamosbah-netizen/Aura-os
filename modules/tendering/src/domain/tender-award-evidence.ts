import type { Id } from '@aura/shared';

/**
 * ADR-0021 — Tender Award Evidence: what the CUSTOMER awarded.
 *
 * This is the tendering module's answer to a question AURA previously could not answer at all. No
 * pre-existing field means "what the customer awarded":
 *
 *   `Tender.value`                    the ESTIMATED bid value — mutable, and ours
 *   `TenderSubmission.submittedValue` what WE bid
 *   `TenderOutcome.ourBidValue`       what WE bid
 *   BOQ / estimate totals             our cost or price build-up
 *
 * None of them may ever be promoted to an Award Value. Promoting one would present a number with a
 * confidence its provenance does not support — the defect class the Opportunity 360 semantic
 * programme exists to remove.
 *
 * DISTINCT FROM the Approved Commercial Baseline, which is NOT a competing source for the same
 * concept (ADR-0021 is explicit about this):
 *
 *   Approved Commercial Baseline  =  Offer / commercial basis   -> governs the CONTRACT (G-50)
 *   Tender Award Evidence         =  Customer award authority   -> governs the DEAL's provenance
 *
 * `version` follows the ADR-0020 snapshot precedent: this is a JSONB payload that a future shape
 * change must never silently misread, so the reader REFUSES anything it cannot fully parse rather
 * than rendering a partially-understood award (see `readTenderAwardEvidence`).
 */

/** Bumped only when the persisted shape changes incompatibly. A reader refuses any other version. */
export const TENDER_AWARD_EVIDENCE_VERSION = 1;

export interface TenderAwardEvidence {
  version: number;
  /**
   * The Award Value, **excluding VAT** — matching the Award Value semantics the money vocabulary
   * fixes (Quoted Total incl. VAT · Award Value excl. VAT · Contract Value). A real `0` is a valid
   * award; absence is expressed by having no evidence at all, never by a zero.
   */
  awardedValue: number;
  currency: string;
  /** When the customer awarded it — NOT when we recorded it (that is `capturedAt`). */
  awardedAt: string;
  /** PO / LOA / Award Letter reference. Provenance, deliberately NOT a validity gate in v1. */
  awardReference: string | null;
  /** A DMS document, when one exists. Provenance, deliberately NOT a validity gate in v1. */
  evidenceDocumentId: Id | null;
  capturedBy: Id;
  capturedAt: string;
}

export interface NewTenderAwardEvidence {
  awardedValue: number;
  currency: string;
  awardedAt: string;
  awardReference?: string | null;
  evidenceDocumentId?: Id | null;
  capturedBy: Id;
  capturedAt?: string;
}

const isIsoInstant = (s: string): boolean => !Number.isNaN(Date.parse(s));

/**
 * Build validated Award Evidence, or throw.
 *
 * MINIMUM STRUCTURED EVIDENCE = money + currency + awardedAt. That is the whole gate. `awardReference`
 * and `evidenceDocumentId` are richer provenance and are explicitly NOT required in v1: a genuine
 * award can exist without a clean reference number, and refusing it would push real awards back into
 * the unevidenced path — the opposite of what this ADR is for.
 *
 * Messages are worded to land on 400 through the API error taxonomy (`required` / `must`).
 */
export function makeTenderAwardEvidence(input: NewTenderAwardEvidence): TenderAwardEvidence {
  const { awardedValue } = input;
  // THE ZERO RULE: 0 is a real award value. Only a non-finite or negative number is rejected, so
  // `!awardedValue` must never be the test here — it would reject a legitimate zero.
  if (typeof awardedValue !== 'number' || !Number.isFinite(awardedValue)) {
    throw new Error('Award evidence requires an awarded value (a finite number)');
  }
  if (awardedValue < 0) {
    throw new Error('Award evidence awarded value must be 0 or more');
  }
  const currency = typeof input.currency === 'string' ? input.currency.trim().toUpperCase() : '';
  if (!currency) throw new Error('Award evidence requires a currency');

  const awardedAt = typeof input.awardedAt === 'string' ? input.awardedAt.trim() : '';
  if (!awardedAt) throw new Error('Award evidence requires an award date');
  if (!isIsoInstant(awardedAt)) throw new Error('Award evidence award date must be a valid date');

  const capturedBy = typeof input.capturedBy === 'string' ? input.capturedBy.trim() : '';
  if (!capturedBy) throw new Error('Award evidence requires the user who captured it');

  return {
    version: TENDER_AWARD_EVIDENCE_VERSION,
    awardedValue,
    currency,
    awardedAt: new Date(awardedAt).toISOString(),
    awardReference: input.awardReference?.trim() || null,
    evidenceDocumentId: input.evidenceDocumentId ?? null,
    capturedBy,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
  };
}

/**
 * Read persisted evidence back, or `null`.
 *
 * REFUSES anything it cannot fully parse — a wrong version, a missing field, a non-finite amount.
 * A lenient reader would let a partially-understood row be rendered as a customer award, which is
 * exactly the fabricated-provenance failure ADR-0020's `readQualificationAtAward` refuses. `null`
 * here means "no evidenced award", and every consumer already treats that as LEGACY / not evidenced.
 */
export function readTenderAwardEvidence(raw: unknown): TenderAwardEvidence | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  if (e.version !== TENDER_AWARD_EVIDENCE_VERSION) return null;
  if (typeof e.awardedValue !== 'number' || !Number.isFinite(e.awardedValue) || e.awardedValue < 0) return null;
  if (typeof e.currency !== 'string' || !e.currency) return null;
  if (typeof e.awardedAt !== 'string' || !isIsoInstant(e.awardedAt)) return null;
  if (typeof e.capturedBy !== 'string' || !e.capturedBy) return null;
  if (typeof e.capturedAt !== 'string') return null;
  return {
    version: TENDER_AWARD_EVIDENCE_VERSION,
    awardedValue: e.awardedValue,
    currency: e.currency,
    awardedAt: e.awardedAt,
    awardReference: typeof e.awardReference === 'string' ? e.awardReference : null,
    evidenceDocumentId: typeof e.evidenceDocumentId === 'string' ? e.evidenceDocumentId : null,
    capturedBy: e.capturedBy,
    capturedAt: e.capturedAt,
  };
}
