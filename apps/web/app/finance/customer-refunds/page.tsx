import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import CustomerRefundsClient, { type CustomerRefund } from '../../../components/customer-refunds-client';

export const dynamic = 'force-dynamic';

export default async function CustomerRefundsPage() {
  const refunds = await getJson<CustomerRefund[]>('/api/finance/customer-refunds');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Finance · Customer Refunds</h1>
      <p style={st.sub}>
        Return cash to a customer — an over-payment, a cancelled order, or a credit note they want
        paid out rather than applied to a future invoice. Draft the refund, then pay it: paying posts
        Dr Accounts Receivable / Cr Bank (the mirror of a receipt) and the cash leaves the account.
      </p>
      <section style={{ marginTop: 10 }}>
        <CustomerRefundsClient initialRefunds={refunds ?? []} />
      </section>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '28px 28px 64px' },
  h1: { fontSize: 22, fontWeight: 700, margin: 0 },
  sub: { color: 'var(--muted)', fontSize: 14, marginTop: 6, maxWidth: 780, lineHeight: 1.5 },
};
