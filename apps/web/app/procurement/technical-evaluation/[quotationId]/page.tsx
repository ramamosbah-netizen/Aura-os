import type { CSSProperties } from 'react';
import TechnicalEvaluationQueue from '../../../../components/technical-evaluation-queue';

export const dynamic = 'force-dynamic';

/**
 * THE TECHNICAL MANAGER'S OWN SURFACE (`SUP-01`).
 *
 * Deliberately separate from the Buyer's quotation page, because the two roles hold disjoint
 * permissions: a Technical Manager holds `engineering.*` and NO procurement permission, so the
 * Buyer's page is closed to them. Building the evaluator's work onto that page would have made the
 * determination unreachable by the only role allowed to make it.
 *
 * Rendered client-side: the queue is read under the evaluator's own session, so a caller without
 * the engineering permission gets nothing here rather than a server-rendered page they may not see.
 */
export default async function TechnicalEvaluationPage({ params }: { params: Promise<{ quotationId: string }> }) {
  const { quotationId } = await params;
  return (
    <div style={st.page}>
      <h1 style={st.h1}>Technical evaluation</h1>
      <p style={st.sub}>
        Offers on this quotation with no technical verdict yet. What was asked for sits beside what was
        offered; a supplier saying &ldquo;comply&rdquo; is their claim, not a decision.
      </p>
      <TechnicalEvaluationQueue quotationId={quotationId} />
    </div>
  );
}

const st = {
  page: { width: '100%', maxWidth: 1680, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 700, lineHeight: 1.5 } as CSSProperties,
};
