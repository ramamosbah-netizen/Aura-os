import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import ExpenseClaimsClient from '../../../components/expense-claims-client';

export const dynamic = 'force-dynamic';

interface Employee {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
}

interface ExpenseClaim {
  id: string;
  employeeId: string;
  projectId: string | null;
  category: string;
  amount: number;
  expenseDate: string;
  description: string;
  status: string;
  approvedBy: string | null;
  reimbursedDate: string | null;
}

export default async function ExpenseClaimsPage() {
  const [claims, employees] = await Promise.all([
    getJson<ExpenseClaim[]>('/api/hr/expense-claims'),
    getJson<Employee[]>('/api/hr/employees'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>HR · Expense Claims</h1>
      <p style={st.sub}>
        Employee reimbursement requests with a full approval workflow: draft → submitted → approved →
        reimbursed (or rejected). Categorise by travel, fuel, materials, etc.; optionally charge a
        project. Totals show pending approvals and outstanding payout.
      </p>
      <section style={{ marginTop: 10 }}>
        {claims === null ? (
          <p style={st.muted}>API offline.</p>
        ) : (
          <ExpenseClaimsClient initialClaims={claims ?? []} employees={employees ?? []} />
        )}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 980, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 700, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
