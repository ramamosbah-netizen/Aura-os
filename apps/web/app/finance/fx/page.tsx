import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import FxClient from '../../../components/fx-client';

export const dynamic = 'force-dynamic';

interface Rate { fromCurrency: string; toCurrency: string; rate: number; effectiveDate: string }

export default async function FxPage() {
  const rates = await getJson<Rate[]>('/api/finance/fx/rates');
  return (
    <div style={st.page}>
      <h1 style={st.h1}>Finance · Multi-Currency (FX)</h1>
      <p style={st.sub}>
        Manage exchange rates and convert between currencies. Rates are effective-dated; unknown
        pairs fall back to standard USD/GCC pegs and cross-rates through USD.
      </p>
      <FxClient initialRates={rates ?? []} />
    </div>
  );
}

const st = {
  page: { maxWidth: 720, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 640, lineHeight: 1.5 } as CSSProperties,
};
