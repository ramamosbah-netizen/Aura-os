import { randomUUID } from 'node:crypto';

/**
 * The immutable record of a recipient acknowledging a transmittal (G-33): WHOSE receipt it is,
 * WHO ENTERED IT, when, and an optional note. The transmittal head holds the current status; this
 * holds the transaction, so the conveyance trail is auditable.
 *
 * The two names are separate on purpose. A client confirms outside AURA and the Document
 * Controller records it — the ENG-04 shape — so `acknowledgedBy` is the party whose receipt this
 * is and `recordedBy` is whoever wrote it down. One field would credit an internal user with a
 * client's word.
 */
export interface TransmittalAcknowledgement {
  id: string;
  tenantId: string;
  companyId: string | null;
  transmittalId: string;
  transmittalCode: string;
  /** WHOSE receipt this is — the named recipient on the distribution. */
  acknowledgedBy: string | null;
  /** WHO ENTERED IT. Null when the recipient answered in AURA themselves. */
  recordedBy: string | null;
  acknowledgedAt: string;
  note: string | null;
}

export interface NewTransmittalAcknowledgement {
  tenantId: string;
  companyId?: string | null;
  transmittalId: string;
  transmittalCode: string;
  acknowledgedBy?: string | null;
  recordedBy?: string | null;
  note?: string | null;
}

export function makeTransmittalAcknowledgement(input: NewTransmittalAcknowledgement): TransmittalAcknowledgement {
  if (!input.transmittalId) throw new Error('transmittalId is required');
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    transmittalId: input.transmittalId,
    transmittalCode: input.transmittalCode,
    acknowledgedBy: input.acknowledgedBy ?? null,
    recordedBy: input.recordedBy ?? null,
    acknowledgedAt: new Date().toISOString(),
    note: input.note?.trim() || null,
  };
}
