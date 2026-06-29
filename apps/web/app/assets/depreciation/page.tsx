import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import DepreciationClient from '../../../components/depreciation-client';

export const dynamic = 'force-dynamic';

interface Asset {
  id: string;
  name: string;
  serialNumber: string;
  category: string;
  purchaseDate: string;
  purchaseCost: number;
}

export default async function DepreciationPage() {
  const assets = await getJson<Asset[]>('/api/assets');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Assets · Depreciation</h1>
      <p style={st.sub}>
        Compute a depreciation schedule and net book value for any asset. Pick an asset (its cost and
        purchase date are used), set the useful life, salvage value and method (straight-line or
        double-declining), and the month-by-month schedule plus the accumulated depreciation and net
        book value as of today are calculated.
      </p>
      <section style={{ marginTop: 10 }}>
        {assets === null || !Array.isArray(assets) ? (
          <p style={st.muted}>API offline.</p>
        ) : (
          <DepreciationClient assets={assets} />
        )}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
