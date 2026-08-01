import type { CSSProperties } from 'react';
import MarketIntelligenceClient from '../../../components/market-intelligence-client';

export const dynamic = 'force-dynamic';

export default function MarketIntelligencePage() {
  return (
    <div style={st.page}>
      <h1 style={st.h1}>CRM · Market Intelligence</h1>
      <p style={st.sub}>
        The reference catalogue behind pricing — what each item typically costs, sells for, and
        takes to install, with a source and an as-of date. An estimator building a pricing sheet
        picks from here, so a fair, current number is the default rather than a guess.
      </p>
      <MarketIntelligenceClient />
    </div>
  );
}

const st = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 760, lineHeight: 1.5 } as CSSProperties,
};
