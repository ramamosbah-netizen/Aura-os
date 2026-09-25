import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import RecordChrome from '../../../../components/record-chrome';
import TenderDetail from '../../../../components/tender-detail';
import Sales360Journey from '../../../../components/sales-360-journey';
import TenderAwardBasis, { type TenderCommercialBasisView } from '../../../../components/tender-award-basis';

export const dynamic = 'force-dynamic';

interface Tender {
  id: string;
  title: string;
  reference: string | null;
  accountName: string | null;
  status: 'draft' | 'submitted' | 'won' | 'lost';
  value: number;
  createdAt: string;
  /** Pinned by the award (ADR-0021): the approved baseline of one revision. Null until awarded. */
  commercialBasis?: TenderCommercialBasisView | null;
}

export default async function TenderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tender = await getJson<Tender>(`/api/tendering/tenders/${id}`);

  if (!tender) {
    return (
      <div style={st.container}>
        <h1 style={st.h1}>Tender Not Found</h1>
        <p style={st.muted}>The requested tender does not exist or you do not have permission to view it.</p>
        <a href="/tendering/tenders" style={st.link}>← Back to Tenders</a>
      </div>
    );
  }

  // The award's basis, named: which offer and revision, and who approved it. Read under the viewer's
  // own permission — a viewer who may not read the offer still sees that a basis was pinned.
  const basis = tender.commercialBasis ?? null;
  const [basisQuotation, basisBaseline] = basis
    ? await Promise.all([
      getJson<{ quoteNumber: string; revision: number }>(`/api/crm/quotations/${basis.quotationId}`),
      getJson<{ revision: number; lockedBy: string | null; lockedAt: string }>(`/api/crm/quotations/${basis.quotationId}/baseline`),
    ])
    : [null, null];

  return (
    <div style={st.container}>
      <RecordChrome type="Tender" title={tender.title} />
      <Sales360Journey current="tender" />
      <div style={st.navRow}>
        <a href="/tendering/tenders" style={st.link}>← Back to Tenders</a>
      </div>
      {basis && <TenderAwardBasis basis={basis} quotation={basisQuotation} baseline={basisBaseline} />}
      <TenderDetail tender={tender} />
    </div>
  );
}

const st = {
  container: { maxWidth: 1080, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 24, margin: '0 0 10px', color: 'var(--accent)' } as CSSProperties,
  muted: { color: 'var(--muted)', marginBottom: 20 } as CSSProperties,
  navRow: { marginBottom: 16 } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontSize: 14, fontWeight: 500 } as CSSProperties,
};
