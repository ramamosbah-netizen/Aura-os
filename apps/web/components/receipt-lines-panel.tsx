'use client';

import { useCallback, useEffect, useState } from 'react';

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
      <p style={s.muted} data-testid={`receipt-lines-no-po-${grnId}`}>
        This note is not against a purchase order, so there are no ordered lines to receive against.
      </p>
    );
  }
  if (recorded === null && error) return <p style={s.error} data-testid="receipt-lines-error">{error}</p>;

  return (
    <div style={s.wrap} data-testid={`receipt-lines-${grnId}`}>
      {recorded && recorded.length > 0 && (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>#</th>
              <th style={s.th}>Against</th>
              <th style={s.thNum}>Accepted</th>
              <th style={s.thNum}>Rejected</th>
              <th style={s.th}>Reason</th>
            </tr>
          </thead>
          <tbody>
            {recorded.map((r) => {
              const l = lineOf(r.poLineId);
              return (
                <tr key={r.id} data-testid={`receipt-entry-${r.lineNo}`}>
                  <td style={s.td}>{r.lineNo}</td>
                  <td style={s.td}>{l ? `${l.materialCode} — ${l.materialName}` : r.poLineId}</td>
                  <td style={s.tdNum}>{r.quantityAccepted}{l ? ` ${l.uom}` : ''}</td>
                  <td style={r.quantityRejected > 0 ? s.tdNumBad : s.tdNum}>
                    {r.quantityRejected}{l ? ` ${l.uom}` : ''}
                  </td>
                  <td style={s.tdMuted}>{r.rejectionReason ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div style={s.form}>
        <select style={s.input} value={poLineId} onChange={(e) => setPoLineId(e.target.value)}
          data-testid="receipt-line-order-line" aria-label="Which ordered line arrived">
          <option value="">Which ordered line arrived…</option>
          {orderLines.map((l) => (
            <option key={l.id} value={l.id}>
              {l.lineNo}. {l.materialCode} — {l.quantity} {l.uom} ordered
            </option>
          ))}
        </select>
        <div style={s.qtyWrap}>
          <input style={s.input} value={accepted} onChange={(e) => setAccepted(e.target.value)}
            inputMode="decimal" placeholder="Accepted" data-testid="receipt-line-accepted" aria-label="Quantity accepted" />
          <span style={s.uom} data-testid="receipt-line-uom">{chosen?.uom ?? '—'}</span>
        </div>
        <input style={s.input} value={rejected} onChange={(e) => setRejected(e.target.value)}
          inputMode="decimal" placeholder="Rejected" data-testid="receipt-line-rejected" aria-label="Quantity rejected" />
        {/* Only asked for when something is being rejected — and then the server insists on it. */}
        {Number(rejected) > 0 && (
          <input style={s.inputWide} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Why was it rejected?" data-testid="receipt-line-reason" aria-label="Rejection reason" />
        )}
        <button type="button" style={s.btn} disabled={busy || !poLineId}
          onClick={() => void record()} data-testid="receipt-line-record">
          Record
        </button>
      </div>

      {error && <p style={s.error} data-testid="receipt-lines-refusal">{error}</p>}
    </div>
  );
}

const s = {
  wrap: { padding: '10px 12px', background: 'var(--bg)', borderTop: '1px solid var(--border)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 },
  th: { textAlign: 'left', padding: '5px 8px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 },
  thNum: { textAlign: 'right', padding: '5px 8px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 },
  td: { padding: '6px 8px', borderBottom: '1px solid var(--border)' },
  tdMuted: { padding: '6px 8px', borderBottom: '1px solid var(--border)', color: 'var(--muted)' },
  tdNum: { padding: '6px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', whiteSpace: 'nowrap' },
  tdNumBad: { padding: '6px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--bad)' },
  form: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'center' },
  qtyWrap: { display: 'flex', alignItems: 'center', gap: 6 },
  uom: { color: 'var(--muted)', fontSize: 12, minWidth: 24 },
  input: { padding: '6px 9px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--panel)', color: 'var(--text)' },
  inputWide: { padding: '6px 9px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--panel)', color: 'var(--text)', minWidth: 220 },
  btn: { padding: '6px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--panel)', color: 'var(--text)' },
  muted: { color: 'var(--muted)', fontSize: 12, padding: '10px 12px', margin: 0 },
  error: { color: 'var(--bad)', fontSize: 12, margin: '8px 0 0' },
} as const satisfies Record<string, React.CSSProperties>;
