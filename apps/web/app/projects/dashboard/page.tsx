import type { CSSProperties } from 'react';
import Link from 'next/link';
import { getJson } from '@/lib/api';
import EmptyState from '@/components/ui/empty-state';

export const dynamic = 'force-dynamic';

interface Evm {
  plannedValue: number; earnedValue: number; actualCost: number;
  costVariance: number; scheduleVariance: number; cpi: number; spi: number;
}
interface PortfolioRow {
  id: string; title: string; status: 'planned' | 'active' | 'completed' | 'cancelled';
  value: number; accountName: string | null; contractTitle: string | null;
  evm: Evm; atRisk: boolean;
}

const AED = (n: number) => `AED ${Math.round(n).toLocaleString()}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;

export default async function ProjectsDashboardPage() {
  const rows = (await getJson<PortfolioRow[]>('/api/projects/projects/portfolio')) ?? [];

  const active = rows.filter((r) => r.status === 'active');
  const totalValue = rows.reduce((s, r) => s + (r.value || 0), 0);
  const pv = rows.reduce((s, r) => s + r.evm.plannedValue, 0);
  const ev = rows.reduce((s, r) => s + r.evm.earnedValue, 0);
  const ac = rows.reduce((s, r) => s + r.evm.actualCost, 0);
  const portfolioSpi = pv > 0 ? ev / pv : 1;
  const portfolioCpi = ac > 0 ? ev / ac : 1;
  const atRisk = rows.filter((r) => r.atRisk);

  const kpis = [
    { label: 'Portfolio value', value: AED(totalValue) },
    { label: 'Active projects', value: String(active.length) },
    { label: 'Portfolio completion', value: pct(pv > 0 ? ev / pv : 0), hint: `${AED(ev)} earned of ${AED(pv)}` },
    { label: 'Schedule (SPI)', value: portfolioSpi.toFixed(2), good: portfolioSpi >= 1 },
    { label: 'Cost (CPI)', value: portfolioCpi.toFixed(2), good: portfolioCpi >= 1 },
    { label: 'At risk', value: String(atRisk.length), good: atRisk.length === 0 },
  ];

  const idxColor = (v: number) => (v >= 1 ? 'var(--good)' : v >= 0.9 ? 'var(--warn)' : 'var(--bad)');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Delivery · Portfolio Cockpit</h1>
      <p style={st.sub}>
        Every project with its live Earned-Value health — schedule (SPI) and cost (CPI) performance,
        earned vs planned vs actual. At-risk = an active project running behind schedule or over cost.
      </p>

      {rows.length === 0 ? (
        <EmptyState title="No projects yet" description="Projects created from won contracts appear here with their earned-value health." actionHref="/projects/projects" actionLabel="Go to Projects" />
      ) : (
        <>
          <div style={st.kpiRow}>
            {kpis.map((k) => (
              <div key={k.label} style={st.kpiCard}>
                <span style={st.kpiLabel}>{k.label}</span>
                <span style={{ ...st.kpiVal, color: k.good === undefined ? 'var(--text)' : k.good ? 'var(--good)' : 'var(--bad)' }}>{k.value}</span>
                {k.hint ? <span style={st.kpiHint}>{k.hint}</span> : null}
              </div>
            ))}
          </div>

          {atRisk.length > 0 && (
            <section style={st.riskPanel}>
              <h3 style={st.riskTitle}>⚠ {atRisk.length} project{atRisk.length > 1 ? 's' : ''} need attention</h3>
              <ul style={st.riskList}>
                {atRisk.map((r) => (
                  <li key={r.id} style={st.riskRow}>
                    <Link href={`/project/${r.id}`} style={st.riskLink}>{r.title}</Link>
                    <span style={st.riskMeta}>
                      SPI <b style={{ color: idxColor(r.evm.spi) }}>{r.evm.spi.toFixed(2)}</b> · CPI <b style={{ color: idxColor(r.evm.cpi) }}>{r.evm.cpi.toFixed(2)}</b>
                      {r.evm.costVariance < 0 ? ` · ${AED(r.evm.costVariance)} over` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section style={st.panel}>
            <h3 style={st.panelTitle}>All projects</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={st.table}>
                <thead>
                  <tr>{['Project', 'Client', 'Status', 'Budget', 'Complete', 'SPI', 'CPI', 'Cost variance'].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const complete = r.evm.plannedValue > 0 ? r.evm.earnedValue / r.evm.plannedValue : 0;
                    return (
                      <tr key={r.id} style={r.atRisk ? st.rowRisk : undefined}>
                        <td style={st.td}><Link href={`/project/${r.id}`} style={st.plink}>{r.title}</Link></td>
                        <td style={st.tdMuted}>{r.accountName || '—'}</td>
                        <td style={st.tdMuted}>{r.status}</td>
                        <td style={st.tdNum}>{AED(r.value || 0)}</td>
                        <td style={st.tdNum}>{pct(complete)}</td>
                        <td style={{ ...st.tdNum, color: idxColor(r.evm.spi), fontWeight: 700 }}>{r.evm.spi.toFixed(2)}</td>
                        <td style={{ ...st.tdNum, color: idxColor(r.evm.cpi), fontWeight: 700 }}>{r.evm.cpi.toFixed(2)}</td>
                        <td style={{ ...st.tdNum, color: r.evm.costVariance < 0 ? 'var(--bad)' : 'var(--muted)' }}>{r.evm.costVariance ? AED(r.evm.costVariance) : '—'}</td>
                      </tr>
                    );
                  })}
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
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
  kpiRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 22 } as CSSProperties,
  kpiCard: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '15px 17px', display: 'flex', flexDirection: 'column', gap: 5 } as CSSProperties,
  kpiLabel: { fontSize: 11.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 } as CSSProperties,
  kpiVal: { fontSize: 24, fontWeight: 800, lineHeight: 1.1 } as CSSProperties,
  kpiHint: { fontSize: 11.5, color: 'var(--muted)' } as CSSProperties,
  riskPanel: { background: 'var(--bad-soft)', border: '1px solid var(--bad)', borderRadius: 12, padding: '14px 18px', marginBottom: 22 } as CSSProperties,
  riskTitle: { fontSize: 14, fontWeight: 700, color: 'var(--bad)', margin: '0 0 10px' } as CSSProperties,
  riskList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 7 } as CSSProperties,
  riskRow: { display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' } as CSSProperties,
  riskLink: { color: 'var(--text)', fontWeight: 600, fontSize: 13.5, textDecoration: 'none' } as CSSProperties,
  riskMeta: { fontSize: 12.5, color: 'var(--muted)' } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 16px' } as CSSProperties,
  panelTitle: { fontSize: 15, fontWeight: 700, margin: '6px 0 10px', color: 'var(--text)' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' } as CSSProperties,
  td: { padding: '10px', borderBottom: '1px solid var(--border)', color: 'var(--text)' } as CSSProperties,
  tdMuted: { padding: '10px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', textTransform: 'capitalize', whiteSpace: 'nowrap' } as CSSProperties,
  tdNum: { padding: '10px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: 'var(--text)' } as CSSProperties,
  rowRisk: { background: 'var(--bad-soft)' } as CSSProperties,
  plink: { color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
};
