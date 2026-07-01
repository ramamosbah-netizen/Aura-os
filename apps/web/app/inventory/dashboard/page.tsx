import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import SimpleDashboard from '../../../components/simple-dashboard';

export const dynamic = 'force-dynamic';

export default async function InventoryDashboardPage() {
  const items = (await getJson<Array<{ warehouse?: string; quantityOnHand?: number; avgCost?: number }>>('/api/inventory/stock')) ?? [];
  const rows = items.map((i) => ({ status: i.warehouse ?? 'Main', value: (Number(i.quantityOnHand) || 0) * (Number(i.avgCost) || 0) }));
  return (
    <div style={st.page}>
      <h1 style={st.h1}>Inventory · Dashboard</h1>
      <p style={st.sub}>Stock value (on-hand × WAC) and item counts by warehouse.</p>
      <SimpleDashboard rows={rows} valueLabel="Stock Value" />
    </div>
  );
}
const st = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px' } as CSSProperties,
};
