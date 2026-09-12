import { type Id, newId } from '@aura/shared';

/**
 * T&C's record that a controlled drawing is a particular system's as-built (TC-GATE-8).
 *
 * Document control owns the drawing — its number, revision, title and status. This owns nothing of
 * that. It is one sentence, written by a person: *this register entry is this system's as-built.*
 *
 * It exists because the two sides cannot be joined automatically. A register entry carries
 * `discipline` (architectural | structural | mep | elv | civil | other); a commissioning record
 * carries the canonical `ElvSystem`. Every ELV system on a project shares one discipline, so
 * discipline cannot tell the CCTV as-built from the access-control one, and matching on titles or
 * numbers would be a guess dressed as a fact — the same reasoning that made the ITP link explicit.
 *
 * Only the reference is kept. Number, title, revision and status are read from the register when
 * they are needed, so a drawing that is superseded shows as superseded rather than as whatever it
 * was on the day somebody linked it.
 */
export interface AsBuiltLink {
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

export interface NewAsBuiltLink {
  tenantId: Id;
  companyId?: Id | null;
  commissioningId: Id;
  projectId: Id;
  documentId: string;
  linkedBy?: Id | null;
}

export function makeAsBuiltLink(input: NewAsBuiltLink): AsBuiltLink {
  const documentId = input.documentId?.trim();
  if (!documentId) throw new Error('validation: a controlled document reference is required to link an as-built drawing');
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
