import { getJson } from '@/lib/api';
import DocumentSheet from '../../../../components/document-sheet';

export const dynamic = 'force-dynamic';

interface Line { code?: string; name?: string; amount: number }
interface IS { totalRevenue: number; totalExpenses: number; netProfit: number; revenue: Line[]; expenses: Line[] }
interface BS { totalAssets: number; totalLiabilities: number; totalEquity: number; totalLiabilitiesAndEquity: number; balanced: boolean }
const money = (n: number) => `AED ${Number(n).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function StatementsPrint({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; asOf?: string }> }) {
  const sp = await searchParams;
  const year = new Date().getFullYear();
  const from = sp.from ?? `${year}-01-01`, to = sp.to ?? `${year}-12-31`, asOf = sp.asOf ?? to;
  const [is, bs] = await Promise.all([
    getJson<IS>(`/api/finance/statements/income-statement?from=${from}&to=${to}`),
    getJson<BS>(`/api/finance/statements/balance-sheet?asOf=${asOf}`),
  ]);
  if (!is || !bs) return <div style={{ padding: 40 }}>Statements unavailable or API offline.</div>;

  return (
    <DocumentSheet
      kind="FINANCIAL STATEMENTS"
      reference={`FY ${from.slice(0, 4)}`}
      status={bs.balanced ? 'balanced' : 'unbalanced'}
      from={{ heading: 'Entity', lines: ['AURA OS Contracting LLC', 'Dubai, UAE'] }}
      to={{ heading: 'Period', lines: [`${from} → ${to}`, `Balance sheet as of ${asOf}`] }}
      meta={[
        { label: 'Total Revenue', value: money(is.totalRevenue) },
        { label: 'Total Expenses', value: money(is.totalExpenses) },
        { label: 'Net Profit', value: money(is.netProfit) },
      ]}
      columns={[{ key: 'item', label: 'Statement line' }, { key: 'amount', label: 'Amount', align: 'right' }]}
      rows={[
        { item: '— INCOME STATEMENT —', amount: '' },
        { item: 'Revenue', amount: money(is.totalRevenue) },
        { item: 'Expenses', amount: `(${money(is.totalExpenses)})` },
        { item: 'Net profit', amount: money(is.netProfit) },
        { item: '— BALANCE SHEET —', amount: '' },
        { item: 'Total assets', amount: money(bs.totalAssets) },
        { item: 'Total liabilities', amount: money(bs.totalLiabilities) },
        { item: 'Total equity (incl. retained)', amount: money(bs.totalEquity) },
        { item: 'Liabilities + equity', amount: money(bs.totalLiabilitiesAndEquity) },
      ]}
      notes={`Assets ${bs.balanced ? '=' : '≠'} Liabilities + Equity (${bs.balanced ? 'balanced' : 'OUT OF BALANCE'}).`}
      signatures={['Prepared By', 'Approved By']}
    />
  );
}
