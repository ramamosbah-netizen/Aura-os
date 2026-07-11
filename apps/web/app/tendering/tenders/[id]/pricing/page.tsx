import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import RecordChrome from '../../../../../components/record-chrome';
import TenderPricingClient from '../../../../../components/tender-pricing-client';

export const dynamic = 'force-dynamic';

interface Tender {
  id: string;
  title: string;
  reference: string | null;
  accountName: string | null;
  status: string;
  value: number;
}

/** The company's INTERNAL pricing sheet for a tender — never shown to the client. */
export default async function TenderPricingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tender = await getJson<Tender>(`/api/tendering/tenders/${id}`);

  if (!tender) {
    return (
      <div style={st.container}>
        <h1 style={st.h1}>Tender Not Found</h1>
        <a href="/tendering/tenders" style={st.link}>← Back to Tenders</a>
      </div>
    );
  }

  return (
    <div style={st.container}>
      <RecordChrome type="Tender" title={`${tender.title} — pricing sheet`} />
      <div style={st.navRow}>
        <a href={`/tendering/tenders/${tender.id}`} style={st.link}>← Back to tender</a>
        <span style={st.internal}>INTERNAL — cost &amp; resource breakdown</span>
      </div>
      <p style={st.sub}>
        {tender.accountName ? `${tender.accountName} · ` : ''}
        {tender.reference ? `${tender.reference} · ` : ''}
        Price each BOQ line (material, manpower, transport, wastage, accessories, subcontract → overhead → profit),
        then generate the client quotation.
      </p>
      <TenderPricingClient tenderId={tender.id} />
    </div>
  );
}

const st = {
  container: { maxWidth: 1180, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 24, margin: '0 0 10px', color: 'var(--accent)' } as CSSProperties,
  navRow: { marginBottom: 10, display: 'flex', alignItems: 'center', gap: 14 } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontSize: 14, fontWeight: 500 } as CSSProperties,
  internal: { fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, color: 'var(--warn, #d97706)', border: '1px solid currentColor', borderRadius: 999, padding: '2px 10px' } as CSSProperties,
  sub: { color: 'var(--muted)', fontSize: 13, margin: '0 0 18px', lineHeight: 1.5 } as CSSProperties,
};
