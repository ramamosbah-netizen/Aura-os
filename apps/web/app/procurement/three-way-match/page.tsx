import type { CSSProperties } from 'react';
import Link from 'next/link';
import { getJson } from '@/lib/api';
import EmptyState from '@/components/ui/empty-state';

export const dynamic = 'force-dynamic';

interface MatchRow {
  poId: string; poTitle: string; supplierName: string | null; status: string;
  ordered: number; received: number; invoiced: number; billingExposure: number;
  matchStatus: 'matched' | 'in_progress' | 'over_received' | 'over_invoiced' | 'unbilled';
}

const AED = (n: number) => `AED ${Math.round(n).toLocaleString()}`;
const STATUS_LABEL: Record<MatchRow['matchStatus'], string> = {
  matched: 'Matched', in_progress: 'In progress', over_received: 'Over-received',
  over_invoiced: 'Over-invoiced', unbilled: 'Received · unbilled',
};

export default async function ThreeWayMatchPage() {
  const rows = (await getJson<MatchRow[]>('/api/procurement/three-way-match')) ?? [];

  const exposure = rows.filter((r) => r.matchStatus === 'over_invoiced');
  const totalExposure = exposure.reduce((s, r) => s + Math.max(0, r.billingExposure), 0);
  const unbilled = rows.filter((r) => r.matchStatus === 'unbilled');
  const kpis = [
    { label: 'Purchase orders', value: String(rows.length) },
    { label: 'Fully matched', value: String(rows.filter((r) => r.matchStatus === 'matched').length), good: true },
    { label: 'Over-invoiced', value: String(exposure.length), good: exposure.length === 0 },
    { label: 'Billing exposure', value: AED(totalExposure), good: totalExposure === 0 },
    { label: 'Received · unbilled', value: String(unbilled.length) },
  ];

  const tag = (s: MatchRow['matchStatus']): CSSProperties =>
    s === 'matched' ? st.tagGood : s === 'over_invoiced' || s === 'over_received' ? st.tagBad : s === 'unbilled' ? st.tagInfo : st.tagPending;

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Procurement · 3-Way Match</h1>
      <p style={st.sub}>
        The purchase-control reconciliation: for every PO, what was <b>ordered</b> vs <b>received</b>
        {' '}(goods receipts) vs <b>invoiced</b> (supplier bills). Over-invoiced rows are billed beyond
        what has arrived — the exposure the finance approval rule blocks, surfaced here to catch early.
      </p>

      {rows.length === 0 ? (
        <EmptyState title="No purchase orders to match" description="Once POs are raised and goods received, this reconciliation shows ordered vs received vs invoiced for each." actionHref="/procurement/purchase-orders" actionLabel="Go to Purchase Orders" />
      ) : (
        <>
          <div style={st.kpiRow}>
            {kpis.map((k) => (
              <div key={k.label} style={st.kpiCard}>
                <span style={st.kpiLabel}>{k.label}</span>
                <span style={{ ...st.kpiVal, color: k.good === undefined ? 'var(--text)' : k.good ? 'var(--good)' : 'var(--bad)' }}>{k.value}</span>
              </div>
            ))}
          </div>

          <section style={st.panel}>
            <div style={{ overflowX: 'auto' }}>
              <table style={st.table}>
                <thead>
                  <tr>{['PO', 'Supplier', 'Ordered', 'Received', 'Invoiced', 'Exposure', 'Match'].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.poId} style={r.matchStatus === 'over_invoiced' ? st.rowBad : undefined}>
                      <td style={st.td}><Link href={`/procurement/purchase-orders/${r.poId}`} style={st.plink}>{r.poTitle}</Link></td>
                      <td style={st.tdMuted}>{r.supplierName || '—'}</td>
                      <td style={st.tdNum}>{AED(r.ordered)}</td>
                      <td style={st.tdNum}>{AED(r.received)}</td>
                      <td style={st.tdNum}>{AED(r.invoiced)}</td>
                      <td style={{ ...st.tdNum, color: r.billingExposure > 0 ? 'var(--bad)' : 'var(--muted)', fontWeight: r.billingExposure > 0 ? 700 : 400 }}>
                        {r.billingExposure > 0 ? AED(r.billingExposure) : '—'}
                      </td>
                      <td style={st.td}><span style={tag(r.matchStatus)}>{STATUS_LABEL[r.matchStatus]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
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
  kpiVal: { fontSize: 22, fontWeight: 800, lineHeight: 1.1 } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 16px' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' } as CSSProperties,
  td: { padding: '10px', borderBottom: '1px solid var(--border)', color: 'var(--text)' } as CSSProperties,
  tdMuted: { padding: '10px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', whiteSpace: 'nowrap' } as CSSProperties,
  tdNum: { padding: '10px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: 'var(--text)' } as CSSProperties,
  rowBad: { background: 'var(--bad-soft)' } as CSSProperties,
  plink: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
  tagGood: { fontSize: 11, background: 'var(--good-soft)', color: 'var(--good)', borderRadius: 6, padding: '2px 8px', fontWeight: 600 } as CSSProperties,
  tagBad: { fontSize: 11, background: 'var(--bad-soft)', color: 'var(--bad)', borderRadius: 6, padding: '2px 8px', fontWeight: 600 } as CSSProperties,
  tagInfo: { fontSize: 11, background: 'var(--info-soft)', color: 'var(--info)', borderRadius: 6, padding: '2px 8px', fontWeight: 600 } as CSSProperties,
  tagPending: { fontSize: 11, background: 'var(--warn-soft)', color: 'var(--warn)', borderRadius: 6, padding: '2px 8px', fontWeight: 600 } as CSSProperties,
};
