'use client';

import { type CSSProperties, useCallback, useEffect, useState } from 'react';

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

  if (error) {
    return (
      <section className="panel" style={st.section}>
        <div style={st.head}>Delivery</div>
        <p style={st.bad} data-testid="order-receipt-error">{error}</p>
      </section>
    );
  }
  if (!receipt) {
    return (
      <section className="panel" style={st.section}>
        <div style={st.head}>Delivery</div>
        <p style={st.muted}>Loading…</p>
      </section>
    );
  }

  if (!receipt.determinable) {
    // Unanswerable, not empty. An order raised before lines existed has no positions to measure.
    return (
      <section className="panel" style={st.section} data-testid={`order-receipt-${poId}`}>
        <div style={st.head}>Delivery</div>
        <p style={st.muted} data-testid="order-receipt-undeterminable">
          This order has no lines, so its delivery position cannot be measured here.
        </p>
      </section>
    );
  }

  return (
    <section className="panel" style={st.section} data-testid={`order-receipt-${poId}`}>
      <div style={st.head}>
        Delivery
        <span className={receipt.fullyReceived ? 'badge badge-good' : 'badge badge-warn'}>
          {receipt.fullyReceived ? 'complete' : 'outstanding'}
        </span>
      </div>

      <p style={receipt.fullyReceived ? st.good : st.chasing} data-testid="order-receipt-headline">
        {receipt.description}
      </p>

      <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th style={st.wNum}>#</th>
            <th>Material</th>
            <th style={st.right}>Ordered</th>
            <th style={st.right}>Received</th>
            <th style={st.right}>Outstanding</th>
            <th style={st.right}>Still committed</th>
          </tr>
        </thead>
        <tbody>
          {receipt.lines.map((l) => (
            <tr key={l.poLineId} data-testid={`receipt-line-${l.lineNo}`}>
              <td style={st.wNum}>{l.lineNo}</td>
              <td>
                <div style={st.strong}>{l.materialCode}</div>
                <div style={st.sub}>{l.materialName}</div>
              </td>
              <td style={st.right}>{l.ordered} {l.uom}</td>
              <td style={st.right} data-testid={`receipt-line-accepted-${l.lineNo}`}>
                {l.accepted} {l.uom}
                {/* Shown BESIDE the accepted figure, never added to it: a rejected delivery is
                    not progress against the order, because the material is still owed. */}
                {l.rejected > 0 && (
                  <div style={st.rejected} data-testid={`receipt-line-rejected-${l.lineNo}`}>
                    {l.rejected} {l.uom} rejected — not received
                  </div>
                )}
                {l.overReceived && (
                  <div style={st.warn} data-testid={`receipt-line-over-${l.lineNo}`}>more arrived than was ordered</div>
                )}
              </td>
              <td style={l.settled ? st.rightMuted : st.rightOwed} data-testid={`receipt-line-outstanding-${l.lineNo}`}>
                {l.settled ? 'settled' : `${l.outstanding} ${l.uom}`}
              </td>
              <td style={st.right}>{l.settled ? '—' : money(l.outstandingValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <div style={st.foot}>
        <strong style={receipt.outstandingValue > 0 ? st.chasing : st.good} data-testid="order-receipt-exposure">
          {receipt.outstandingValue > 0
            ? `${money(receipt.outstandingValue)} still committed`
            : 'nothing still committed'}
        </strong>
        <span style={st.sub}>what is still owed, at the price it was ordered at</span>
      </div>
    </section>
  );
}

const st = {
  section: { marginTop: 16, padding: '14px 16px' } as CSSProperties,
  head: { display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 14, marginBottom: 8 } as CSSProperties,
  strong: { fontWeight: 600 } as CSSProperties,
  sub: { color: 'var(--muted)', fontSize: 11.5, marginTop: 2 } as CSSProperties,
  rejected: { color: 'var(--bad)', fontSize: 11.5, marginTop: 2 } as CSSProperties,
  warn: { color: 'var(--warn, #b7791f)', fontSize: 11.5, marginTop: 2 } as CSSProperties,
  bad: { color: 'var(--bad)', fontSize: 12.5, margin: '10px 0 0' } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 13, margin: '6px 0' } as CSSProperties,
  // Deliberately not the settled colour while anything is owed.
  chasing: { color: 'var(--warn, #b7791f)', fontSize: 13, margin: '0 0 10px', fontWeight: 600 } as CSSProperties,
  good: { color: 'var(--good)', fontSize: 13, margin: '0 0 10px', fontWeight: 600 } as CSSProperties,
  right: { textAlign: 'right', whiteSpace: 'nowrap' } as CSSProperties,
  rightMuted: { textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--muted)' } as CSSProperties,
  rightOwed: { textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--warn, #b7791f)', fontWeight: 600 } as CSSProperties,
  wNum: { width: 44 } as CSSProperties,
  foot: { display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end', marginTop: 12 } as CSSProperties,
};
