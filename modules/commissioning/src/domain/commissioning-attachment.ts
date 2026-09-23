import { randomUUID } from 'node:crypto';

/**
 * WHAT A WITNESSED TEST PRODUCED.
 *
 * TC-07 is "Witness signature AND ATTACHMENTS". The signature has existed since the sign-off
 * evidence table; the attachments never did. Every multipart route in AURA was in CRM, Tendering,
 * DocControl, Site and Quality — commissioning had none, so a witnessed test could carry no
 * instrument printout, no photograph of the installed device and no calibration certificate. The
 * evidence a test actually produces had nowhere to go.
 *
 * SEPARATE FROM THE SIGN-OFF EVIDENCE, deliberately. A signature belongs to a PARTY and carries a
 * method, a signatory, an authority and the result it covers; an attachment belongs to the RECORD
 * and carries none of those. Folding them together would give every attachment a nullable party
 * and every signature a nullable description, and a surface reading either would have to guess
 * which kind it had.
 */

export type AttachmentCategory = 'photo' | 'instrument' | 'certificate' | 'other';

export const ATTACHMENT_CATEGORIES: readonly AttachmentCategory[] = ['photo', 'instrument', 'certificate', 'other'];

export const ATTACHMENT_CATEGORY_LABEL: Record<AttachmentCategory, string> = {
  photo: 'Photograph',
  instrument: 'Instrument output',
  certificate: 'Calibration certificate',
  other: 'Attachment',
};

export interface CommissioningAttachment {
  id: string;
  tenantId: string;
  companyId: string | null;
  commissioningId: string;
  projectId: string;
  fileId: string;
  /** What the file IS, so no surface has to guess it from a free-text description. */
  category: AttachmentCategory;
  description: string | null;
  /**
   * WHO RECORDED IT. Never presented as a signatory — an attachment has none, which is exactly
   * why it is not filed with the signatures.
   */
  capturedBy: string | null;
  /** The checksum the server computed over the bytes it received. */
  hash: string | null;
  createdAt: string;
}

export interface NewCommissioningAttachment {
  tenantId: string;
  companyId?: string | null;
  commissioningId: string;
  projectId: string;
  fileId: string;
  category?: AttachmentCategory;
  description?: string | null;
  capturedBy?: string | null;
  hash?: string | null;
}

export function makeCommissioningAttachment(input: NewCommissioningAttachment): CommissioningAttachment {
  if (!input.fileId?.trim()) throw new Error('validation: fileId is required');
  const category = input.category ?? 'photo';
  if (!ATTACHMENT_CATEGORIES.includes(category)) {
    throw new Error(`validation: an attachment category must be one of ${ATTACHMENT_CATEGORIES.join(', ')}`);
  }
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    commissioningId: input.commissioningId,
    projectId: input.projectId,
    fileId: input.fileId.trim(),
    category,
    description: input.description?.trim() || null,
    capturedBy: input.capturedBy?.trim() || null,
    hash: input.hash?.trim() || null,
    createdAt: new Date().toISOString(),
  };
}
