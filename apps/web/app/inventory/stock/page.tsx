import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import StockClient from '../../../components/stock-client';

export const dynamic = 'force-dynamic';

interface StockItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  warehouse: string;
  quantityOnHand: number;
}

export default async function StockPage() {
  const items = await getJson<StockItem[]>('/api/inventory/stock');

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Inventory · Stock</h1>
      <p style={st.sub}>
        Track what&apos;s actually held — live on-hand per item and warehouse. Receipts add stock, issues
        consume it (an issue can never drive on-hand below zero); every movement is recorded.
      </p>
      <section style={{ marginTop: 10 }}>
        {items === null ? <p style={st.muted}>API offline.</p> : <StockClient initialItems={items} />}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 980, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 700, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
