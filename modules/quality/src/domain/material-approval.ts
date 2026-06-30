import { randomUUID } from 'node:crypto';

/**
 * Material Approval Request (MAR) — the contractor submits a proposed material (manufacturer,
 * spec, supplier) to the consultant/engineer for approval before procurement/installation.
 * Core UAE QA/QC document. Lifecycle: draft → submitted → approved | approved_as_noted | rejected.
 * A rejected or approved-as-noted MAR can be revised (revision++) back to draft for resubmission.
 */
export type MarStatus = 'draft' | 'submitted' | 'approved' | 'approved_as_noted' | 'rejected';
export type MarDecision = 'approved' | 'approved_as_noted' | 'rejected';

export interface MaterialApproval {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  reference: string;
  materialName: string;
  manufacturer: string;
  supplier: string;
  specification: string;
  discipline: string;
  status: MarStatus;
  revision: number;
  reviewComments: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewMaterialApproval {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  reference: string;
  materialName: string;
  manufacturer?: string;
  supplier?: string;
  specification?: string;
  discipline?: string;
  createdBy?: string | null;
}

const DECISIONS: MarDecision[] = ['approved', 'approved_as_noted', 'rejected'];

export function makeMaterialApproval(input: NewMaterialApproval): MaterialApproval {
  if (!input.projectId) throw new Error('projectId is required');
  if (!input.reference?.trim()) throw new Error('reference is required');
  if (!input.materialName?.trim()) throw new Error('materialName is required');
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    reference: input.reference.trim(),
    materialName: input.materialName.trim(),
    manufacturer: input.manufacturer?.trim() || '',
    supplier: input.supplier?.trim() || '',
    specification: input.specification?.trim() || '',
    discipline: input.discipline?.trim() || 'general',
    status: 'draft',
    revision: 0,
    reviewComments: '',
    reviewedBy: null,
    reviewedAt: null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export function submitMaterialApproval(mar: MaterialApproval): MaterialApproval {
  if (mar.status !== 'draft') throw new Error(`cannot submit from status ${mar.status}`);
  return { ...mar, status: 'submitted', updatedAt: new Date().toISOString() };
}

/** Consultant decision on a submitted MAR: approved / approved_as_noted / rejected, with comments. */
export function reviewMaterialApproval(mar: MaterialApproval, decision: MarDecision, reviewedBy: string | null, comments?: string): MaterialApproval {
  if (mar.status !== 'submitted') throw new Error('can only review a submitted MAR');
  if (!DECISIONS.includes(decision)) throw new Error(`decision must be one of: ${DECISIONS.join(', ')}`);
  if (decision === 'approved_as_noted' || decision === 'rejected') {
    if (!comments?.trim()) throw new Error(`${decision} requires review comments`);
  }
  return {
    ...mar,
    status: decision,
    reviewComments: comments?.trim() || '',
    reviewedBy: reviewedBy ?? null,
    reviewedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Revise a rejected / approved-as-noted MAR for resubmission: bump revision, reset to draft. */
export function reviseMaterialApproval(mar: MaterialApproval): MaterialApproval {
  if (mar.status !== 'rejected' && mar.status !== 'approved_as_noted') {
    throw new Error('can only revise a rejected or approved-as-noted MAR');
  }
  return {
    ...mar,
    status: 'draft',
    revision: mar.revision + 1,
    reviewComments: '',
    reviewedBy: null,
    reviewedAt: null,
    updatedAt: new Date().toISOString(),
  };
}

export const MAR_EVENT = {
  created: 'quality.material_approval.created',
  submitted: 'quality.material_approval.submitted',
  reviewed: 'quality.material_approval.reviewed',
  revised: 'quality.material_approval.revised',
} as const;
