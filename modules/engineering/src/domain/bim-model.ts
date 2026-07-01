import { type Id, newId } from '@aura/shared';

// Engineering domain — framework-free. A BimModel is a registered 3D/BIM model file (IFC, Revit,
// Navisworks, DWG) for a project discipline. It is the data backbone the in-browser model viewer
// consumes: a versioned catalogue entry pointing at the stored file (object-store key / URL),
// with a federation group so discipline models can be viewed together.

export type ModelFormat = 'ifc' | 'rvt' | 'nwd' | 'nwc' | 'dwg' | 'glb' | 'other';
export type ModelStatus = 'wip' | 'shared' | 'published' | 'archived';
export type ModelDiscipline = 'architectural' | 'structural' | 'mep' | 'elv' | 'civil' | 'coordination' | 'other';

export interface BimModel {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  projectId: Id;
  projectName: string | null;
  code: string;
  name: string;
  discipline: ModelDiscipline;
  format: ModelFormat;
  /** Object-store key (S3/GCS) for the model bytes; the viewer resolves a signed URL from it. */
  storageKey: string | null;
  /** Direct URL when the file is already web-addressable (e.g. a converted .glb/IFC on a CDN). */
  fileUrl: string | null;
  version: number;
  revision: string;
  status: ModelStatus;
  fileSizeBytes: number | null;
  /** Federation group — models sharing a group are loaded together in the coordination view. */
  federationGroup: string | null;
  notes: string | null;
  uploadedBy: Id | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewBimModel {
  tenantId: Id;
  companyId?: Id | null;
  projectId: Id;
  projectName?: string | null;
  code: string;
  name: string;
  discipline?: ModelDiscipline;
  format?: ModelFormat;
  storageKey?: string | null;
  fileUrl?: string | null;
  revision?: string;
  status?: ModelStatus;
  fileSizeBytes?: number | null;
  federationGroup?: string | null;
  notes?: string | null;
  uploadedBy?: Id | null;
}

export function makeBimModel(input: NewBimModel): BimModel {
  const now = new Date().toISOString();
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    code: input.code.trim(),
    name: input.name.trim(),
    discipline: input.discipline ?? 'other',
    format: input.format ?? 'ifc',
    storageKey: input.storageKey?.trim() || null,
    fileUrl: input.fileUrl?.trim() || null,
    version: 1,
    revision: (input.revision ?? 'A').trim(),
    status: input.status ?? 'wip',
    fileSizeBytes: input.fileSizeBytes ?? null,
    federationGroup: input.federationGroup?.trim() || null,
    notes: input.notes?.trim() || null,
    uploadedBy: input.uploadedBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Upload a new version — bumps version + revision and repoints the file, keeping the registry row. */
export function bumpModelVersion(
  model: BimModel,
  patch: { revision: string; storageKey?: string | null; fileUrl?: string | null; fileSizeBytes?: number | null; status?: ModelStatus },
): BimModel {
  return {
    ...model,
    version: model.version + 1,
    revision: patch.revision.trim(),
    storageKey: patch.storageKey?.trim() ?? model.storageKey,
    fileUrl: patch.fileUrl?.trim() ?? model.fileUrl,
    fileSizeBytes: patch.fileSizeBytes ?? model.fileSizeBytes,
    status: patch.status ?? model.status,
    updatedAt: new Date().toISOString(),
  };
}

export const BIM_MODEL_EVENT = {
  registered: 'engineering.bim_model.registered',
  versioned: 'engineering.bim_model.versioned',
} as const;
