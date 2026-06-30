import type { CSSProperties } from 'react';
import BankReconciliationClient from '../../../components/bank-reconciliation-client';

export const dynamic = 'force-dynamic';

export default function BankReconciliationPage() {
  return (
    <div style={st.page}>
      <h1 style={st.h1}>Finance · Bank Reconciliation</h1>
      <p style={st.sub}>
        Import a bank statement, auto-match lines to recorded payments by amount + date, and reconcile the
        rest by hand. Unreconciled lines are the gap between the bank and the ledger.
      </p>
      <section style={{ marginTop: 10 }}>
        <BankReconciliationClient />
      </section>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  page: { padding: '28px 32px', maxWidth: 1100, margin: '0 auto' },
  h1: { fontSize: 22, fontWeight: 700, margin: 0 },
  sub: { color: 'var(--muted)', fontSize: 14, marginTop: 6, maxWidth: 760, lineHeight: 1.5 },
};
