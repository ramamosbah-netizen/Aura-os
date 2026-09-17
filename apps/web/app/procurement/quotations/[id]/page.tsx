import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import QuotationLinesClient from '../../../../components/quotation-lines-client';

export const dynamic = 'force-dynamic';

interface QuotationLine {
  id: string;
  prLineId: string;
  response: 'quoted' | 'no_bid';
  offeredManufacturer: string | null;
  offeredModel: string | null;
  isAlternate: boolean;
  complianceResponse: string | null;
  quantity: number | null;
  uom: string | null;
  unitPrice: number | null;
  leadTimeDays: number | null;
  warrantyMonths: number | null;
}

/**
 * One supplier's offer, item by item — and the internal technical verdict on each (`SUP-01`).
 *
 * The page a Technical Manager works from. What a supplier SAYS and what the company DECIDES sit
 * beside each other and are never merged: the supplier's compliance response is rendered as their
 * words, and the verdict is recorded separately by whoever holds the authority to make it.
 */
export default async function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lines = await getJson<QuotationLine[]>(`/api/procurement/quotations/${id}/lines`);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Supplier quotation</h1>
      <p style={st.sub}>
        What this supplier offered against each requisition line, and the technical verdict on it. An
        offer nobody has evaluated cannot be recommended, however low its price.
      </p>
      {lines === null
        ? <p style={st.muted}>API offline.</p>
        : <QuotationLinesClient quotationId={id} lines={lines} />}
    </div>
  );
}

const st = {
  page: { width: '100%', maxWidth: 1680, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 700, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
