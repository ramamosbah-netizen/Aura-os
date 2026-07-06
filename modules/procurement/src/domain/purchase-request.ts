import { type Id, type Discipline, newId, toDiscipline } from '@aura/shared';

export type PurchaseRequestStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface PurchaseRequest {
  id: Id;
  tenantId: Id;
  companyId: Id | null;
  reference: string | null;
  title: string;
  projectId: Id | null;
  projectName: string | null;
  /** Shared dimension (ADR-0012) — the trade/discipline this request belongs to. */
  discipline: Discipline;
  status: PurchaseRequestStatus;
  value: number;
  ownerId: Id | null;
  createdAt: string;
  createdBy: Id | null;
}

export interface NewPurchaseRequest {
  tenantId: Id;
  companyId?: Id | null;
  reference?: string | null;
  title: string;
  projectId?: Id | null;
  projectName?: string | null;
  discipline?: Discipline;
  status?: PurchaseRequestStatus;
  value?: number;
  ownerId?: Id | null;
  createdBy?: Id | null;
}

export function makePurchaseRequest(input: NewPurchaseRequest): PurchaseRequest {
  return {
    id: newId(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    reference: input.reference?.trim() || null,
    title: input.title.trim(),
    projectId: input.projectId ?? null,
    projectName: input.projectName ?? null,
    discipline: toDiscipline(input.discipline),
    status: input.status ?? 'draft',
    value: Number.isFinite(input.value) ? Number(input.value) : 0,
    ownerId: input.ownerId ?? null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? null,
  };
}

export const PR_EVENT = {
  prCreated: 'procurement.pr.created',
  prUpdated: 'procurement.pr.updated',
  prSubmitted: 'procurement.pr.submitted',
  prApproved: 'procurement.pr.approved',
  prRejected: 'procurement.pr.rejected',
} as const;
