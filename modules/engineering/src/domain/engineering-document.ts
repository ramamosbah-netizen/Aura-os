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

/**
 * A document type's **Definition** (ADR-0017, metadata-driven definitions): the metadata each
 * capability needs, bound to the type in one place. Capabilities read `getDocumentDefinition(type)
 * .<slice>` and stay type-agnostic — no capability branches on the docType literal. A definition is
 * *data, not behaviour*: it names ids (form schema, workflow) the platform capability resolves.
 * Adding a document type = adding a definition here + a form schema — no capability code changes.
 */
export interface DocumentDefinition {
  docType: DocType;
  label: string;
  /** module that owns the type's process (HSE for risk assessments, else Engineering). */
  ownerModule: OwnerModule;
  /** form-engine schema id driving the type-specific fields (ADR-0006). */
  formSchemaId: string;
  /** workflow the document runs through — the genuinely per-type behaviour hook. */
  workflow: string;
}

const def = (docType: DocType, label: string, ownerModule: OwnerModule, workflow: string): DocumentDefinition => ({
  docType, label, ownerModule, formSchemaId: `engineering.${docType}`, workflow,
});

export const DOCUMENT_DEFINITIONS: Record<DocType, DocumentDefinition> = {
  method_statement: def('method_statement', 'Method Statement', 'engineering', 'engineering-review'),
  risk_assessment: def('risk_assessment', 'Risk Assessment', 'hse', 'hse-review'),
  specification: def('specification', 'Specification', 'engineering', 'engineering-review'),
  calc_sheet: def('calc_sheet', 'Calculation Sheet', 'engineering', 'engineering-review'),
  test_report: def('test_report', 'Test Report', 'engineering', 'engineering-review'),
  work_procedure: def('work_procedure', 'Work Procedure', 'engineering', 'engineering-review'),
};

export function isDocType(v: string | null | undefined): v is DocType {
  return !!v && Object.prototype.hasOwnProperty.call(DOCUMENT_DEFINITIONS, v);
}

/** The single source of behaviour metadata for a document type. */
export function getDocumentDefinition(docType: DocType): DocumentDefinition {
  return DOCUMENT_DEFINITIONS[docType];
}

/** The module that owns a doc type's process (reads the definition — never a switch). */
export function ownerModuleOf(docType: DocType): OwnerModule {
  return getDocumentDefinition(docType).ownerModule;
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
