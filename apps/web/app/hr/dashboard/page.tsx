import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import SimpleDashboard from '../../../components/simple-dashboard';

export const dynamic = 'force-dynamic';

export default async function HrDashboardPage() {
  const emps = (await getJson<Array<{ department?: string; status?: string }>>('/api/hr/employees')) ?? [];
  const rows = emps.map((e) => ({ status: e.department?.trim() || e.status || 'Unassigned', value: 1 }));
  return (
    <div style={st.page}>
      <h1 style={st.h1}>HR · Dashboard</h1>
      <p style={st.sub}>Headcount by department and workforce distribution.</p>
      <SimpleDashboard rows={rows} valueLabel="Headcount" unit="" />
    </div>
  );
}
const st = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px' } as CSSProperties,
};
