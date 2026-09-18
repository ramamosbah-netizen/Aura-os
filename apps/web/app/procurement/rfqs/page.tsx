import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import RfqClient from '../../../components/rfq-client';

export const dynamic = 'force-dynamic';

interface Rfq {
  id: string;
  title: string;
  reference: string | null;
  prTitle: string | null;
  status: string;
  dueDate: string | null;
  createdAt: string;
}

export default async function RfqsPage() {
  const rfqs = await getJson<Rfq[]>('/api/procurement/rfqs');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Procurement · RFQs</h1>
      {/*
        The copy said "compare them side-by-side, and award the winner", beside an Award button that
        raised a purchase order for one header figure with no lines. Both are retired (SUP-13/SUP-14):
        an award is a recorded decision somebody else approves, and it happens on the sourcing screen.
      */}
      <p style={st.sub}>
        Source competitively: float a requirement to vendors and collect their offers. The totals
        below are each supplier’s own header figure in their own currency — legacy, non-normalised,
        and not comparable with one another. Comparable values live on the commercial comparison for
        each requirement, and choosing a supplier is a governed decision on the sourcing screen.
      </p>
      <section style={{ marginTop: 10 }}>
        {rfqs === null ? <p style={st.muted}>API offline.</p> : <RfqClient initialRfqs={rfqs} />}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 980, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 680, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
