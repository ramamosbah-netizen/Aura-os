import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import EmptyState from '@/components/ui/empty-state';

export const dynamic = 'force-dynamic';

interface Bucket { key: string; count: number; value: number }
interface SpendAnalytics {
  totalSpend: number; poCount: number; committedSpend: number; draftSpend: number;
  byStatus: Bucket[]; bySupplier: Bucket[]; byProject: Bucket[]; byMonth: Bucket[];
}

const AED = (n: number) => `AED ${Math.round(n).toLocaleString()}`;

function BarList({ title, rows, accent }: { title: string; rows: Bucket[]; accent?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section style={st.panel}>
      <h3 style={st.panelTitle}>{title}</h3>
      {rows.length === 0 ? (
        <p style={st.muted}>No data.</p>
      ) : (
        <div style={st.barList}>
          {rows.map((r) => (
            <div key={r.key} style={st.barRow}>
              <span style={st.barLabel} title={r.key}>{r.key}</span>
              <div style={st.barTrack}>
                <div style={{ ...st.barFill, width: `${Math.max(2, (r.value / max) * 100)}%`, background: accent ?? 'var(--accent)' }} />
              </div>
              <span style={st.barVal}>{AED(r.value)}<span style={st.barCount}> · {r.count}</span></span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', pending_approval: 'Pending approval', approved: 'Approved',
  issued: 'Issued', received: 'Received', closed: 'Closed',
};

export default async function SpendAnalyticsPage() {
  const a = await getJson<SpendAnalytics>('/api/procurement/spend-analytics');

  if (!a || a.poCount === 0) {
    return (
      <div style={st.page}>
        <h1 style={st.h1}>Procurement · Spend Analytics</h1>
        <EmptyState title="No purchase orders yet" description="Once POs are raised, this shows total & committed spend broken down by status, supplier, project and month." actionHref="/procurement/purchase-orders" actionLabel="Go to Purchase Orders" />
      </div>
    );
  }

  const committedPct = a.totalSpend > 0 ? Math.round((a.committedSpend / a.totalSpend) * 100) : 0;
  const kpis = [
    { label: 'Total PO spend', value: AED(a.totalSpend) },
    { label: 'Committed', value: AED(a.committedSpend), hint: `${committedPct}% of total` },
    { label: 'Draft / pending', value: AED(a.draftSpend) },
    { label: 'Purchase orders', value: String(a.poCount) },
    { label: 'Suppliers', value: String(a.bySupplier.length) },
  ];

  const monthLabel = (k: string) => {
    const [y, m] = k.split('-');
    return `${['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m)] ?? m} ${y?.slice(2)}`;
  };
  const byStatus = a.byStatus.map((b) => ({ ...b, key: STATUS_LABEL[b.key] ?? b.key }));
  const byMonth = a.byMonth.map((b) => ({ ...b, key: monthLabel(b.key) }));

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Procurement · Spend Analytics</h1>
      <p style={st.sub}>
        Where the money is going: total and committed PO spend, broken down by status, supplier,
        project and month. Committed = approved/issued/received/closed (real obligations).
      </p>

      <div style={st.kpiRow}>
        {kpis.map((k) => (
          <div key={k.label} style={st.kpiCard}>
            <span style={st.kpiLabel}>{k.label}</span>
            <span style={st.kpiVal}>{k.value}</span>
            {k.hint ? <span style={st.kpiHint}>{k.hint}</span> : null}
          </div>
        ))}
      </div>

      <div style={st.cols}>
        <BarList title="Top suppliers by spend" rows={a.bySupplier} />
        <BarList title="Spend by project" rows={a.byProject} accent="var(--info)" />
      </div>
      <div style={st.cols}>
        <BarList title="Spend by status" rows={byStatus} accent="var(--good)" />
        <BarList title="Monthly spend (last 12)" rows={byMonth} accent="var(--warn)" />
      </div>
    </div>
  );
}

const st = {
  page: { maxWidth: 1240, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 760, lineHeight: 1.5 } as CSSProperties,
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 22 } as CSSProperties,
  kpiCard: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '15px 17px', display: 'flex', flexDirection: 'column', gap: 5 } as CSSProperties,
  kpiLabel: { fontSize: 11.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 } as CSSProperties,
  kpiVal: { fontSize: 22, fontWeight: 800, lineHeight: 1.1, color: 'var(--text)' } as CSSProperties,
  kpiHint: { fontSize: 11.5, color: 'var(--muted)' } as CSSProperties,
  cols: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, marginBottom: 14 } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px' } as CSSProperties,
  panelTitle: { fontSize: 14, fontWeight: 700, margin: '0 0 12px', color: 'var(--text)' } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  barList: { display: 'flex', flexDirection: 'column', gap: 9 } as CSSProperties,
  barRow: { display: 'grid', gridTemplateColumns: '130px 1fr auto', gap: 10, alignItems: 'center' } as CSSProperties,
  barLabel: { fontSize: 12.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as CSSProperties,
  barTrack: { height: 8, background: 'var(--border)', borderRadius: 999, overflow: 'hidden' } as CSSProperties,
  barFill: { height: '100%', borderRadius: 999 } as CSSProperties,
  barVal: { fontSize: 12, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as CSSProperties,
  barCount: { color: 'var(--muted)' } as CSSProperties,
};
