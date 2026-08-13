import type { CSSProperties } from 'react';
import { fetchJson, getJson } from '@/lib/api';
import DataStateNotice from '@/components/ui/data-state';
import QuotationsWorkspace from '../../../components/quotations-workspace';

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
  const result = await fetchJson<Quotation[]>('/api/crm/quotations');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Quotations</h1>
      <p style={st.sub}>
        The quotation lifecycle as a workspace — Overview, a status Board (Draft → Review → Approved
        → Sent → Negotiation → Accepted), the full List, and Analytics. Accepted quotes convert to a
        contract in one click; every quote keeps its source (opportunity or tender) and its account.
      </p>
      <section style={{ marginTop: 10 }}>
        {/* This page already distinguished failure from empty, but called every failure "API offline" —
            a 403 is not an outage, and telling a user their session lapsed is a different instruction. */}
        {result.ok ? (
          <QuotationsWorkspace initialQuotations={result.data} />
        ) : (
          <DataStateNotice error={result.error} subject="quotations" />
        )}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1280, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
