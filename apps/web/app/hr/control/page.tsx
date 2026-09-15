import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import HrControlClient from '../../../components/hr-control-client';

export const dynamic = 'force-dynamic';

interface Employee {
  id: string;
  tenantId: string;
  companyId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  role: string;
  department: string;
  status: 'active' | 'suspended' | 'terminated';
  joinedDate: string;
  visaExpiry: string | null;
  permitExpiry: string | null;
  laborCamp: string | null;
  /** The platform account this person signs in with (migration 0317); null for most of headcount. */
  userId: string | null;
  userLinkedAt: string | null;
  userLinkedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Leave {
  id: string;
  tenantId: string;
  companyId: string | null;
  employeeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PayrollRun {
  id: string;
  tenantId: string;
  companyId: string | null;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  basicSalary: number;
  allowances: number;
  deductions: number;
  netSalary: number;
  status: 'draft' | 'approved' | 'paid';
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PlatformUser {
  userId: string;
  displayName: string;
  email: string;
  active: boolean;
}

export default async function HrControlPage() {
  const [employees, leaves, payrollRuns, accounts] = await Promise.all([
    getJson<Employee[]>('/api/hr/employees'),
    getJson<Leave[]>('/api/hr/leaves'),
    getJson<PayrollRun[]>('/api/hr/payroll'),
    // Null when this reader may not administer users — the link control then explains itself
    // rather than offering a picker that would refuse every choice.
    getJson<{ users: PlatformUser[] }>('/api/admin/users'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>HR & Payroll</h1>
      <p style={st.sub}>
        Manage employee profiles, leave requests, UAE visa/permits monitoring, and run monthly payroll processing with double-entry allocations.
      </p>

      <HrControlClient
        initialEmployees={employees ?? []}
        initialLeaves={leaves ?? []}
        initialPayrollRuns={payrollRuns ?? []}
        accounts={accounts?.users?.filter((user) => user.active) ?? null}
      />
    </div>
  );
}

const st = {
  page: { maxWidth: 1020, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 640, lineHeight: 1.5 } as CSSProperties,
};
