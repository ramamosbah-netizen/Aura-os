import type { CSSProperties } from 'react';
import CommercialComparisonClient from '../../../../../components/commercial-comparison-client';

export const dynamic = 'force-dynamic';

/**
 * SUP-06 — what every supplier offered for ONE requirement, made comparable.
 *
 * The grain is the requisition line because that is the question a buyer asks: "what did everyone
 * offer for this item", not "what did this supplier say".
 */
export default async function CommercialComparisonPage({
  params,
}: {
  params: Promise<{ prLineId: string }>;
}) {
  const { prLineId } = await params;
  return (
    <div style={st.page}>
      <h1 style={st.h1}>Procurement · Commercial comparison</h1>
      <p style={st.sub}>
        Every offer against one requirement, put on the same basis: valued ex-tax in the base
        currency at a governed exchange rate, with freight kept separate because suppliers quote it
        for the offer as a whole. Anything that cannot be put on that basis says so instead of
        showing a number.
      </p>
      <CommercialComparisonClient prLineId={prLineId} />
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  page: { maxWidth: 1180, margin: '0 auto', padding: '28px 28px 64px' },
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 },
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 780, lineHeight: 1.55 },
};
