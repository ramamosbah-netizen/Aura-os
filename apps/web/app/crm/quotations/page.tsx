import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import QuotationsClient from '../../../components/quotations-client';

export const dynamic = 'force-dynamic';

interface Quotation {
  id: string;
  quoteNumber: string;
  customerName: string;
  issueDate: string;
  validUntil: string | null;
  subtotal: number;
  vatTotal: number;
  total: number;
  status: string;
  lines: { description: string; quantity: number; unitPrice: number; vatRate: number; lineNet: number; lineVat: number }[];
}

export default async function QuotationsPage() {
  const quotations = await getJson<Quotation[]>('/api/crm/quotations');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>CRM · Quotations</h1>
      <p style={st.sub}>
        Pre-sales quotes to customers — the deal-chain step before a contract or invoice. Add line items
        (net, 5% VAT and gross compute automatically), send to the client, then mark accepted, rejected,
        or expired. Totals show the open (sent) pipeline and won value.
      </p>
      <section style={{ marginTop: 10 }}>
        {quotations === null ? <p style={st.muted}>API offline.</p> : <QuotationsClient initialQuotations={quotations} />}
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
