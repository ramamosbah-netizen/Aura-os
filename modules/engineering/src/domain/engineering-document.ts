import { type Id, newId } from '@aura/shared';
import { type Discipline, toDiscipline } from './discipline';

// Engineering domain — framework-free. Realises ADR-0011 point-6: a Method Statement, Risk
// Assessment, Specification, Calc Sheet, Test Report and Work Procedure are NOT separate modules —
// they are one aggregate (`EngineeringDocument`) discriminated by `docType`, sharing ONE lifecycle
// (draft → submitted → approved/rejected), ONE revision scheme and the shared `discipline`
// dimension. Type-specific data lives in `fields` (the form-engine payload; ADR-0006 forms-are-JSON),
// so a new document type is a new form schema — not new code.
//
// Ownership (ADR-0012 / user decision): most types are owned by Engineering, but a Risk Assessment
// is owned by HSE (Engineering only *originates* the draft). `ownerModuleOf` encodes that, and the
// owning module is the one allowed to move it past submission.

export type DocType =
  | 'method_statement'
  | 'risk_assessment'
  | 'specification'
  | 'calc_sheet'
  | 'test_report'
  | 'work_procedure';

export type OwnerModule = 'engineering' | 'hse';
export type DocumentStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

/** docType → its human label, owning module, and the form-engine schema id that drives its fields. */
export const DOC_TYPES: Record<DocType, { label: string; ownerModule: OwnerModule; formSchemaId: string }> = {
  method_statement: { label: 'Method Statement', ownerModule: 'engineering', formSchemaId: 'engineering.method_statement' },
  risk_assessment: { label: 'Risk Assessment', ownerModule: 'hse', formSchemaId: 'engineering.risk_assessment' },
  specification: { label: 'Specification', ownerModule: 'engineering', formSchemaId: 'engineering.specification' },
  calc_sheet: { label: 'Calculation Sheet', ownerModule: 'engineering', formSchemaId: 'engineering.calc_sheet' },
  test_report: { label: 'Test Report', ownerModule: 'engineering', formSchemaId: 'engineering.test_report' },
  work_procedure: { label: 'Work Procedure', ownerModule: 'engineering', formSchemaId: 'engineering.work_procedure' },
};

export function isDocType(v: string | null | undefined): v is DocType {
  return !!v && Object.prototype.hasOwnProperty.call(DOC_TYPES, v);
}

/** The module that owns a doc type's process (HSE for risk assessments, else Engineering). */
export function ownerModuleOf(docType: DocType): OwnerModule {
  return DOC_TYPES[docType].ownerModule;
}

export interface EngineeringDocument {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  code: string;
  title: string;
  docType: DocType;
  ownerModule: OwnerModule;
  discipline: Discipline;
  status: DocumentStatus;
  revision: string;
  /** Type-specific data — the form-engine payload for this docType's schema. */
  fields: Record<string, unknown>;
  projectId: Id;
  projectName: string | null;
  ownerId: Id | null;
  createdBy: Id | null;
  decidedBy: Id | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewEngineeringDocument {
  tenantId: Id;
  companyId?: Id | null;
  code: string;
  title: string;
  docType: DocType;
  discipline?: Discipline;
  status?: DocumentStatus;
  revision?: string;
  fields?: Record<string, unknown>;
  projectId: Id;
  projectName?: string | null;
  ownerId?: Id | null;
  createdBy?: Id | null;
}

export function makeEngineeringDocument(input: NewEngineeringDocument): EngineeringDocument {
  if (!isDocType(input.docType)) throw new Error(`unknown docType: ${input.docType}`);
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    code: input.code.trim(),
    title: input.title.trim(),
    docType: input.docType,
    ownerModule: ownerModuleOf(input.docType),
    discipline: toDiscipline(input.discipline),
    status: input.status ?? 'draft',
    revision: input.revision?.trim() || 'A',
    fields: input.fields ?? {},
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    ownerId: input.ownerId ?? null,
    createdBy: input.createdBy ?? null,
    decidedBy: null,
    decidedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Move a document along its shared lifecycle, stamping the decider on approve/reject. */
export function transitionDocument(doc: EngineeringDocument, status: DocumentStatus, actorId: Id | null): EngineeringDocument {
  const decided = status === 'approved' || status === 'rejected';
  return {
    ...doc,
    status,
    decidedBy: decided ? (actorId ?? doc.decidedBy) : doc.decidedBy,
    decidedAt: decided ? new Date().toISOString() : doc.decidedAt,
    updatedAt: new Date().toISOString(),
  };
}

export const ENGINEERING_DOCUMENT_EVENT = {
  created: 'engineering.document.created',
  submitted: 'engineering.document.submitted',
  approved: 'engineering.document.approved',
  rejected: 'engineering.document.rejected',
} as const;
