import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import CreditNotesClient, { type CreditNote, type CreditableInvoice } from '../../../components/credit-notes-client';

export const dynamic = 'force-dynamic';

interface CustomerInvoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  subtotal: number;
  total: number;
  amountPaid: number;
  creditedTotal: number;
  status: string;
}

export default async function CreditNotesPage() {
  const [notes, invoices] = await Promise.all([
    getJson<CreditNote[]>('/api/finance/credit-notes'),
    getJson<CustomerInvoice[]>('/api/finance/customer-invoices'),
  ]);

  // Only invoices that still carry a receivable can be credited.
  const creditable: CreditableInvoice[] = (invoices ?? [])
    .filter((i) => i.status === 'issued' || i.status === 'partially_paid' || i.status === 'paid')
    .map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      customerName: i.customerName,
      subtotal: i.subtotal,
      remainingNet: Math.round((i.subtotal - (i.creditedTotal ?? 0) / 1.05) * 100) / 100,
    }));

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Finance · Credit Notes</h1>
      <p style={st.sub}>
        Credit a customer back after an invoice is issued — over-billing, a return, or a price
        adjustment. Issuing a credit note reverses the revenue and VAT in the ledger and reduces what
        the customer owes on the invoice. You cannot credit more than the invoice was billed.
      </p>
      <section style={{ marginTop: 10 }}>
        <CreditNotesClient initialNotes={notes ?? []} invoices={creditable} />
      </section>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '28px 28px 64px' },
  h1: { fontSize: 22, fontWeight: 700, margin: 0 },
  sub: { color: 'var(--muted)', fontSize: 14, marginTop: 6, maxWidth: 780, lineHeight: 1.5 },
};
