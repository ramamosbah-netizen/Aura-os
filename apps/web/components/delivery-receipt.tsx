'use client';

import { type CSSProperties, useState } from 'react';

/**
 * The next-role receipt (`BUY-07`): Site accepts material delivered to a work package.
 *
 * IT SENDS NO QUANTITY, AND THERE IS NO FIELD FOR ONE.
 *
 * The material already moved — a Storekeeper issued it and the movement is persisted. What was
 * delivered is derived from that movement and has one authority. A receipt that carried its own
 * figure would be a second writer of the same number, free to drift away from it, which is the
 * competing-truth defect this wave has spent itself removing. So this records exactly one new fact:
 * a named person accepted receipt of this movement.
 *
 * The refusals are the server's own words rather than a generic failure, because each of them tells
 * a storekeeper something different and actionable — nobody holds the responsibility yet, or you are
 * not the person who holds it, or you cannot sign for material you issued yourself.
 */
export default function DeliveryReceipt({ stockItemId, movementId, acknowledged, onDone }: {
  stockItemId: string;
  movementId: string;
  /**
   * Whether this delivery is ALREADY receipted, read from the server.
   *
   * Not component state. The row re-renders after every movement, and a receipt remembered only in
   * the browser vanishes with it — the next role acknowledges and the screen forgets, which looks
   * exactly like never having acknowledged at all.
   */
  acknowledged: boolean;
  onDone: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acknowledge = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/inventory/stock/${stockItemId}/movements/${movementId}/acknowledge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // No quantity. Deliberately — see above.
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || body?.error || 'The receipt was refused');
      await onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'The receipt was refused');
    } finally {
      setBusy(false);
    }
  };

  if (acknowledged) return <span style={st.done} data-testid={`receipt-done-${movementId}`}>Received ✓</span>;

  return (
    <span style={st.wrap}>
      <button
        type="button"
        className="btn btn-ghost"
        style={st.btn}
        disabled={busy}
        onClick={() => void acknowledge()}
        data-testid={`receipt-${movementId}`}
      >
        {busy ? 'Recording…' : 'Acknowledge'}
      </button>
      {error && <span style={st.bad} data-testid={`receipt-error-${movementId}`}>{error}</span>}
    </span>
  );
}

const st = {
  wrap: { display: 'inline-flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' } as CSSProperties,
  btn: { padding: '3px 9px', fontSize: 11.5 } as CSSProperties,
  done: { color: 'var(--good)', fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap' } as CSSProperties,
  bad: { color: 'var(--bad)', fontSize: 11, maxWidth: 260, lineHeight: 1.35 } as CSSProperties,
};
