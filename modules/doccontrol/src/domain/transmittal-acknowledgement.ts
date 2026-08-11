import { randomUUID } from 'node:crypto';

/**
 * The immutable record of a recipient acknowledging a transmittal (G-33): who acknowledged, when,
 * and an optional note. The transmittal head holds the current status; this holds the transaction,
 * so the conveyance trail (who received which revisions and confirmed it) is auditable.
 */
export interface TransmittalAcknowledgement {
  id: string;
  tenantId: string;
  companyId: string | null;
  transmittalId: string;
  transmittalCode: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string;
  note: string | null;
}

export interface NewTransmittalAcknowledgement {
  tenantId: string;
  companyId?: string | null;
  transmittalId: string;
  transmittalCode: string;
  acknowledgedBy?: string | null;
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
    acknowledgedAt: new Date().toISOString(),
    note: input.note?.trim() || null,
  };
}
