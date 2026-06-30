import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import BudgetsClient from '../../../components/budgets-client';

export const dynamic = 'force-dynamic';

interface Account { id: string; code: string; name: string; type: string }
interface BudgetLine { accountId: string; accountCode: string; accountName: string; amount: number }
interface Budget { id: string; name: string; from: string; to: string; lines: BudgetLine[]; createdAt: string }

export default async function BudgetsPage() {
  const [budgets, accounts] = await Promise.all([
    getJson<Budget[]>('/api/finance/budgets'),
    getJson<Account[]>('/api/finance/accounts'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Finance · Budgets</h1>
      <p style={st.sub}>
        Plan a budgeted amount per GL account over a date range. Budget-vs-actual is folded live
        from the ledger for the same range — actuals are never stored, so they always reconcile to
        the books.
      </p>
      <BudgetsClient initialBudgets={budgets ?? []} accounts={accounts ?? []} />
    </div>
  );
}

const st = {
  page: { maxWidth: 860, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 680, lineHeight: 1.5 } as CSSProperties,
};
