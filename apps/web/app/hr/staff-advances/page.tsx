import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import StaffAdvancesClient from '../../../components/staff-advances-client';

export const dynamic = 'force-dynamic';

interface Employee { id: string; firstName?: string; lastName?: string; name?: string }
interface StaffAdvance {
  id: string;
  employeeId: string;
  amount: number;
  reason: string;
  installments: number;
  amountRepaid: number;
  status: string;
  requestDate: string;
}

export default async function StaffAdvancesPage() {
  const [advances, employees] = await Promise.all([
    getJson<StaffAdvance[]>('/api/hr/staff-advances'),
    getJson<Employee[]>('/api/hr/employees'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>HR · Staff Advances</h1>
      <p style={st.sub}>
        Salary advances / staff loans repaid in installments. Request an advance, approve it, disburse the
        funds, then record repayments until it settles. Repayments can never exceed the outstanding balance.
      </p>
      <section style={{ marginTop: 10 }}>
        {advances === null ? (
          <p style={st.muted}>API offline.</p>
        ) : (
          <StaffAdvancesClient initialAdvances={advances ?? []} employees={employees ?? []} />
        )}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
