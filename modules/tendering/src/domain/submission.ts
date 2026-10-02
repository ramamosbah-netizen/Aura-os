import { type Id, addMoney, newId, roundMoney } from '@aura/shared';

// Tendering domain — framework-free. T2 (vision §2.2 "Submission"): a TenderSubmission is the
// RECORD of a bid going out the door — what was submitted, when, by whom, through which channel,
// under which reference, acknowledging which addenda. Before T2 the whole milestone was one enum
// value (`status: 'submitted'`), which gestures at the fact without recording any of it.
//
// The record is a fact, not a workflow object: it is written at the moment the tender crosses the
// `submitted` gate (every route into `submitted` writes one) and never deleted. A tender may carry
// several — a resubmission against a later addendum is a second fact, not an edit of the first.
// The won/lost gate reads this record as its evidence, the same way the estimating gate reads the
// bid score.

export type SubmissionMethod = 'portal' | 'email' | 'in_person' | 'courier' | 'other';

export const SUBMISSION_METHODS: readonly SubmissionMethod[] = [
  'portal', 'email', 'in_person', 'courier', 'other',
];

/**
 * VAT-BASIS-01 — what `submittedValue` IS. A bare number made every reader guess which code path wrote
 * it, and the award it is compared with is recorded EXCLUDING VAT (ADR-0021).
 *   `gross`     the approved offer's total INCLUDING VAT; `submittedNet` + `submittedVat` are its parts
 *   `unstated`  nothing recorded what the number is — every submission before 0404, and a bid with no
 *               approved offer (the tender's own figure). Its parts are null: a split back-filled now
 *               would be a guess about which offer stood at the time, presented as a record.
 */
export type SubmissionValueBasis = 'gross' | 'unstated';

/** The approved offer as it went out: before VAT, the VAT, and their total. */
export interface SubmittedOffer {
  net: number;
  vat: number;
  gross: number;
}

export interface TenderSubmission {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  tenderId: Id;
  /** Title snapshot — the list reads without a join, same discipline as accountName on Tender. */
  tenderTitle: string | null;
  /** When the bid actually went out (ISO timestamp). */
  submittedAt: string;
  /** Who physically submitted it. */
  submittedBy: Id | null;
  method: SubmissionMethod;
  /** Portal / venue name when method is `portal` (or the courier, the receiving office …). */
  portal: string | null;
  /** The client-side receipt / submission reference number. */
  reference: string | null;
  /** The bid value at the moment of submission — a snapshot, so later BOQ edits can't rewrite
   * what was actually offered. */
  submittedValue: number;
  /** What `submittedValue` is — see SubmissionValueBasis. */
  valueBasis: SubmissionValueBasis;
  /** The offer before VAT. Null unless `valueBasis` is `gross`. */
  submittedNet: number | null;
  /** The offer's VAT. Null unless `valueBasis` is `gross`. */
  submittedVat: number | null;
  /** Which addenda/clarifications this submission acknowledges (free text, e.g. "ADD-01..03"). */
  addendaAcknowledged: string | null;
  /** Bid validity date (YYYY-MM-DD) — how long the offer stands. */
  validUntil: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewTenderSubmission {
  tenantId: Id;
  companyId?: Id | null;
  tenderId: Id;
  tenderTitle?: string | null;
  submittedAt?: string | null;
  submittedBy?: Id | null;
  method?: SubmissionMethod | null;
  portal?: string | null;
  reference?: string | null;
  submittedValue?: number;
  /** The approved offer this bid IS. When given, the submission records its basis and parts, and
   * `submittedValue` is the offer's gross total — never a separately supplied number. */
  offer?: SubmittedOffer | null;
  addendaAcknowledged?: string | null;
  validUntil?: string | null;
  notes?: string | null;
  createdBy?: Id | null;
}

export function makeTenderSubmission(input: NewTenderSubmission): TenderSubmission {
  const offer = input.offer ?? null;
  // The parts must BE the whole — the table refuses anything else, and so does this, first.
  if (offer && roundMoney(addMoney(offer.net, offer.vat, 4), 4) !== roundMoney(offer.gross, 4)) {
    throw new Error(`a submitted offer requires its net (${offer.net}) and VAT (${offer.vat}) to add up to its total (${offer.gross})`);
  }
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    tenderId: input.tenderId,
    tenderTitle: input.tenderTitle?.trim() || null,
    submittedAt: input.submittedAt || new Date().toISOString(),
    submittedBy: input.submittedBy ?? null,
    method: input.method ?? 'other',
    portal: input.portal?.trim() || null,
    reference: input.reference?.trim() || null,
    submittedValue: offer ? offer.gross : Number.isFinite(input.submittedValue) ? Number(input.submittedValue) : 0,
    valueBasis: offer ? 'gross' : 'unstated',
    submittedNet: offer ? offer.net : null,
    submittedVat: offer ? offer.vat : null,
    addendaAcknowledged: input.addendaAcknowledged?.trim() || null,
    validUntil: input.validUntil ?? null,
    notes: input.notes?.trim() || null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}
