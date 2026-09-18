import type { CSSProperties } from 'react';
import SourcingDecisionClient from '../../../../../components/sourcing-decision-client';

export const dynamic = 'force-dynamic';

/**
 * SUP-13 / SUP-14 — the sourcing decision for one RFQ, and the award it produces.
 *
 * The grain is the RFQ because that is the question being decided: not "what did everyone offer for
 * this item" (which is the commercial comparison, one requisition line at a time) but "who are we
 * buying this requirement from". A whole offer is what a supplier actually quoted, and it is what
 * they will be held to.
 */
export default async function SourcingDecisionPage({
  params,
}: {
  params: Promise<{ rfqId: string }>;
}) {
  const { rfqId } = await params;
  return (
    <div style={st.page}>
      <h1 style={st.h1}>Procurement · Sourcing decision</h1>
      <p style={st.sub}>
        Every supplier&rsquo;s current offer, with what it comes to on one basis, what it is offered on,
        and whether it may be recommended at all. Nothing is ranked. A buyer records who supplies
        what and why; somebody else approves it; and only then does it become purchase orders — one
        per supplier, in that supplier&rsquo;s own currency, at the prices they quoted.
      </p>
      <SourcingDecisionClient rfqId={rfqId} />
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  page: { maxWidth: 1180, margin: '0 auto', padding: '28px 28px 64px' },
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 },
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 820, lineHeight: 1.55 },
};
