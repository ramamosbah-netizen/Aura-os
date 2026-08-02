import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import AssetDisposalClient, { type AssetDisposal } from '../../../components/asset-disposal-client';

export const dynamic = 'force-dynamic';

export default async function AssetDisposalsPage() {
  const disposals = await getJson<AssetDisposal[]>('/api/assets/disposals');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Assets · Disposals</h1>
      <p style={st.sub}>
        Record the end of an asset&rsquo;s life — sale, scrap, write-off, trade-in or donation. The
        gain or loss against net book value is computed automatically, closing the asset lifecycle
        and feeding the disposal register.
      </p>
      <section style={{ marginTop: 10 }}>
        {disposals === null ? <p style={st.muted}>API offline.</p> : <AssetDisposalClient initial={disposals ?? []} />}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 780, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
