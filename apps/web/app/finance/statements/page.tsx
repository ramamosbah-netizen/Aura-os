import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

// Web-local HTTP shapes (the web declares its own, never importing @aura/finance).
interface Line { accountId: string; code: string; name: string; amount: number }
interface TrialBalanceRow { code: string; name: string; type: string; debit: number; credit: number }
interface TrialBalance { rows: TrialBalanceRow[]; totalDebit: number; totalCredit: number; balanced: boolean }
interface IncomeStatement {
  revenue: Line[]; totalRevenue: number; expenses: Line[]; totalExpenses: number; netProfit: number;
}
interface BalanceSheet {
  assets: Line[]; totalAssets: number; liabilities: Line[]; totalLiabilities: number;
  equity: Line[]; retainedEarnings: number; totalEquity: number; totalLiabilitiesAndEquity: number; balanced: boolean;
}
interface CashFlow {
  openingCash: number; inflows: number; outflows: number; netChange: number; closingCash: number;
  cashAccounts: Array<{ code: string; name: string }>; byCounterpart: Line[];
}

function money(n: number): string {
  const v = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${v})` : v;
}

export default async function StatementsPage() {
  const [tb, is, bs, cf] = await Promise.all([
    getJson<TrialBalance>('/api/finance/statements/trial-balance'),
    getJson<IncomeStatement>('/api/finance/statements/income-statement'),
    getJson<BalanceSheet>('/api/finance/statements/balance-sheet'),
    getJson<CashFlow>('/api/finance/statements/cash-flow'),
  ]);

  if (!tb || !is || !bs || !cf) {
    return (
      <div style={st.page}>
        <h1 style={st.h1}>Finance · Financial Statements</h1>
        <p style={st.muted}>API offline.</p>
      </div>
    );
  }

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Finance · Financial Statements</h1>
      <p style={st.sub}>
        The three primary statements + trial balance, derived live from the double-entry general ledger.
        Every figure folds from balanced journal entries — if the GL balances, these balance.
      </p>

      {/* Income Statement */}
      <section style={st.card}>
        <h2 style={st.h2}>Income Statement <span style={st.period}>(all periods)</span></h2>
        <table style={st.table}>
          <tbody>
            <tr><td style={st.sectionHdr} colSpan={2}>Revenue</td></tr>
            {is.revenue.map((l) => row(l.code, l.name, l.amount))}
            {totalRow('Total Revenue', is.totalRevenue)}
            <tr><td style={st.sectionHdr} colSpan={2}>Expenses</td></tr>
            {is.expenses.map((l) => row(l.code, l.name, l.amount))}
            {totalRow('Total Expenses', is.totalExpenses)}
            <tr>
              <td style={st.netLabel}>Net {is.netProfit >= 0 ? 'Profit' : 'Loss'}</td>
              <td style={{ ...st.netVal, color: is.netProfit >= 0 ? 'var(--good)' : 'var(--bad)' }}>{money(is.netProfit)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Balance Sheet */}
      <section style={st.card}>
        <h2 style={st.h2}>Balance Sheet <span style={st.period}>(as of today)</span> {badge(bs.balanced)}</h2>
        <table style={st.table}>
          <tbody>
            <tr><td style={st.sectionHdr} colSpan={2}>Assets</td></tr>
            {bs.assets.map((l) => row(l.code, l.name, l.amount))}
            {totalRow('Total Assets', bs.totalAssets)}
            <tr><td style={st.sectionHdr} colSpan={2}>Liabilities</td></tr>
            {bs.liabilities.map((l) => row(l.code, l.name, l.amount))}
            {totalRow('Total Liabilities', bs.totalLiabilities)}
            <tr><td style={st.sectionHdr} colSpan={2}>Equity</td></tr>
            {bs.equity.map((l) => row(l.code, l.name, l.amount))}
            {row('—', 'Retained Earnings', bs.retainedEarnings)}
            {totalRow('Total Equity', bs.totalEquity)}
            {totalRow('Total Liabilities + Equity', bs.totalLiabilitiesAndEquity)}
          </tbody>
        </table>
      </section>

      {/* Cash Flow */}
      <section style={st.card}>
        <h2 style={st.h2}>Cash Flow <span style={st.period}>(all periods, direct)</span></h2>
        <p style={st.note}>
          Cash accounts: {cf.cashAccounts.length ? cf.cashAccounts.map((a) => a.name).join(', ') : 'none detected'}.
        </p>
        <table style={st.table}>
          <tbody>
            {totalRow('Opening Cash', cf.openingCash)}
            <tr><td style={st.sectionHdr} colSpan={2}>Movements by counterpart</td></tr>
            {cf.byCounterpart.map((l) => row(l.code, l.name, l.amount))}
            {totalRow('Inflows', cf.inflows)}
            {totalRow('Outflows', -cf.outflows)}
            {totalRow('Net Change', cf.netChange)}
            <tr>
              <td style={st.netLabel}>Closing Cash</td>
              <td style={st.netVal}>{money(cf.closingCash)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Trial Balance */}
      <section style={st.card}>
        <h2 style={st.h2}>Trial Balance {badge(tb.balanced)}</h2>
        <table style={st.table}>
          <thead>
            <tr>
              <th style={st.th}>Account</th>
              <th style={{ ...st.th, textAlign: 'right' }}>Debit</th>
              <th style={{ ...st.th, textAlign: 'right' }}>Credit</th>
            </tr>
          </thead>
          <tbody>
            {tb.rows.map((r) => (
              <tr key={r.code}>
                <td style={st.td}><span style={st.code}>{r.code}</span> {r.name}</td>
                <td style={st.tdNum}>{r.debit ? money(r.debit) : ''}</td>
                <td style={st.tdNum}>{r.credit ? money(r.credit) : ''}</td>
              </tr>
            ))}
            <tr>
              <td style={st.netLabel}>Totals</td>
              <td style={{ ...st.netVal }}>{money(tb.totalDebit)}</td>
              <td style={{ ...st.netVal }}>{money(tb.totalCredit)}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}

function row(code: string, name: string, amount: number) {
  return (
    <tr key={`${code}-${name}`}>
      <td style={st.td}><span style={st.code}>{code}</span> {name}</td>
      <td style={st.tdNum}>{money(amount)}</td>
    </tr>
  );
}
function totalRow(label: string, amount: number) {
  return (
    <tr key={label}>
      <td style={st.totalLabel}>{label}</td>
      <td style={st.totalVal}>{money(amount)}</td>
    </tr>
  );
}
function badge(ok: boolean) {
  return (
    <span style={{ ...st.badge, background: ok ? 'rgba(40,167,69,0.12)' : 'rgba(220,53,69,0.12)', color: ok ? 'var(--good)' : 'var(--bad)' }}>
      {ok ? '✓ balanced' : '✗ unbalanced'}
    </span>
  );
}

const st = {
  page: { maxWidth: 820, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 680, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
  card: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', marginBottom: 18 } as CSSProperties,
  h2: { fontSize: 17, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 } as CSSProperties,
  period: { fontSize: 12, color: 'var(--muted)', fontWeight: 400 } as CSSProperties,
  note: { fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.5, padding: '6px 8px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  sectionHdr: { padding: '10px 8px 4px', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' } as CSSProperties,
  td: { padding: '5px 8px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  tdNum: { padding: '5px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' } as CSSProperties,
  code: { fontFamily: 'ui-monospace, monospace', fontSize: 11.5, color: 'var(--muted)', marginRight: 6 } as CSSProperties,
  totalLabel: { padding: '6px 8px', fontWeight: 600, borderTop: '1px solid var(--border)' } as CSSProperties,
  totalVal: { padding: '6px 8px', fontWeight: 600, textAlign: 'right', borderTop: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums' } as CSSProperties,
  netLabel: { padding: '9px 8px', fontWeight: 700, borderTop: '2px solid var(--border)' } as CSSProperties,
  netVal: { padding: '9px 8px', fontWeight: 700, textAlign: 'right', borderTop: '2px solid var(--border)', fontVariantNumeric: 'tabular-nums' } as CSSProperties,
  badge: { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6 } as CSSProperties,
};
