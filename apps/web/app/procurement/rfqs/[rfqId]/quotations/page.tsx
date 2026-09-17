import type { CSSProperties } from 'react';
import QuotationCaptureClient from '../../../../../components/quotation-capture-client';

export const dynamic = 'force-dynamic';

/**
 * QC-01 — recording what each supplier actually quoted, and what they quoted before that.
 */
export default async function QuotationCapturePage({ params }: { params: Promise<{ rfqId: string }> }) {
  const { rfqId } = await params;
  return (
    <div style={st.page}>
      <h1 style={st.h1}>Procurement · Supplier quotations</h1>
      <p style={st.sub}>
        Record each supplier&rsquo;s offer against this RFQ with the commercial terms it was made on.
        A revised quotation is recorded as a new revision rather than replacing the one before it, so
        the offer a supplier made last month is still readable next to the one they make today.
      </p>
      <QuotationCaptureClient rfqId={rfqId} />
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  page: { maxWidth: 1180, margin: '0 auto', padding: '28px 28px 64px' },
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 },
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 780, lineHeight: 1.55 },
};
