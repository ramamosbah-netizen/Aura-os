import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import FinanceDashboard, { type FinanceDashboardData } from '../../../components/finance-dashboard';

export const dynamic = 'force-dynamic';

export default async function FinanceDashboardPage() {
  const year = new Date().getFullYear();
  const [ar, ap, pnl, costCenters] = await Promise.all([
    getJson<FinanceDashboardData['ar']>('/api/finance/customer-invoices/aging'),
    getJson<FinanceDashboardData['ap']>('/api/finance/invoices/aging'),
    getJson<FinanceDashboardData['pnl']>(`/api/finance/statements/income-statement?from=${year}-01-01&to=${year}-12-31`),
    getJson<FinanceDashboardData['costCenters']>('/api/finance/cost-centers/report'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Finance · Dashboard</h1>
      <p style={st.sub}>Live KPIs and charts folded from the general ledger — receivables/payables aging, P&L, and cost-centre actuals.</p>
      <FinanceDashboard data={{ ar, ap, pnl, costCenters }} />
    </div>
  );
}

const st = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
};
