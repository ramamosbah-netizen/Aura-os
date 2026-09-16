'use client';

import { type CSSProperties, useCallback, useEffect, useState } from 'react';

/**
 * Recording what actually arrived, against the order line it answers (`BUY-05`).
 *
 * A delivery note used to carry one number for the whole order, so a storekeeper receiving three
 * cameras out of twelve had nowhere to say which material they were or how many were still coming.
 * The order then read as fully received, because one number against a whole order can only be all
 * or nothing.
 *
 * So a receipt LINE answers ONE ORDER LINE, and the two quantities are entered separately:
 *
 *   ACCEPTED is what was kept. It is the only figure that reduces what the order still owes.
 *   REJECTED is what arrived and went back. Real, recorded against the supplier, and NOT progress —
 *   the material is still owed. It costs a reason, because a rejection nobody explained cannot be
 *   acted on by anybody.
 */

interface OrderLine {
  id: string;
  lineNo: number;
  materialCode: string;
  materialName: string;
  uom: string;
  quantity: number;
}

interface ReceiptLine {
  id: string;
  lineNo: number;
  poLineId: string;
  quantityAccepted: number;
  quantityRejected: number;
  rejectionReason: string | null;
}

export default function ReceiptLinesPanel({ grnId, poId }: { grnId: string; poId: string | null }) {
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [recorded, setRecorded] = useState<ReceiptLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [poLineId, setPoLineId] = useState('');
  const [accepted, setAccepted] = useState('');
  const [rejected, setRejected] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/inventory/grns/${grnId}/lines`, { cache: 'no-store' });
      const body = await res.json().catch(() => []);
      if (!res.ok) throw new Error(body?.message || body?.error || 'Could not read this note');
      setRecorded(body as ReceiptLine[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not read this note');
      setRecorded(null);
    }
  }, [grnId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!poId) return;
    void (async () => {
      const res = await fetch(`/api/procurement/purchase-orders/${poId}/lines`, { cache: 'no-store' });
      if (res.ok) setOrderLines((await res.json().catch(() => [])) as OrderLine[]);
    })();
  }, [poId]);

  const chosen = orderLines.find((l) => l.id === poLineId) ?? null;

  const record = async (): Promise<void> => {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/inventory/grns/${grnId}/lines`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          poLineId,
          quantityAccepted: accepted.trim() === '' ? 0 : Number(accepted),
          quantityRejected: rejected.trim() === '' ? 0 : Number(rejected),
          rejectionReason: reason.trim() || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || body?.error || 'The note refused that');
      setPoLineId(''); setAccepted(''); setRejected(''); setReason('');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'The note refused that');
    } finally {
      setBusy(false);
    }
  };

  const lineOf = (id: string) => orderLines.find((l) => l.id === id) ?? null;

  if (!poId) {
    return (
      <div style={st.wrap}>
        <p style={st.muted} data-testid={`receipt-lines-no-po-${grnId}`}>
          This note is not against a purchase order, so there are no ordered lines to receive against.
        </p>
      </div>
    );
  }

  return (
    <div style={st.wrap} data-testid={`receipt-lines-${grnId}`}>
      {recorded && recorded.length > 0 && (
        <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th style={st.wNum}>#</th>
              <th>Against</th>
              <th style={st.right}>Accepted</th>
              <th style={st.right}>Rejected</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {recorded.map((r) => {
              const l = lineOf(r.poLineId);
              return (
                <tr key={r.id} data-testid={`receipt-entry-${r.lineNo}`}>
                  <td style={st.wNum}>{r.lineNo}</td>
                  <td>{l ? `${l.materialCode} — ${l.materialName}` : r.poLineId}</td>
                  <td style={st.right}>{r.quantityAccepted}{l ? ` ${l.uom}` : ''}</td>
                  <td style={r.quantityRejected > 0 ? st.rightBad : st.right}>
                    {r.quantityRejected}{l ? ` ${l.uom}` : ''}
                  </td>
                  <td style={st.mutedCell}>{r.rejectionReason ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}

      <div style={st.form}>
        <select className="select" value={poLineId} onChange={(e) => setPoLineId(e.target.value)}
          data-testid="receipt-line-order-line" aria-label="Which ordered line arrived">
          <option value="">Which ordered line arrived…</option>
          {orderLines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.lineNo}. {l.materialCode} — {l.quantity} {l.uom} ordered
            </option>
          ))}
        </select>
        <div style={st.qty}>
          <input className="input" style={st.narrow} value={accepted} onChange={(e) => setAccepted(e.target.value)}
            inputMode="decimal" placeholder="Accepted" data-testid="receipt-line-accepted" aria-label="Quantity accepted" />
          <span style={st.uom} data-testid="receipt-line-uom">{chosen?.uom ?? '—'}</span>
        </div>
        <input className="input" style={st.narrow} value={rejected} onChange={(e) => setRejected(e.target.value)}
          inputMode="decimal" placeholder="Rejected" data-testid="receipt-line-rejected" aria-label="Quantity rejected" />
        {/* Only asked for when something is being rejected — and then the server insists on it. */}
        {Number(rejected) > 0 && (
          <input className="input" style={st.wide} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Why was it rejected?" data-testid="receipt-line-reason" aria-label="Rejection reason" />
        )}
        <button type="button" className="btn btn-primary" disabled={busy || !poLineId}
          onClick={() => void record()} data-testid="receipt-line-record">
          Record
        </button>
      </div>

      {error && <p style={st.bad} data-testid="receipt-lines-refusal">{error}</p>}
    </div>
  );
}

const st = {
  wrap: { padding: '12px 14px', background: 'var(--panel-2)', borderTop: '1px solid var(--border)' } as CSSProperties,
  form: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, alignItems: 'center' } as CSSProperties,
  qty: { display: 'flex', alignItems: 'center', gap: 6 } as CSSProperties,
  narrow: { maxWidth: 150 } as CSSProperties,
  wide: { minWidth: 240 } as CSSProperties,
  uom: { color: 'var(--muted)', fontSize: 12.5, minWidth: 24 } as CSSProperties,
  right: { textAlign: 'right', whiteSpace: 'nowrap' } as CSSProperties,
  rightBad: { textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--bad)' } as CSSProperties,
  mutedCell: { color: 'var(--muted)' } as CSSProperties,
  wNum: { width: 44 } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 13, margin: 0 } as CSSProperties,
  bad: { color: 'var(--bad)', fontSize: 12.5, margin: '10px 0 0' } as CSSProperties,
};
