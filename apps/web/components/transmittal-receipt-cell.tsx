'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Who a conveyance was sent to, and which of them has said it arrived (ENG-05, ENG-06).
 *
 * The register used to show one free-text recipient and a single status. Between them they made two
 * different situations look identical: a document that reached everybody, and a document one of
 * three people has opened.
 *
 * PARTIAL RECEIPT IS NOT RECEIPT, and this cell is where that becomes visible. Each named recipient
 * carries their own answer, and the ones who have NOT answered are the point — "the Buyer has it,
 * Site has not" is what a document controller chases on, and a single green badge destroys it.
 *
 * The accept button appears only for somebody actually on the distribution. That is a courtesy, not
 * the control: the server refuses an acknowledgement from anybody it was not sent to, and this
 * shows the refusal rather than pretending it cannot happen.
 */

interface Recipient {
  id: string;
  userId: string;
  party: string;
  acknowledgedAt: string | null;
  acknowledgedNote: string | null;
}

interface Receipt {
  recipients: Recipient[];
  acknowledgedCount: number;
  fullyAcknowledged: boolean;
  outstanding: Recipient[];
}

const PARTY_LABEL: Record<string, string> = {
  site_engineer: 'Site Engineer',
  project_engineer: 'Project Engineer',
  procurement: 'Procurement',
  consultant: 'Consultant',
  client: 'Client',
  other: 'Recipient',
};

export default function TransmittalReceiptCell({ transmittalId, viewerId }: {
  transmittalId: string;
  /** The signed-in account, so the accept action is only offered to somebody on the distribution. */
  viewerId: string | null;
}) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/doccontrol/transmittals/${transmittalId}/receipt`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || result?.error || 'Could not read the receipt');
      setReceipt(result as Receipt);
    } catch (e: unknown) {
      // Says it could not answer rather than rendering an empty distribution, which would read as
      // "this was sent to nobody".
      setError(e instanceof Error ? e.message : 'Could not read the receipt');
      setReceipt(null);
    }
  }, [transmittalId]);

  useEffect(() => { void load(); }, [load]);

  const accept = async (): Promise<void> => {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/doccontrol/transmittals/${transmittalId}/acknowledge`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.message || result?.error || 'Could not acknowledge');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not acknowledge');
    } finally {
      setBusy(false);
    }
  };

  if (error) return <span style={s.error} data-testid={`receipt-error-${transmittalId}`}>{error}</span>;
  if (!receipt) return <span style={s.muted}>…</span>;
  if (receipt.recipients.length === 0) {
    // Not "delivered": nobody was addressed. Said plainly rather than left blank.
    return <span style={s.muted} data-testid={`receipt-none-${transmittalId}`}>No named recipients</span>;
  }

  const mine = viewerId ? receipt.recipients.find((r) => r.userId === viewerId) : undefined;

  return (
    <div style={s.wrap} data-testid={`receipt-${transmittalId}`}>
      <span style={receipt.fullyAcknowledged ? s.done : s.partial} data-testid={`receipt-count-${transmittalId}`}>
        {receipt.acknowledgedCount} of {receipt.recipients.length} acknowledged
      </span>
      <div style={s.people}>
        {receipt.recipients.map((r) => (
          <span
            key={r.id}
            style={r.acknowledgedAt ? s.ackd : s.waiting}
            data-testid={`receipt-person-${transmittalId}-${r.userId}`}
            title={r.acknowledgedNote ?? undefined}
          >
            {PARTY_LABEL[r.party] ?? r.party} · {r.userId} · {r.acknowledgedAt ? 'received' : 'not yet'}
          </span>
        ))}
      </div>
      {mine && !mine.acknowledgedAt && (
        <button type="button" style={s.btn} disabled={busy} onClick={() => void accept()}
          data-testid={`receipt-accept-${transmittalId}`}>
          Acknowledge receipt
        </button>
      )}
    </div>
  );
}

const s = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' },
  people: { display: 'flex', flexDirection: 'column', gap: 2 },
  muted: { color: 'var(--muted)', fontSize: 12 },
  error: { color: 'var(--bad)', fontSize: 12 },
  done: { color: 'var(--good)', fontSize: 12, fontWeight: 600 },
  // Deliberately not the "done" colour: some is not all.
  partial: { color: 'var(--warn, #b7791f)', fontSize: 12, fontWeight: 600 },
  ackd: { color: 'var(--muted)', fontSize: 11 },
  waiting: { color: 'var(--bad)', fontSize: 11 },
  btn: {
    marginTop: 2, padding: '3px 9px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
    border: '1px solid var(--border)', borderRadius: 7, background: 'var(--panel)', color: 'var(--text)',
  },
} as const satisfies Record<string, React.CSSProperties>;
