'use client';

import { type CSSProperties } from 'react';
import { BarList, Donut } from './charts';

interface Row { status?: string; value?: number }

/** Generic list→dashboard: KPIs (count, total value) + value-by-status bar + count-by-status donut. */
export default function SimpleDashboard({ rows, valueLabel = 'Total Value', unit = 'AED' }: { rows: Row[]; valueLabel?: string; unit?: string }) {
  const total = rows.reduce((s, r) => s + (Number(r.value) || 0), 0);
  const byStatusValue = new Map<string, number>();
  const byStatusCount = new Map<string, number>();
  for (const r of rows) {
    const st2 = r.status ?? 'unknown';
    byStatusValue.set(st2, (byStatusValue.get(st2) ?? 0) + (Number(r.value) || 0));
    byStatusCount.set(st2, (byStatusCount.get(st2) ?? 0) + 1);
  }
  const money = (n: number) => `${unit} ${n.toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;

  return (
    <div>
      <div style={s.kpis}>
        <div style={s.kpi}><div style={s.kpiLabel}>Records</div><div style={s.kpiVal}>{rows.length}</div></div>
        <div style={s.kpi}><div style={s.kpiLabel}>{valueLabel}</div><div style={{ ...s.kpiVal, color: 'var(--accent)' }}>{money(total)}</div></div>
      </div>
      <div style={s.grid}>
        <div style={s.card}><div style={s.cardTitle}>Value by status</div>
          <BarList data={[...byStatusValue].map(([label, value]) => ({ label, value }))} unit={unit} /></div>
        <div style={s.card}><div style={s.cardTitle}>Count by status</div>
          <Donut data={[...byStatusCount].map(([label, value]) => ({ label, value }))} /></div>
      </div>
    </div>
  );
}

const s = {
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 12, marginBottom: 16 } as CSSProperties,
  kpi: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' } as CSSProperties,
  kpiLabel: { color: 'var(--muted)', fontSize: 12.5 } as CSSProperties,
  kpiVal: { fontSize: 22, fontWeight: 700, letterSpacing: -0.4, marginTop: 4 } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))', gap: 12 } as CSSProperties,
  card: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' } as CSSProperties,
  cardTitle: { fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--muted)' } as CSSProperties,
};
