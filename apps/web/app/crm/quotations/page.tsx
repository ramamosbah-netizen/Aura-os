import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import QuotationsClient from '../../../components/quotations-client';
import QuotationCreate from '../../../components/quotation-create';

export const dynamic = 'force-dynamic';

interface Quotation {
  id: string;
  quoteNumber: string;
  customerName: string;
  accountId: string | null;
  sourceTenderId?: string | null;
  sourceOpportunityId?: string | null;
  convertedContractId?: string | null;
  ownerId?: string | null;
  terms?: string | null;
  revision?: number;
  parentQuotationId?: string | null;
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
      <div style={st.headRow}>
        <h1 style={st.h1}>CRM · Quotations</h1>
        <QuotationCreate />
      </div>
      <p style={st.sub}>
        The client-facing quote in the deal chain: Draft → Internal Review → Approved → Sent →
        Under Negotiation → Accepted / Rejected / Expired / Cancelled, with revisions
        (Rev 0 → 1 → 2 …). Accepted quotes convert to a contract in one click; every quote
        keeps its source (opportunity or tender pricing sheet) and its account.
      </p>
      <section style={{ marginTop: 10 }}>
        {quotations === null ? <p style={st.muted}>API offline.</p> : <QuotationsClient initialQuotations={quotations} />}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  headRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
