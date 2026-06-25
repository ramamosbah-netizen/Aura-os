import type { CSSProperties } from 'react';
import { getJson } from '../../lib/api';
import InsightPanel from '../../components/insight-panel';

export const dynamic = 'force-dynamic';

interface Pipeline {
  funnel: {
    accounts: number;
    tenders: number;
    contracts: number;
    projects: number;
    tenderValue: number;
    contractValue: number;
    projectValue: number;
  };
  winRate: number | null;
}

interface ProjectLedger {
  projectId: string;
  projectName: string | null;
  accountName: string | null;
  budget: number;
  committed: number;
  invoiced: number;
  variance: number;
}

function money(n: number): string {
  return n ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
}

export default async function IntelligencePage() {
  // Both axes, read-only off the spine: the deal-chain funnel + per-project profitability
  // (revenue budget vs operate-loop spend).
  const [data, ledgers] = await Promise.all([
    getJson<Pipeline>('/api/intelligence/pipeline'),
    getJson<ProjectLedger[]>('/api/intelligence/projects'),
  ]);
  const f = data?.funnel;

  const stages = f
    ? [
        { label: 'Accounts', count: f.accounts, value: null as number | null },
        { label: 'Tenders', count: f.tenders, value: f.tenderValue },
        { label: 'Contracts', count: f.contracts, value: f.contractValue },
        { label: 'Projects', count: f.projects, value: f.projectValue },
      ]
    : [];

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Intelligence</h1>
      <p style={st.sub}>
        A read-only view derived from the event spine — the deal-chain funnel and per-project
        profitability, rebuilt from <code style={st.code}>*.created</code> events, plus an AI briefing.
      </p>

      {data === null ? (
        <p style={st.muted}>API offline.</p>
      ) : (
        <>
          <div style={st.funnel}>
            {stages.map((s, i) => (
              <div key={s.label} style={st.stageWrap}>
                <div style={st.stage}>
                  <div style={st.count}>{s.count}</div>
                  <div style={st.label}>{s.label}</div>
                  <div style={st.value}>{s.value === null ? '—' : money(s.value)}</div>
                </div>
                {i < stages.length - 1 ? <div style={st.arrow}>→</div> : null}
              </div>
            ))}
          </div>
          <p style={st.conv}>
            Tender → contract conversion:{' '}
            <strong style={st.convNum}>
              {data.winRate === null ? 'n/a' : `${Math.round(data.winRate * 100)}%`}
            </strong>
          </p>

          <h2 style={st.h2}>Project profitability</h2>
          <p style={st.sub2}>
            Budget (deal-chain project value) vs committed POs and invoiced spend — folded per project
            across both axes. Negative variance = trending over budget.
          </p>
          <section style={st.panel}>
            {!ledgers || ledgers.length === 0 ? (
              <p style={st.muted}>No projects yet.</p>
            ) : (
              <table style={st.table}>
                <thead>
                  <tr>
                    {['Project', 'Account', 'Budget', 'Committed', 'Invoiced', 'Variance'].map((h, i) => (
                      <th key={h} style={i < 2 ? st.th : st.thNum}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ledgers.map((l) => (
                    <tr key={l.projectId}>
                      <td style={st.td}>{l.projectName ?? l.projectId}</td>
                      <td style={st.tdMuted}>{l.accountName ?? '—'}</td>
                      <td style={st.tdNum}>{money(l.budget)}</td>
                      <td style={st.tdNum}>{money(l.committed)}</td>
                      <td style={st.tdNum}>{money(l.invoiced)}</td>
                      <td style={{ ...st.tdNum, color: l.variance < 0 ? 'var(--bad)' : 'var(--text)' }}>
                        {l.variance < 0 ? `(${money(-l.variance)})` : money(l.variance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <InsightPanel />
        </>
      )}
    </div>
  );
}

const st = {
  page: { maxWidth: 980, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  h2: { fontSize: 18, margin: '30px 0 4px', letterSpacing: -0.3 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 24px', maxWidth: 680, lineHeight: 1.5 } as CSSProperties,
  sub2: { color: 'var(--muted)', margin: '0 0 14px', maxWidth: 680, lineHeight: 1.5, fontSize: 13.5 } as CSSProperties,
  code: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 12.5,
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    padding: '1px 5px',
  } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
  funnel: { display: 'flex', alignItems: 'stretch', gap: 6, flexWrap: 'wrap' } as CSSProperties,
  stageWrap: { display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 150 } as CSSProperties,
  stage: {
    flex: 1,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '16px 14px',
    textAlign: 'center',
  } as CSSProperties,
  count: { fontSize: 30, fontWeight: 700, letterSpacing: -1 } as CSSProperties,
  label: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', marginTop: 2 } as CSSProperties,
  value: { fontSize: 13, color: 'var(--muted)', marginTop: 6 } as CSSProperties,
  arrow: { color: 'var(--muted)', fontSize: 18 } as CSSProperties,
  conv: { color: 'var(--muted)', margin: '18px 0 0', fontSize: 14 } as CSSProperties,
  convNum: { color: 'var(--text)' } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '8px 8px' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 } as CSSProperties,
  th: {
    textAlign: 'left',
    color: 'var(--muted)',
    fontWeight: 500,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,
  thNum: {
    textAlign: 'right',
    color: 'var(--muted)',
    fontWeight: 500,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,
  td: { padding: '11px 12px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  tdMuted: { padding: '11px 12px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' } as CSSProperties,
  tdNum: { padding: '11px 12px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' } as CSSProperties,
};
