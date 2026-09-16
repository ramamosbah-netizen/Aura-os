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
  /** Free text, retained for requests raised before suppliers were linked canonically. */
  supplier: string;
  /**
   * The canonical supplier this material comes from.
   *
   * The procurement gate matched on the free-text `supplier` alone, which is the same defect a
   * free-text WBS code was on a delay and a free-text drawing reference on a technical query: two
   * suppliers share a name, one supplier gets typed three ways, and the link silently misses.
   */
  supplierId: string | null;
  specification: string;
  discipline: string;
  status: MarStatus;
  revision: number;
  reviewComments: string;
  /**
   * The AURA user who RECORDED the decision — not the person who made it.
   *
   * A material approval is decided by the consultant or engineer of record, who is external to this
   * system: the header above says the contractor submits the material TO them. AURA captures no
   * consultant identity on this record, and it is not going to be invented here. Commissioning shows
   * what capturing one looks like when a module means it — a named field for "the consultant/client
   * representative who witnessed sign-off" — and this record has no such field.
   *
   * So the honest reading everywhere this surfaces is RECORDED BY, and the status is the consultant's
   * decision as reported. Calling this actor the approver would put an AURA user's name against a
   * decision they did not make, on a document a project is built to.
   */
  reviewedBy: string | null;
  /** When the decision was recorded in AURA. Not necessarily when the consultant made it. */
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
  supplierId?: string | null;
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
    supplierId: input.supplierId ?? null,
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

/**
 * RECORD the consultant's decision on a submitted MAR: approved / approved_as_noted / rejected.
 *
 * `reviewedBy` is the AURA user entering it, not the consultant who decided it — see the field's
 * own note. The decision is theirs; the record of it is ours.
 */
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
