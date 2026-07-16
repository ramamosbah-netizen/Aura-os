import { type Id, newId } from '@aura/shared';

// Tendering domain — framework-free. T4 (vision §2.2 register depth): the Q&A and change
// traffic between register and submission. Two kinds share one record shape:
//
//   clarification — a question WE raised (or the client answered): RFI-style traffic
//   addendum      — a change the CLIENT issued against the tender documents; acknowledging
//                   it is what a T2 submission's `addendaAcknowledged` refers to
//
// An addendum may move the submission deadline (`deadlineExtendedTo`) — the service mirrors
// that onto the tender, so the register's urgency reads the extended reality, not the
// original date. A record is answered/acknowledged by filling `answer`/`answeredAt`; it is
// never deleted — the paper trail IS the point.

export type ClarificationKind = 'clarification' | 'addendum';

export const CLARIFICATION_KINDS: readonly ClarificationKind[] = ['clarification', 'addendum'];

export interface TenderClarification {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  tenderId: Id;
  kind: ClarificationKind;
  /** The client-side number — "RFI-04", "ADD-02". */
  reference: string | null;
  /** One-line subject. */
  title: string;
  /** The question asked / the change described. */
  body: string | null;
  /** When it was raised/issued (YYYY-MM-DD). */
  issuedAt: string;
  /** When an answer/acknowledgement is due (YYYY-MM-DD). */
  responseDue: string | null;
  /** The answer (clarification) or our acknowledgement note (addendum). */
  answer: string | null;
  answeredAt: string | null;
  /** Addendum only — the new submission deadline it grants (YYYY-MM-DD). */
  deadlineExtendedTo: string | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewTenderClarification {
  tenantId: Id;
  companyId?: Id | null;
  tenderId: Id;
  kind?: ClarificationKind | null;
  reference?: string | null;
  title: string;
  body?: string | null;
  issuedAt?: string | null;
  responseDue?: string | null;
  deadlineExtendedTo?: string | null;
  createdBy?: Id | null;
}

export function makeTenderClarification(input: NewTenderClarification): TenderClarification {
  if (!input.title?.trim()) throw new Error('clarification title is required');
  const kind = input.kind ?? 'clarification';
  if (!CLARIFICATION_KINDS.includes(kind)) throw new Error(`invalid clarification kind "${kind}"`);
  if (input.deadlineExtendedTo && kind !== 'addendum') {
    throw new Error('deadlineExtendedTo is an addendum fact — a clarification cannot move the deadline');
  }
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    tenderId: input.tenderId,
    kind,
    reference: input.reference?.trim() || null,
    title: input.title.trim(),
    body: input.body?.trim() || null,
    issuedAt: input.issuedAt || new Date().toISOString().slice(0, 10),
    responseDue: input.responseDue ?? null,
    answer: null,
    answeredAt: null,
    deadlineExtendedTo: input.deadlineExtendedTo ?? null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

/** Answer (clarification) / acknowledge (addendum) — fills the answer, never rewrites the ask. */
export function withAnswer(c: TenderClarification, answer: string): TenderClarification {
  if (!answer?.trim()) throw new Error('an answer is required');
  return { ...c, answer: answer.trim(), answeredAt: new Date().toISOString() };
}

export const CLARIFICATION_EVENT = {
  recorded: 'tendering.clarification.recorded',
  answered: 'tendering.clarification.answered',
} as const;
