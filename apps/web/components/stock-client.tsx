'use client';

import { type CSSProperties, Fragment, useState } from 'react';

interface StockItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  warehouse: string;
  quantityOnHand: number;
}

interface Movement {
  id: string;
  direction: 'in' | 'out';
  quantity: number;
  reason: string;
  balanceAfter: number;
  createdAt: string;
}

interface Detail {
  item: StockItem;
  movements: Movement[];
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function StockClient({ initialItems }: { initialItems: StockItem[] }) {
  const [items, setItems] = useState<StockItem[]>(initialItems);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [err, setErr] = useState('');

  // create form
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [opening, setOpening] = useState('');

  // movement form
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');

  async function refresh(): Promise<void> {
    const res = await fetch('/api/inventory/stock');
    if (res.ok) setItems(await res.json());
  }

  async function createItem(): Promise<void> {
    if (!code.trim() || !name.trim()) {
      setErr('Code and name are required');
      return;
    }
    setErr('');
    const res = await fetch('/api/inventory/stock', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, name, unit: unit || undefined, openingQty: opening ? Number(opening) : undefined }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d.message ?? d.error ?? 'Failed to create item');
      return;
    }
    setCode('');
    setName('');
    setUnit('');
    setOpening('');
    await refresh();
  }

  async function open(id: string): Promise<void> {
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(id);
    setDetail(null);
    const res = await fetch(`/api/inventory/stock/${id}`);
    if (res.ok) setDetail(await res.json());
  }

  async function move(id: string, direction: 'in' | 'out'): Promise<void> {
    if (!(Number(qty) > 0)) {
      setErr('Quantity must be positive');
      return;
    }
    setErr('');
    const res = await fetch(`/api/inventory/stock/${id}/movements`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ direction, quantity: Number(qty), reason: reason || undefined }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d.message ?? d.error ?? 'Movement failed');
      return;
    }
    setQty('');
    setReason('');
    const dres = await fetch(`/api/inventory/stock/${id}`);
    if (dres.ok) setDetail(await dres.json());
    await refresh();
  }

  return (
    <div>
      <div style={s.createBar}>
        <input style={s.inputSm} placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
        <input style={s.input} placeholder="Item name" value={name} onChange={(e) => setName(e.target.value)} />
        <input style={s.inputXs} placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
        <input style={s.inputXs} placeholder="Opening" type="number" value={opening} onChange={(e) => setOpening(e.target.value)} />
        <button type="button" style={s.primary} onClick={createItem}>Add item</button>
      </div>
      {err && <p style={s.err}>{err}</p>}

      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Code</th>
            <th style={s.th}>Item</th>
            <th style={s.th}>Warehouse</th>
            <th style={s.thR}>On hand</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr><td style={s.muted} colSpan={4}>No stock items yet — add one above.</td></tr>
          ) : (
            items.map((it) => (
              <Fragment key={it.id}>
                <tr style={s.row} onClick={() => open(it.id)}>
                  <td style={s.tdCode}>{openId === it.id ? '▾ ' : '▸ '}{it.code}</td>
                  <td style={s.td}>{it.name}</td>
                  <td style={s.tdMuted}>{it.warehouse}</td>
                  <td style={it.quantityOnHand <= 0 ? s.tdLow : s.tdR}>{it.quantityOnHand} {it.unit}</td>
                </tr>
                {openId === it.id && (
                  <tr>
                    <td style={s.detailCell} colSpan={4}>
                      <div style={s.moveBar}>
                        <input style={s.inputXs} placeholder="Qty" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
                        <input style={s.input} placeholder="Reason (e.g. GRN receipt, site issue)" value={reason} onChange={(e) => setReason(e.target.value)} />
                        <button type="button" style={s.inBtn} onClick={() => move(it.id, 'in')}>Receive (in)</button>
                        <button type="button" style={s.outBtn} onClick={() => move(it.id, 'out')}>Issue (out)</button>
                      </div>
                      {!detail ? (
                        <p style={s.muted}>Loading movements…</p>
                      ) : detail.movements.length === 0 ? (
                        <p style={s.muted}>No movements yet.</p>
                      ) : (
                        <table style={s.subTable}>
                          <thead>
                            <tr><th style={s.thS}>When</th><th style={s.thS}>Type</th><th style={s.thSR}>Qty</th><th style={s.thS}>Reason</th><th style={s.thSR}>Balance</th></tr>
                          </thead>
                          <tbody>
                            {detail.movements.map((m) => (
                              <tr key={m.id}>
                                <td style={s.tdS}>{fmtDate(m.createdAt)}</td>
                                <td style={s.tdS}><span style={m.direction === 'in' ? s.inTag : s.outTag}>{m.direction === 'in' ? 'receipt' : 'issue'}</span></td>
                                <td style={s.tdSR}>{m.quantity}</td>
                                <td style={s.tdS}>{m.reason}</td>
                                <td style={s.tdSR}>{m.balanceAfter}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

const s = {
  createBar: { display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' } as CSSProperties,
  input: { flex: 1, minWidth: 140, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text)', padding: '9px 11px', fontSize: 13.5 } as CSSProperties,
  inputSm: { width: 110, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text)', padding: '9px 11px', fontSize: 13.5 } as CSSProperties,
  inputXs: { width: 86, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text)', padding: '9px 11px', fontSize: 13.5 } as CSSProperties,
  primary: { background: 'var(--accent)', border: 'none', borderRadius: 9, color: '#fff', padding: '9px 14px', fontSize: 13.5, cursor: 'pointer', fontWeight: 600 } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 13, margin: '4px 2px' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 12 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5 } as CSSProperties,
  thR: { textAlign: 'right', color: 'var(--muted)', fontWeight: 500, padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5 } as CSSProperties,
  row: { cursor: 'pointer', borderBottom: '1px solid var(--border)' } as CSSProperties,
  td: { padding: '10px' } as CSSProperties,
  tdCode: { padding: '10px', fontFamily: 'ui-monospace, monospace', fontSize: 13 } as CSSProperties,
  tdMuted: { padding: '10px', color: 'var(--muted)' } as CSSProperties,
  tdR: { padding: '10px', textAlign: 'right', fontWeight: 600 } as CSSProperties,
  tdLow: { padding: '10px', textAlign: 'right', fontWeight: 600, color: 'var(--bad)' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '12px 10px', fontSize: 13.5 } as CSSProperties,
  detailCell: { background: 'var(--panel-2)', padding: '12px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  moveBar: { display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' } as CSSProperties,
  inBtn: { background: 'var(--good)', border: 'none', borderRadius: 8, color: '#04210f', padding: '8px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600 } as CSSProperties,
  outBtn: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 12px', fontSize: 13, cursor: 'pointer' } as CSSProperties,
  subTable: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  thS: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, padding: '5px 8px', fontSize: 11.5 } as CSSProperties,
  thSR: { textAlign: 'right', color: 'var(--muted)', fontWeight: 500, padding: '5px 8px', fontSize: 11.5 } as CSSProperties,
  tdS: { padding: '6px 8px', borderTop: '1px solid var(--border)' } as CSSProperties,
  tdSR: { padding: '6px 8px', borderTop: '1px solid var(--border)', textAlign: 'right' } as CSSProperties,
  inTag: { fontSize: 11, color: 'var(--good)', border: '1px solid var(--good)', borderRadius: 999, padding: '0 7px' } as CSSProperties,
  outTag: { fontSize: 11, color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: 999, padding: '0 7px' } as CSSProperties,
};
