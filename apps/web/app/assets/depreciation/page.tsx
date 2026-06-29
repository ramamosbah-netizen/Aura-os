import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import DepreciationClient from '../../../components/depreciation-client';

export const dynamic = 'force-dynamic';

interface Asset {
  id: string;
  name: string;
  purchaseCost: number;
  purchaseDate: string;
}

export default async function DepreciationPage() {
  const assets = (await getJson<Asset[]>('/api/assets')) ?? [];

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Assets · Depreciation</h1>
      <p style={st.sub}>
        Straight-line depreciation schedule for a fixed asset: enter its useful life and salvage value to
        see the year-by-year depreciation, accumulated total, and closing net book value.
      </p>
      <section style={{ marginTop: 10 }}>
        <DepreciationClient assets={assets} />
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 880, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 680, lineHeight: 1.5 } as CSSProperties,
};
