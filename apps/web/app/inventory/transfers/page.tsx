import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import TransferClient from '../../../components/transfer-client';

export const dynamic = 'force-dynamic';

interface StockItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  warehouse: string;
  quantityOnHand: number;
}

interface Transfer {
  id: string;
  sourceItemId: string;
  destItemId: string;
  quantity: number;
  reason: string;
  status: string;
  createdAt: string;
}

export default async function TransfersPage() {
  const [items, transfers] = await Promise.all([
    getJson<StockItem[]>('/api/inventory/stock'),
    getJson<Transfer[]>('/api/inventory/transfers'),
  ]);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Inventory · Stock Transfers</h1>
      <p style={st.sub}>
        Move stock between warehouses. Pick a source item, a destination item (same SKU, different
        warehouse), and the quantity to transfer. The system issues from the source and receipts to the
        destination atomically — on-hand can never go negative.
      </p>
      <section style={{ marginTop: 10 }}>
        {items === null ? (
          <p style={st.muted}>API offline.</p>
        ) : (
          <TransferClient initialItems={items ?? []} initialTransfers={transfers ?? []} />
        )}
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
