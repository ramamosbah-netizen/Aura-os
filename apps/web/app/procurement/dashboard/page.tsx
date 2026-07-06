import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import SimpleDashboard from '../../../components/simple-dashboard';

export const dynamic = 'force-dynamic';

interface PoRow {
  status?: string;
  value?: number;
  discipline?: string;
}

export default async function ProcurementDashboardPage() {
  const rows = (await getJson<PoRow[]>('/api/procurement/purchase-orders')) ?? [];

  // Spend by discipline (ADR-0012 shared dimension) — one line per trade, value desc.
  const byDiscipline = (() => {
    const m = new Map<string, { count: number; value: number }>();
    for (const r of rows) {
      const key = r.discipline || 'other';
      const cur = m.get(key) ?? { count: 0, value: 0 };
      cur.count += 1;
      cur.value += Number(r.value) || 0;
      m.set(key, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].value - a[1].value);
  })();
  const totalValue = byDiscipline.reduce((s, [, v]) => s + v.value, 0);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Procurement · Dashboard</h1>
      <p style={st.sub}>Purchase-order spend and counts by status.</p>
      <SimpleDashboard rows={rows} valueLabel="PO Spend" />

      <section style={st.panel}>
        <h2 style={st.h2}>Spend by discipline</h2>
        {byDiscipline.length === 0 ? (
          <p style={st.muted}>No purchase orders yet.</p>
        ) : (
          <table style={st.table}>
            <thead>
              <tr>{['Discipline', 'POs', 'Spend', 'Share'].map((h) => (<th key={h} style={st.th}>{h}</th>))}</tr>
            </thead>
            <tbody>
              {byDiscipline.map(([disc, v]) => (
                <tr key={disc}>
                  <td style={st.tdCap}>{disc.replace('_', ' ')}</td>
                  <td style={st.tdNum}>{v.count}</td>
                  <td style={st.tdNum}>{v.value.toLocaleString()}</td>
                  <td style={st.tdNum}>{totalValue > 0 ? `${Math.round((v.value / totalValue) * 100)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  h2: { fontSize: 18, margin: '0 0 12px', fontWeight: 600 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px' } as CSSProperties,
  panel: { marginTop: 28, padding: 20, borderRadius: 12, border: '1px solid var(--border)' } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 14 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontWeight: 600, fontSize: 12.5 } as CSSProperties,
  tdCap: { padding: '8px 10px', borderBottom: '1px solid var(--border)', textTransform: 'capitalize' } as CSSProperties,
  tdNum: { padding: '8px 10px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' } as CSSProperties,
};
