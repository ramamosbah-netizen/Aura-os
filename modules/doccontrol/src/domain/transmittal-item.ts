import { randomUUID } from 'node:crypto';

/**
 * Transmittal Item — one line on a transmittal conveying a drawing-register document at a
 * specific revision. This is the transmittal↔register linkage: the register row only holds
 * the CURRENT revision; who received which revision when is the trail of transmittal items.
 */
export type TransmittalPurpose = 'for_information' | 'for_review' | 'for_approval' | 'for_construction';

export const TRANSMITTAL_PURPOSES: readonly TransmittalPurpose[] = [
  'for_information',
  'for_review',
  'for_approval',
  'for_construction',
];

export interface TransmittalItem {
  id: string;
  tenantId: string;
  companyId: string | null;
  transmittalId: string;
  registerEntryId: string;
  /** Snapshots from the register at conveyance time. */
  documentNumber: string;
  title: string;
  /** The revision conveyed by this transmittal. */
  revision: string;
  purpose: TransmittalPurpose;
  createdAt: string;
}

export interface NewTransmittalItem {
  tenantId: string;
  companyId?: string | null;
  transmittalId: string;
  registerEntryId: string;
  documentNumber: string;
  title: string;
  revision: string;
  purpose?: TransmittalPurpose;
}

export function makeTransmittalItem(input: NewTransmittalItem): TransmittalItem {
  if (!input.transmittalId) throw new Error('transmittalId is required');
  if (!input.registerEntryId) throw new Error('registerEntryId is required');
  if (!input.revision?.trim()) throw new Error('revision is required');
  const purpose = input.purpose ?? 'for_information';
  if (!TRANSMITTAL_PURPOSES.includes(purpose)) {
    throw new Error(`purpose must be one of: ${TRANSMITTAL_PURPOSES.join(', ')}`);
  }
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    transmittalId: input.transmittalId,
    registerEntryId: input.registerEntryId,
    documentNumber: input.documentNumber.trim(),
    title: input.title.trim(),
    revision: input.revision.trim(),
    purpose,
    createdAt: new Date().toISOString(),
  };
}

/** One row of a register entry's revision history — an item joined to its transmittal head. */
export interface RevisionHistoryRow {
  revision: string;
  purpose: TransmittalPurpose;
  transmittalId: string;
  transmittalCode: string;
  transmittalTitle: string;
  recipient: string | null;
  transmittalStatus: string;
  sentAt: string;
}
