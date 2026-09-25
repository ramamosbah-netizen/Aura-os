'use client';

import { type CSSProperties, useState } from 'react';

interface TenderSubmitDialogProps {
  tenderId: string;
  tenderTitle?: string;
  disabled?: boolean;
  /** Why the button is disabled, when it is — the readiness gaps in words. */
  disabledReason?: string;
  onSubmitted?: () => void;
}

const METHODS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'portal', label: 'Client e-tender portal' },
  { value: 'email', label: 'Email' },
  { value: 'in_person', label: 'Delivered in person' },
  { value: 'courier', label: 'Courier' },
  { value: 'other', label: 'Other' },
];

/**
 * Recording that a bid went to the client — WITH its facts.
 *
 * "Submit Tender" used to flip the status through the generic status route, which records a
 * submission with no method, no reference and the tender's own value rather than the approved
 * offer's. The governed `POST /submit` resolves the submitted value on the server from the approved
 * commercial baseline — the request cannot nominate it — and records how and where the bid went.
 */
export default function TenderSubmitDialog({ tenderId, tenderTitle, disabled, disabledReason, onSubmitted }: TenderSubmitDialogProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [method, setMethod] = useState('portal');
  const [portal, setPortal] = useState('');
  const [reference, setReference] = useState('');
  const [validUntil, setValidUntil] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');
    if (!reference.trim()) {
      setError('A submission reference is required — the portal receipt, email subject or transmittal number the client will quote back.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/tendering/tenders/${encodeURIComponent(tenderId)}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          method,
          reference: reference.trim(),
          ...(method === 'portal' && portal.trim() ? { portal: portal.trim() } : {}),
          ...(validUntil ? { validUntil } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = Array.isArray(data.message) ? data.message.join(', ') : data.message;
        setError(typeof message === 'string' ? message : typeof data.error === 'string' ? data.error : 'The submission was not recorded.');
        return;
      }
      setOpen(false);
      onSubmitted?.();
    } catch {
      setError('API unreachable. The submission was not recorded.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn"
        style={styles.button}
        disabled={disabled || busy}
        onClick={() => { setError(''); setOpen(true); }}
        title={disabledReason ?? 'Record the approved bid submission, with how and where it went'}
        data-testid="tender-submit-open"
      >
        Submit Tender
      </button>

      {open && (
        <div style={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setOpen(false); }}>
          <div style={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="tender-submit-title">
            <div style={styles.header}>
              <div>
                <div style={styles.eyebrow}>Bid submission</div>
                <h2 id="tender-submit-title" style={styles.title}>Record submission{tenderTitle ? ` — ${tenderTitle}` : ''}</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} disabled={busy} style={styles.close} aria-label="Close submission dialog">×</button>
            </div>

            <p style={styles.help}>
              The submitted value is the approved offer&apos;s, taken by the server from its locked commercial baseline — it is not
              entered here. Record how the bid went and the reference the client will quote back.
            </p>

            <form onSubmit={(event) => void submit(event)}>
              <div style={styles.grid}>
                <label style={styles.field}>
                  <span>Method</span>
                  <select value={method} onChange={(event) => setMethod(event.target.value)} style={styles.input} data-testid="tender-submit-method">
                    {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </label>
                <label style={styles.field}>
                  <span>Reference</span>
                  <input required value={reference} onChange={(event) => setReference(event.target.value)} style={styles.input} placeholder="Portal receipt / transmittal no." data-testid="tender-submit-reference" />
                </label>
                {method === 'portal' && (
                  <label style={styles.field}>
                    <span>Portal <em>(optional)</em></span>
                    <input value={portal} onChange={(event) => setPortal(event.target.value)} style={styles.input} placeholder="e.g. Aldar e-Tender" data-testid="tender-submit-portal" />
                  </label>
                )}
                <label style={styles.field}>
                  <span>Offer valid until <em>(optional)</em></span>
                  <input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} style={styles.input} data-testid="tender-submit-valid-until" />
                </label>
              </div>

              {error && <div role="alert" style={styles.error}>{error}</div>}
              <div style={styles.actions}>
                <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={busy} data-testid="tender-submit-confirm">{busy ? 'Recording…' : 'Record submission'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

const styles = {
  button: { whiteSpace: 'nowrap' } as CSSProperties,
  overlay: { position: 'fixed', inset: 0, zIndex: 1000, background: 'var(--overlay)', display: 'grid', placeItems: 'center', padding: 20 } as CSSProperties,
  dialog: { width: 'min(560px, 100%)', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 24px 80px var(--overlay)', padding: 22 } as CSSProperties,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 } as CSSProperties,
  eyebrow: { color: 'var(--accent)', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase' } as CSSProperties,
  title: { margin: '5px 0 0', fontSize: 20 } as CSSProperties,
  close: { border: 0, background: 'transparent', color: 'var(--muted)', fontSize: 26, lineHeight: 1, cursor: 'pointer' } as CSSProperties,
  help: { color: 'var(--muted)', fontSize: 13, lineHeight: 1.5, margin: '16px 0 20px' } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--text)', fontSize: 12.5, fontWeight: 600 } as CSSProperties,
  input: { width: '100%', boxSizing: 'border-box', background: 'var(--bg, var(--panel))', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '9px 10px', fontSize: 13, fontWeight: 400 } as CSSProperties,
  error: { marginTop: 14, padding: '9px 11px', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--bad) 45%, transparent)', color: 'var(--bad)', background: 'color-mix(in srgb, var(--bad) 9%, transparent)', fontSize: 12.5 } as CSSProperties,
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 9, marginTop: 20 } as CSSProperties,
};
