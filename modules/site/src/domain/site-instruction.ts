import { randomUUID } from 'node:crypto';

/**
 * Site Instruction (SI) — a formal instruction issued on site (by the consultant/engineer/client)
 * directing the contractor to do something. Tracked open → acknowledged → closed, flagging whether
 * it carries a cost and/or time implication (the trigger for a variation / EOT claim). Distinct from
 * the daily diary, delay log, and RFI.
 */
export type SiteInstructionStatus = 'open' | 'acknowledged' | 'closed';

export interface SiteInstruction {
  id: string;
  tenantId: string;
  companyId: string | null;
  projectId: string;
  projectName: string | null;
  reference: string;
  issuedBy: string;
  date: string; // YYYY-MM-DD
  instruction: string;
  costImplication: boolean;
  timeImplication: boolean;
  status: SiteInstructionStatus;
  acknowledgedAt: string | null;
  closedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewSiteInstruction {
  tenantId: string;
  companyId?: string | null;
  projectId: string;
  projectName?: string | null;
  reference: string;
  issuedBy: string;
  date: string;
  instruction: string;
  costImplication?: boolean;
  timeImplication?: boolean;
  createdBy?: string | null;
}

export function makeSiteInstruction(input: NewSiteInstruction): SiteInstruction {
  if (!input.projectId) throw new Error('projectId is required');
  if (!input.reference?.trim()) throw new Error('reference is required');
  if (!input.issuedBy?.trim()) throw new Error('issuedBy is required');
  if (!input.instruction?.trim()) throw new Error('instruction is required');
  if (!input.date || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('date must be YYYY-MM-DD');
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    projectId: input.projectId,
    projectName: input.projectName ?? null,
    reference: input.reference.trim(),
    issuedBy: input.issuedBy.trim(),
    date: input.date,
    instruction: input.instruction.trim(),
    costImplication: input.costImplication ?? false,
    timeImplication: input.timeImplication ?? false,
    status: 'open',
    acknowledgedAt: null,
    closedAt: null,
    createdBy: input.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

/** Contractor acknowledges receipt — open → acknowledged. */
export function acknowledgeInstruction(si: SiteInstruction): SiteInstruction {
  if (si.status !== 'open') throw new Error(`cannot acknowledge from status ${si.status}`);
  const now = new Date().toISOString();
  return { ...si, status: 'acknowledged', acknowledgedAt: now, updatedAt: now };
}

/** Instruction actioned & closed out — from open or acknowledged. */
export function closeInstruction(si: SiteInstruction): SiteInstruction {
  if (si.status === 'closed') throw new Error('site instruction already closed');
  const now = new Date().toISOString();
  return { ...si, status: 'closed', closedAt: now, updatedAt: now };
}

export const SITE_INSTRUCTION_EVENT = {
  issued: 'site.instruction.issued',
  acknowledged: 'site.instruction.acknowledged',
  closed: 'site.instruction.closed',
} as const;
