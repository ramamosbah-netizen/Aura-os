import { type Id, newId } from '@aura/shared';

/**
 * T&C's record that a controlled document is a system's commissioning certificate (TC-GATE-10).
 *
 * The third link of this shape, after the ITP link (TC-GATE-3) and the as-built link (TC-GATE-8),
 * and for the same reason each time: two domains hold halves of one fact and nothing joins them, so
 * a person says the sentence explicitly rather than the code inferring it.
 *
 * WHAT T&C OWNS: the evidence — the test sheet, every run behind every point including the ones that
 * failed first, and the witnessed sign-off. What it has never owned is the DOCUMENT: a number, a
 * revision, an issue date, a place in the register the client is handed. That is document control's,
 * and it stays there. This is one sentence about a register entry, not a document of its own.
 *
 * ONE PER SYSTEM. A system can have several as-built drawings; it has one commissioning certificate,
 * and re-issuing it is a new revision of the same register entry — which document control already
 * models. A second link for one sign-off would not be a richer record, it would be an ambiguous one.
 */
export interface CertificateLink {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  commissioningId: Id;
  projectId: Id;
  /** The DocControl register entry — its id, or the document number a person typed. */
  documentId: string;
  linkedBy: Id | null;
  createdAt: string;
}

export interface NewCertificateLink {
  tenantId: Id;
  companyId?: Id | null;
  commissioningId: Id;
  projectId: Id;
  documentId: string;
  linkedBy?: Id | null;
}

export function makeCertificateLink(input: NewCertificateLink): CertificateLink {
  const documentId = input.documentId?.trim();
  if (!documentId) {
    throw new Error('validation: a controlled document reference is required to register a certificate');
  }
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    commissioningId: input.commissioningId,
    projectId: input.projectId,
    documentId,
    linkedBy: input.linkedBy ?? null,
    createdAt: new Date().toISOString(),
  };
}
