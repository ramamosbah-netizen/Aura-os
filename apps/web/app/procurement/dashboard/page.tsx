import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import SimpleDashboard from '../../../components/simple-dashboard';

export const dynamic = 'force-dynamic';

export default async function ProcurementDashboardPage() {
  const rows = (await getJson<Array<{ status?: string; value?: number }>>('/api/procurement/purchase-orders')) ?? [];
  return (
    <div style={st.page}>
      <h1 style={st.h1}>Procurement · Dashboard</h1>
      <p style={st.sub}>Purchase-order spend and counts by status.</p>
      <SimpleDashboard rows={rows} valueLabel="PO Spend" />
    </div>
  );
}
const st = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px' } as CSSProperties,
};
