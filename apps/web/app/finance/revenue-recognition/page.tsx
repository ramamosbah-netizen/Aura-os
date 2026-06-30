import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface Rr {
  projectId: string;
  projectTitle: string;
  projectStatus: string;
  contractValue: number;
  percentComplete: number;
  recognizedRevenue: number;
  recognizedCost: number;
  grossProfitToDate: number;
  billedToDate: number;
  overBilling: number;
  underBilling: number;
}

function money(n: number): string {
  const v = Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 });
  return n < 0 ? `(${v})` : v;
}

export default async function RevenueRecognitionPage() {
  const rows = await getJson<Rr[]>('/api/finance/revenue-recognition');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Finance · Revenue Recognition</h1>
      <p style={st.sub}>
        IFRS-15 percentage-of-completion (cost-to-cost) per project: % complete = cost incurred ÷
        estimate at completion (from the project CBS), recognised revenue = contract value × %
        complete, compared to amounts billed. Recognised &gt; billed = a contract asset
        (unbilled/accrued); billed &gt; recognised = a contract liability (deferred revenue).
      </p>

      {rows === null ? (
        <p style={st.muted}>API offline.</p>
      ) : rows.length === 0 ? (
        <p style={st.muted}>No projects yet.</p>
      ) : (
        <div style={st.panel}>
          <table style={st.table}>
            <thead>
              <tr>
                <th style={st.th}>Project</th>
                {['Contract', '% Compl.', 'Recognised', 'Cost', 'Gross Profit', 'Billed', 'Position'].map((h) => (
                  <th key={h} style={{ ...st.th, textAlign: 'right' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.projectId}>
                  <td style={st.td}>
                    <strong>{r.projectTitle}</strong> <span style={st.tag}>{r.projectStatus}</span>
                  </td>
                  <td style={st.tdNum}>{money(r.contractValue)}</td>
                  <td style={st.tdNum}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                      <div style={st.bar}><div style={{ ...st.barFill, width: `${r.percentComplete}%` }} /></div>
                      {r.percentComplete}%
                    </div>
                  </td>
                  <td style={st.tdNum}>{money(r.recognizedRevenue)}</td>
                  <td style={st.tdNum}>{money(r.recognizedCost)}</td>
                  <td style={{ ...st.tdNum, color: r.grossProfitToDate >= 0 ? 'var(--good)' : 'var(--bad)' }}>{money(r.grossProfitToDate)}</td>
                  <td style={st.tdNum}>{money(r.billedToDate)}</td>
                  <td style={st.tdNum}>
                    {r.underBilling > 0 ? (
                      <span style={{ color: 'var(--accent)' }}>+{money(r.underBilling)} asset</span>
                    ) : r.overBilling > 0 ? (
                      <span style={{ color: 'var(--bad)' }}>−{money(r.overBilling)} liab.</span>
                    ) : (
                      <span style={st.muted}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const st = {
  page: { maxWidth: 1000, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 760, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '8px 8px' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, padding: '10px 10px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  td: { padding: '9px 10px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' } as CSSProperties,
  tdNum: { padding: '9px 10px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' } as CSSProperties,
  tag: { fontSize: 10.5, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 5px', textTransform: 'uppercase' } as CSSProperties,
  bar: { width: 48, height: 5, background: 'var(--panel-2)', borderRadius: 3, overflow: 'hidden' } as CSSProperties,
  barFill: { height: '100%', background: 'var(--accent)', borderRadius: 3 } as CSSProperties,
};
