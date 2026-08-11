import { randomUUID } from 'node:crypto';

export type InspectionStatus = 'requested' | 'in_progress' | 'approved' | 'rejected';

/**
 * IR lifecycle: requested → (in_progress) → approved | rejected. A resolved IR is terminal — it
 * cannot be re-resolved, and a rejected inspection cannot silently flip to approved. `approved`
 * accrues the measured quantity on the Quantity Ledger; `rejected` is the trigger for an NCR.
 */
export const INSPECTION_TRANSITIONS: Record<InspectionStatus, InspectionStatus[]> = {
  requested: ['in_progress', 'approved', 'rejected'],
  in_progress: ['approved', 'rejected'],
  approved: [],
  rejected: [],
};

export class InspectionTransitionError extends Error {
  constructor(from: InspectionStatus, to: InspectionStatus) {
    // "can only" → 409 CONFLICT via the API error taxonomy.
    super(`an inspection in '${from}' can only advance to an allowed next state (attempted → '${to}')`);
    this.name = 'InspectionTransitionError';
  }
}

export function assertInspectionTransition(from: InspectionStatus, to: InspectionStatus): void {
  if (!(INSPECTION_TRANSITIONS[from]?.includes(to) ?? false)) throw new InspectionTransitionError(from, to);
}

export interface InspectionRequest {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  irNumber: string;
  discipline: 'civil' | 'mechanical' | 'electrical' | 'plumbing';
  locationDetail: string;
  inspectionDate: string; // YYYY-MM-DD
  status: InspectionStatus;
  inspectedBy: string | null;
  comments: string | null;
  /** The BOQ (measured) item this inspection covers — where the APPROVED quantity accrues on the
   * Quantity Ledger when the IR is approved. With `approvedQuantity` + `unit`. Nullable + additive. */
  boqItemId: string | null;
  approvedQuantity: number | null;
  unit: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewInspectionRequest {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  irNumber: string;
  discipline: InspectionRequest['discipline'];
  locationDetail: string;
  inspectionDate: string;
  status?: InspectionRequest['status'];
  inspectedBy?: string | null;
  comments?: string | null;
  boqItemId?: string | null;
  approvedQuantity?: number | null;
  unit?: string | null;
}

export function makeInspectionRequest(input: NewInspectionRequest): InspectionRequest {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    irNumber: input.irNumber.trim(),
    discipline: input.discipline,
    locationDetail: input.locationDetail.trim(),
    inspectionDate: input.inspectionDate,
    status: input.status ?? 'requested',
    inspectedBy: input.inspectedBy ?? null,
    comments: input.comments ?? null,
    boqItemId: input.boqItemId ?? null,
    approvedQuantity: input.approvedQuantity != null ? Number(input.approvedQuantity) : null,
    unit: input.unit?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
}
