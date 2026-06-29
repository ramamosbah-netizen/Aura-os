import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import LedgerView from '../../../components/ledger-view';

export const dynamic = 'force-dynamic';

interface Account {
  id: string;
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  parentId: string | null;
  createdAt: string;
}

interface JournalLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

interface Journal {
  id: string;
  reference: string | null;
  description: string;
  postedAt: string;
  createdBy: string | null;
  lines: JournalLine[];
}

export default async function LedgerPage() {
  const [accounts, journals] = await Promise.all([
    getJson<Account[]>('/api/finance/accounts'),
    getJson<Journal[]>('/api/finance/journals'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Finance · General Ledger</h1>
      <p style={st.sub}>
        Double-entry bookkeeping — visualizes the Chart of Accounts (COA) with live balances rolled up
        from balanced journal entries. Recording payments automatically emits postings debiting accounts
        payable and crediting bank assets.
      </p>

      <section style={{ marginTop: 10 }}>
        {accounts === null || journals === null ? (
          <p style={st.muted}>API offline.</p>
        ) : (
          <LedgerView accounts={accounts} journals={journals} />
        )}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 980, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 680, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
