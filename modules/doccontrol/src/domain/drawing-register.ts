import { randomUUID } from 'node:crypto';

/**
 * Drawing / Document Register — the controlled register of every drawing and document on a
 * project: its number, current revision, status, custodian, and distribution list. This is the
 * single source of truth for "what is the latest revision and who has it" (the distribution
 * matrix). Distinct from a submittal (a review transaction) or a transmittal (a conveyance).
 */
export type RegisterDocType = 'drawing' | 'specification' | 'document' | 'bod' | 'calculation';
export type RegisterStatus = 'draft' | 'for_review' | 'for_construction' | 'superseded' | 'as_built';
export type RegisterDiscipline = 'architectural' | 'structural' | 'mep' | 'elv' | 'civil' | 'other';

export interface DrawingRegisterEntry {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  documentNumber: string;
  title: string;
  discipline: RegisterDiscipline;
  docType: RegisterDocType;
  currentRevision: string;
  status: RegisterStatus;
  custodian: string | null;
  /** Distribution matrix — who currently holds/receives this document. */
  distribution: string[];
  revisionDate: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewDrawingRegisterEntry {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  documentNumber: string;
  title: string;
  discipline?: RegisterDiscipline;
  docType?: RegisterDocType;
  currentRevision?: string;
  status?: RegisterStatus;
  custodian?: string | null;
  distribution?: string[];
  revisionDate?: string | null;
  createdBy?: string | null;
}

export function makeDrawingRegisterEntry(input: NewDrawingRegisterEntry): DrawingRegisterEntry {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    documentNumber: input.documentNumber.trim(),
    title: input.title.trim(),
    discipline: input.discipline ?? 'other',
    docType: input.docType ?? 'drawing',
    currentRevision: (input.currentRevision ?? 'A').trim(),
    status: input.status ?? 'draft',
    custodian: input.custodian?.trim() || null,
    distribution: input.distribution ?? [],
    revisionDate: input.revisionDate ?? null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Issue a new revision — bumps the revision label + status, keeps the register row (history is by transmittal). */
export function reviseRegisterEntry(entry: DrawingRegisterEntry, revision: string, status: RegisterStatus, revisionDate?: string): DrawingRegisterEntry {
  return {
    ...entry,
    currentRevision: revision.trim(),
    status,
    revisionDate: revisionDate ?? new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString(),
  };
}
