import { randomUUID } from 'node:crypto';

export interface Leave {
  id: string;
  tenantId: string;
  companyId: string | null;
  employeeId: string;
  leaveType: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewLeave {
  tenantId: string;
  companyId?: string | null;
  employeeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  status?: Leave['status'];
  reason?: string | null;
}

export function makeLeave(input: NewLeave): Leave {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    employeeId: input.employeeId,
    leaveType: input.leaveType.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    status: input.status ?? 'pending',
    reason: input.reason ? input.reason.trim() : null,
    createdAt: now,
    updatedAt: now,
  };
}
