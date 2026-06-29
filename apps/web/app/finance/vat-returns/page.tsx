import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import VatReturnsClient from '../../../components/vat-returns-client';

export const dynamic = 'force-dynamic';

interface TaxReturn {
  id: string;
  periodStart: string;
  periodEnd: string;
  totalOutputTax: number;
  totalInputTax: number;
  netTaxPayable: number;
  status: string;
  filedAt: string | null;
}

export default async function VatReturnsPage() {
  const returns = (await getJson<TaxReturn[]>('/api/finance/vat-returns')) ?? [];

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Finance · VAT Returns</h1>
      <p style={st.sub}>
        Prepare a periodic VAT return: pick a filing period to see output VAT (on sales) less input VAT
        (on purchases) and the net payable, then generate and file the return.
      </p>
      <section style={{ marginTop: 10 }}>
        <VatReturnsClient initialReturns={returns} />
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 900, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 680, lineHeight: 1.5 } as CSSProperties,
};
