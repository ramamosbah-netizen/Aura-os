import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import EosbClient from '../../../components/eosb-client';

export const dynamic = 'force-dynamic';

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  joinedDate: string;
}

export default async function EosbPage() {
  const employees = (await getJson<Employee[]>('/api/hr/employees')) ?? [];

  return (
    <div style={st.page}>
      <h1 style={st.h1}>HR · End-of-Service Benefit</h1>
      <p style={st.sub}>
        Compute UAE gratuity (unlimited-contract basis): 21 days&apos; basic wage per year for the first
        5 years, 30 days&apos; thereafter; resignation reductions and the 24-month cap applied automatically.
      </p>
      <section style={{ marginTop: 10 }}>
        <EosbClient employees={employees} />
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 760, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', lineHeight: 1.5 } as CSSProperties,
};
