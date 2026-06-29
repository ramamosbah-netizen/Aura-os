import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import CustomerInvoicesClient from '../../../components/customer-invoices-client';

export const dynamic = 'force-dynamic';

interface CustomerInvoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  projectName: string | null;
  issueDate: string;
  subtotal: number;
  vatTotal: number;
  total: number;
  amountPaid: number;
  status: string;
  lines: { description: string; quantity: number; unitPrice: number; vatRate: number; lineNet: number; lineVat: number }[];
}

export default async function CustomerInvoicesPage() {
  const invoices = await getJson<CustomerInvoice[]>('/api/finance/customer-invoices');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Finance · Customer Invoices</h1>
      <p style={st.sub}>
        Tax invoices raised to clients (the receivable / AR side). Add line items — net, 5% VAT and
        gross compute automatically — then issue. Record receipts against an issued invoice; it advances
        draft → issued → partially&nbsp;paid → paid. Totals show issued vs. outstanding receivable.
      </p>
      <section style={{ marginTop: 10 }}>
        {invoices === null ? <p style={st.muted}>API offline.</p> : <CustomerInvoicesClient initialInvoices={invoices} />}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
