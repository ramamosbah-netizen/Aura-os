'use client';

import { type CSSProperties, useState } from 'react';

interface TenderAwardDialogProps {
  tenderId: string;
  tenderTitle?: string;
  disabled?: boolean;
  compact?: boolean;
  onAwarded?: () => void;
}

function localDateTimeValue(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * The only web entry point for a customer Tender award. The API deliberately rejects the generic
 * status endpoint for `won`; this dialog captures the minimum award evidence and calls the governed
 * `POST /award` command instead.
 */
export default function TenderAwardDialog({ tenderId, tenderTitle, disabled, compact, onAwarded }: TenderAwardDialogProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [awardedValue, setAwardedValue] = useState('');
  const [currency, setCurrency] = useState('AED');
  const [awardedAt, setAwardedAt] = useState('');
  const [awardReference, setAwardReference] = useState('');
  const [evidenceDocumentId, setEvidenceDocumentId] = useState('');

  function openDialog(): void {
    setError('');
    if (!awardedAt) setAwardedAt(localDateTimeValue(new Date()));
    setOpen(true);
  }

  function closeDialog(): void {
    if (!busy) setOpen(false);
  }

  async function submitAward(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');

    const value = Number(awardedValue);
    if (!Number.isFinite(value) || value < 0) {
      setError('Enter a valid awarded value (zero is allowed).');
      return;
    }
    const normalizedCurrency = currency.trim().toUpperCase();
    if (!normalizedCurrency) {
      setError('Currency is required.');
      return;
    }
    const date = new Date(awardedAt);
    if (!awardedAt || Number.isNaN(date.getTime())) {
      setError('Award date is required.');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/tendering/tenders/${encodeURIComponent(tenderId)}/award`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          awardedValue: value,
          currency: normalizedCurrency,
          awardedAt: date.toISOString(),
          ...(awardReference.trim() ? { awardReference: awardReference.trim() } : {}),
          ...(evidenceDocumentId.trim() ? { evidenceDocumentId: evidenceDocumentId.trim() } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = Array.isArray(data.message) ? data.message.join(', ') : data.message;
        setError(typeof message === 'string' ? message : typeof data.error === 'string' ? data.error : 'Unable to record the tender award.');
        return;
      }
      setOpen(false);
      onAwarded?.();
    } catch {
      setError('API unreachable. The award was not recorded.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn"
        style={compact ? styles.compactButton : styles.button}
        disabled={disabled || busy}
        onClick={openDialog}
        title="Capture customer award evidence through the governed award command"
      >
        {compact ? 'Won ✓' : 'Mark Won (Awarded)'}
      </button>

      {open && (
        <div style={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
          <div style={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="tender-award-title">
            <div style={styles.header}>
              <div>
                <div style={styles.eyebrow}>Governed customer award</div>
                <h2 id="tender-award-title" style={styles.title}>Record award{tenderTitle ? ` — ${tenderTitle}` : ''}</h2>
              </div>
              <button type="button" onClick={closeDialog} disabled={busy} style={styles.close} aria-label="Close award dialog">×</button>
            </div>

            <p style={styles.help}>A tender can become Won only with award evidence. This records the awarded value, currency and award date before the canonical award command runs.</p>

            <form onSubmit={(event) => void submitAward(event)}>
              <div style={styles.grid}>
                <label style={styles.field}>
                  <span>Awarded value</span>
                  <input autoFocus required type="number" min="0" step="0.01" value={awardedValue} onChange={(event) => setAwardedValue(event.target.value)} style={styles.input} placeholder="0.00" />
                </label>
                <label style={styles.field}>
                  <span>Currency</span>
                  <input required value={currency} onChange={(event) => setCurrency(event.target.value)} style={styles.input} placeholder="AED" />
                </label>
                <label style={styles.field}>
                  <span>Award date</span>
                  <input required type="datetime-local" value={awardedAt} onChange={(event) => setAwardedAt(event.target.value)} style={styles.input} />
                </label>
                <label style={styles.field}>
                  <span>Award reference <em>(optional)</em></span>
                  <input value={awardReference} onChange={(event) => setAwardReference(event.target.value)} style={styles.input} placeholder="LOA / award letter reference" />
                </label>
                <label style={{ ...styles.field, gridColumn: '1 / -1' }}>
                  <span>Evidence document ID <em>(optional)</em></span>
                  <input value={evidenceDocumentId} onChange={(event) => setEvidenceDocumentId(event.target.value)} style={styles.input} placeholder="Existing DMS document ID" />
                </label>
              </div>

              {error && <div role="alert" style={styles.error}>{error}</div>}
              <div style={styles.actions}>
                <button type="button" className="btn btn-ghost" onClick={closeDialog} disabled={busy}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Recording…' : 'Record award'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

const styles = {
  button: { color: 'var(--good)', whiteSpace: 'nowrap' } as CSSProperties,
  compactButton: { color: 'var(--good)', padding: '4px 10px', fontSize: 12, whiteSpace: 'nowrap' } as CSSProperties,
  overlay: { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(5, 9, 18, 0.68)', display: 'grid', placeItems: 'center', padding: 20 } as CSSProperties,
  dialog: { width: 'min(560px, 100%)', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,.35)', padding: 22 } as CSSProperties,
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
