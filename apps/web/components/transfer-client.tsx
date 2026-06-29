'use client';

import { type CSSProperties, useState } from 'react';

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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function TransferClient({ initialItems, initialTransfers }: { initialItems: StockItem[]; initialTransfers: Transfer[] }) {
  const [items] = useState(initialItems);
  const [transfers, setTransfers] = useState(initialTransfers);
  const [sourceId, setSourceId] = useState('');
  const [destId, setDestId] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!sourceId || !destId) return setError('Select source and destination items');
    if (sourceId === destId) return setError('Source and destination must differ');
    const q = Number(qty);
    if (!(q > 0)) return setError('Quantity must be positive');
    setBusy(true);
    try {
      const res = await fetch('/api/inventory/transfers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceItemId: sourceId, destItemId: destId, quantity: q, reason: reason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Transfer failed');
      setTransfers((prev) => [data, ...prev]);
      setQty('');
      setReason('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const label = (it: StockItem) => `${it.code} — ${it.name} (${it.warehouse}, ${it.quantityOnHand} ${it.unit})`;

  return (
    <>
      <div style={st.form}>
        <label style={st.label}>
          Source
          <select style={st.input} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            <option value="">— select —</option>
            {items.map((i) => <option key={i.id} value={i.id}>{label(i)}</option>)}
          </select>
        </label>
        <label style={st.label}>
          Destination
          <select style={st.input} value={destId} onChange={(e) => setDestId(e.target.value)}>
            <option value="">— select —</option>
            {items.map((i) => <option key={i.id} value={i.id}>{label(i)}</option>)}
          </select>
        </label>
        <label style={st.label}>
          Qty
          <input style={st.input} type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
        </label>
        <label style={st.label}>
          Reason
          <input style={st.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="warehouse transfer" />
        </label>
        <button style={st.btn} disabled={busy} onClick={submit}>{busy ? 'Transferring…' : 'Transfer'}</button>
        {error && <p style={st.err}>{error}</p>}
      </div>

      <h2 style={st.h2}>Recent Transfers</h2>
      {transfers.length === 0 ? (
        <p style={st.muted}>No transfers yet.</p>
      ) : (
        <table style={st.table}>
          <thead>
            <tr>
              <th style={st.th}>Date</th>
              <th style={st.th}>Qty</th>
              <th style={st.th}>Reason</th>
              <th style={st.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((t) => (
              <tr key={t.id}>
                <td style={st.td}>{fmtDate(t.createdAt)}</td>
                <td style={st.td}>{t.quantity}</td>
                <td style={st.td}>{t.reason}</td>
                <td style={st.td}>{t.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

const st = {
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 28 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 160 } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  err: { color: '#dc2626', margin: '6px 0 0', fontSize: 13, width: '100%' } as CSSProperties,
  h2: { fontSize: 20, margin: '0 0 10px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
};
