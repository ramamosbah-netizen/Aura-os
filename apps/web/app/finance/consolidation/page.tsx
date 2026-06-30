import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface IncomeStatement { totalRevenue: number; totalExpenses: number; netProfit: number }
interface BalanceSheet { totalAssets: number; totalLiabilities: number; totalEquity: number; balanced: boolean }
interface Company { companyId: string; incomeStatement: IncomeStatement; balanceSheet: BalanceSheet }
interface Consolidated { asOf: string | null; companies: Company[]; consolidated: { incomeStatement: IncomeStatement; balanceSheet: BalanceSheet } }

function n(v: number) { const a = Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 }); return v < 0 ? `(${a})` : a; }

export default async function ConsolidationPage() {
  const c = await getJson<Consolidated>('/api/finance/statements/consolidated');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Finance · Group Consolidation</h1>
      <p style={st.sub}>
        Per-company financials plus a consolidated (group) column, folded live from the GL by the
        journal company dimension. Journals with no company fall into the group total only.
      </p>
      {c === null ? (
        <p style={st.muted}>API offline.</p>
      ) : c.companies.length === 0 ? (
        <p style={st.muted}>No company-tagged journals yet. Post journals with a companyId to see per-entity columns.</p>
      ) : (
        <div style={st.panel}>
          <table style={st.table}>
            <thead>
              <tr>
                <th style={st.th}>Line</th>
                {c.companies.map((co) => <th key={co.companyId} style={{ ...st.th, textAlign: 'right' }}>{co.companyId}</th>)}
                <th style={{ ...st.th, textAlign: 'right', color: 'var(--accent)' }}>Group</th>
              </tr>
            </thead>
            <tbody>
              {row('Revenue', c, (s) => s.incomeStatement.totalRevenue)}
              {row('Expenses', c, (s) => s.incomeStatement.totalExpenses)}
              {row('Net profit', c, (s) => s.incomeStatement.netProfit, true)}
              <tr><td style={st.sectionHdr} colSpan={c.companies.length + 2}>Balance Sheet</td></tr>
              {row('Assets', c, (s) => s.balanceSheet.totalAssets)}
              {row('Liabilities', c, (s) => s.balanceSheet.totalLiabilities)}
              {row('Equity', c, (s) => s.balanceSheet.totalEquity)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function row(
  label: string,
  c: Consolidated,
  pick: (s: { incomeStatement: IncomeStatement; balanceSheet: BalanceSheet }) => number,
  bold = false,
) {
  const cell = bold ? st.tdNumB : st.tdNum;
  return (
    <tr key={label}>
      <td style={bold ? st.tdB : st.td}>{label}</td>
      {c.companies.map((co) => <td key={co.companyId} style={cell}>{n(pick(co))}</td>)}
      <td style={{ ...cell, color: 'var(--accent)' }}>{n(pick(c.consolidated))}</td>
    </tr>
  );
}

const st = {
  page: { maxWidth: 900, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 700, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '8px 8px' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5, padding: '10px 12px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  sectionHdr: { padding: '10px 12px 4px', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  tdB: { padding: '8px 12px', borderBottom: '1px solid var(--border)', fontWeight: 700 } as CSSProperties,
  tdNum: { padding: '8px 12px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' } as CSSProperties,
  tdNumB: { padding: '8px 12px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' } as CSSProperties,
};
