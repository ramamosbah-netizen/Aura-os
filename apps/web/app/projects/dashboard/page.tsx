import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import SimpleDashboard from '../../../components/simple-dashboard';

export const dynamic = 'force-dynamic';

export default async function ProjectsDashboardPage() {
  const rows = (await getJson<Array<{ status?: string; value?: number }>>('/api/projects/projects')) ?? [];
  return (
    <div style={st.page}>
      <h1 style={st.h1}>Projects · Dashboard</h1>
      <p style={st.sub}>Portfolio value and project counts by status.</p>
      <SimpleDashboard rows={rows} valueLabel="Portfolio Value" />
    </div>
  );
}
const st = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px' } as CSSProperties,
};
