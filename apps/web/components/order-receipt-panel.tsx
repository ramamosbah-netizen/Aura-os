'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Where a purchase order stands on delivery, line by line (`BUY-05`).
 *
 * The defect this replaces was visible on exactly this screen: receiving one item of an order for a
 * hundred showed the order as RECEIVED, and there was nowhere for "99 still outstanding" to appear
 * because the order had no lines.
 *
 * So the rules this has to carry are all about refusing to round:
 *
 *   AN ORDER IS A SET OF POSITIONS. Each line is settled or still owed, and the order is finished
 *   only when every one is. One percentage across the order would say "most of it" and leave nobody
 *   able to tell which material to chase.
 *
 *   ACCEPTED IS NOT DELIVERED. A rejected quantity arrived and was sent back. Real, and not
 *   progress — the material is still owed. It is shown beside the accepted figure, never folded in.
 *
 *   AND AN ORDER WITH NO LINES CANNOT BE MEASURED HERE AT ALL. That is unanswerable, not zero, and
 *   the panel says so rather than drawing an empty table that reads as "nothing has arrived".
 */

interface LineReceipt {
  poLineId: string;
  lineNo: number;
  materialCode: string;
  materialName: string;
  uom: string;
  ordered: number;
  accepted: number;
  rejected: number;
  outstanding: number;
  outstandingValue: number;
  settled: boolean;
  overReceived: boolean;
}

interface Receipt {
  lines: LineReceipt[];
  fullyReceived: boolean;
  anyReceived: boolean;
  outstanding: LineReceipt[];
  outstandingValue: number;
  determinable: boolean;
  description: string;
}

export default function OrderReceiptPanel({ poId, currency }: { poId: string; currency: string }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const money = (n: number): string =>
    `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/procurement/purchase-orders/${poId}/receipt`, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || body?.error || 'Could not read the delivery position');
      setReceipt(body as Receipt);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not read the delivery position');
      setReceipt(null);
    }
  }, [poId]);

  useEffect(() => { void load(); }, [load]);

  if (error) return <p style={s.error} data-testid="order-receipt-error">{error}</p>;
  if (!receipt) return <p style={s.muted}>Loading the delivery position…</p>;

  if (!receipt.determinable) {
    // Unanswerable, not empty. An order raised before lines existed has no positions to measure.
    return (
      <section style={s.wrap} data-testid={`order-receipt-${poId}`}>
        <h3 style={s.h3}>Delivery</h3>
        <p style={s.muted} data-testid="order-receipt-undeterminable">
          This order has no lines, so its delivery position cannot be measured here.
        </p>
      </section>
    );
  }

  return (
    <section style={s.wrap} data-testid={`order-receipt-${poId}`}>
      <h3 style={s.h3}>Delivery</h3>

      <p style={receipt.fullyReceived ? s.done : s.chasing} data-testid="order-receipt-headline">
        {receipt.description}
      </p>

      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>#</th>
            <th style={s.th}>Material</th>
            <th style={s.thNum}>Ordered</th>
            <th style={s.thNum}>Received</th>
            <th style={s.thNum}>Outstanding</th>
            <th style={s.thNum}>Still committed</th>
          </tr>
        </thead>
        <tbody>
          {receipt.lines.map((l) => (
            <tr key={l.poLineId} data-testid={`receipt-line-${l.lineNo}`}>
              <td style={s.td}>{l.lineNo}</td>
              <td style={s.td}>
                <strong>{l.materialCode}</strong>
                <div style={s.sub}>{l.materialName}</div>
              </td>
              <td style={s.tdNum}>{l.ordered} {l.uom}</td>
              <td style={s.tdNum} data-testid={`receipt-line-accepted-${l.lineNo}`}>
                {l.accepted} {l.uom}
                {/* Shown BESIDE the accepted figure, never added to it: a rejected delivery is
                    not progress against the order, because the material is still owed. */}
                {l.rejected > 0 && (
                  <div style={s.rejected} data-testid={`receipt-line-rejected-${l.lineNo}`}>
                    {l.rejected} {l.uom} rejected — not received
                  </div>
                )}
                {l.overReceived && (
                  <div style={s.over} data-testid={`receipt-line-over-${l.lineNo}`}>more arrived than was ordered</div>
                )}
              </td>
              <td style={l.settled ? s.tdNumDone : s.tdNumOwed} data-testid={`receipt-line-outstanding-${l.lineNo}`}>
                {l.settled ? 'settled' : `${l.outstanding} ${l.uom}`}
              </td>
              <td style={s.tdNum}>{l.settled ? '—' : money(l.outstandingValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={s.totals}>
        <strong style={receipt.outstandingValue > 0 ? s.chasing : s.done} data-testid="order-receipt-exposure">
          {receipt.outstandingValue > 0
            ? `${money(receipt.outstandingValue)} still committed`
            : 'nothing still committed'}
        </strong>
        <span style={s.sub}>what is still owed, at the price it was ordered at</span>
      </div>
    </section>
  );
}

const s = {
  wrap: { marginTop: 18, border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', background: 'var(--panel)' },
  h3: { fontSize: 15, margin: '0 0 8px', letterSpacing: -0.2 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 },
  thNum: { textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 },
  td: { padding: '7px 8px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' },
  tdNum: { padding: '7px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' },
  tdNumOwed: { padding: '7px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap', color: 'var(--warn, #b7791f)', fontWeight: 600 },
  tdNumDone: { padding: '7px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap', color: 'var(--muted)' },
  sub: { color: 'var(--muted)', fontSize: 11, marginTop: 2 },
  rejected: { color: 'var(--bad)', fontSize: 11, marginTop: 2 },
  over: { color: 'var(--warn, #b7791f)', fontSize: 11, marginTop: 2 },
  // Deliberately not the settled colour while anything is owed.
  chasing: { color: 'var(--warn, #b7791f)', fontSize: 13, margin: '0 0 10px', fontWeight: 600 },
  done: { color: 'var(--good)', fontSize: 13, margin: '0 0 10px', fontWeight: 600 },
  totals: { display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end', marginTop: 10 },
  muted: { color: 'var(--muted)', fontSize: 12, margin: '4px 0' },
  error: { color: 'var(--bad)', fontSize: 12, margin: '8px 0 0' },
} as const satisfies Record<string, React.CSSProperties>;
