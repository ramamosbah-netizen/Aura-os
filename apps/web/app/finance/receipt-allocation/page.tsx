import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import ReceiptAllocationClient, { type CustomerBalance } from '../../../components/receipt-allocation-client';

export const dynamic = 'force-dynamic';

interface CustomerInvoice {
  customerName: string;
  total: number;
  amountPaid: number;
  creditedTotal: number;
  status: string;
}

export default async function ReceiptAllocationPage() {
  const invoices = (await getJson<CustomerInvoice[]>('/api/finance/customer-invoices')) ?? [];

  // Distinct customers that still have an open receivable, with their total outstanding.
  const byCustomer = new Map<string, number>();
  for (const i of invoices) {
    if (i.status !== 'issued' && i.status !== 'partially_paid') continue;
    const balance = Math.round((i.total - i.amountPaid - (i.creditedTotal ?? 0)) * 100) / 100;
    if (balance <= 0) continue;
    byCustomer.set(i.customerName, Math.round(((byCustomer.get(i.customerName) ?? 0) + balance) * 100) / 100);
  }
  const customers: CustomerBalance[] = [...byCustomer.entries()]
    .map(([customerName, outstanding]) => ({ customerName, outstanding }))
    .sort((a, b) => b.outstanding - a.outstanding);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Finance · Receipt Allocation</h1>
      <p style={st.sub}>
        Apply one customer receipt across several open invoices — a single cheque or transfer that
        clears more than one bill. Enter the amount and preview how it splits oldest-first, then apply
        it. Each invoice it settles posts the cash to the ledger; any over-payment shows as unapplied.
      </p>
      <section style={{ marginTop: 10 }}>
        <ReceiptAllocationClient customers={customers} />
      </section>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  page: { maxWidth: 1000, margin: '0 auto', padding: '28px 28px 64px' },
  h1: { fontSize: 22, fontWeight: 700, margin: 0 },
  sub: { color: 'var(--muted)', fontSize: 14, marginTop: 6, maxWidth: 780, lineHeight: 1.5 },
};
