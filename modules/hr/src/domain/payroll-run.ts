import { randomUUID } from 'node:crypto';

export interface PayrollRun {
  id: string;
  tenantId: string;
  companyId: string | null;
  employeeId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  basicSalary: number;
  allowances: number;
  deductions: number;
  netSalary: number;
  status: 'draft' | 'approved' | 'paid';
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewPayrollRun {
  tenantId: string;
  companyId?: string | null;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  basicSalary: number;
  allowances: number;
  deductions: number;
  status?: PayrollRun['status'];
  processedAt?: string | null;
}

export function makePayrollRun(input: NewPayrollRun): PayrollRun {
  const now = new Date().toISOString();
  const netSalary = Number((input.basicSalary + input.allowances - input.deductions).toFixed(2));
  return {
    id: randomUUID(),
    tenantId: input.tenantId,
    companyId: input.companyId ?? null,
    employeeId: input.employeeId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    basicSalary: input.basicSalary,
    allowances: input.allowances,
    deductions: input.deductions,
    netSalary,
    status: input.status ?? 'draft',
    processedAt: input.processedAt ?? null,
    createdAt: now,
    updatedAt: now,
  };
}
