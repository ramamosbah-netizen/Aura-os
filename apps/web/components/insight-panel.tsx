'use client';

import { type CSSProperties, useState } from 'react';

interface Briefing {
  text: string;
  provider: string;
  model: string;
}

/** On-demand AI briefing over the deal-chain pipeline. Posts to the BFF, which forwards
 *  to the Nest Intelligence API → kernel AI seam. Local echo until ANTHROPIC_API_KEY. */
export default function InsightPanel() {
  const [busy, setBusy] = useState(false);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function generate(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/intelligence/insights', { method: 'POST' });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(d.error ?? `Error ${res.status}`);
      } else {
        setBriefing((await res.json()) as Briefing);
      }
    } catch {
      setErr('Could not reach the API.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={s.panel}>
      <div style={s.head}>
        <h2 style={s.h2}>AI briefing</h2>
        <button style={s.btn} onClick={generate} disabled={busy}>
          {busy ? 'Thinking…' : briefing ? 'Regenerate' : 'Generate briefing'}
        </button>
      </div>
      {err ? <p style={s.err}>{err}</p> : null}
      {briefing ? (
        <>
          <p style={s.text}>{briefing.text}</p>
          <div style={s.badge}>
            {briefing.provider} · {briefing.model}
          </div>
        </>
      ) : (
        <p style={s.muted}>
          Generate an executive briefing over the current pipeline. Uses the local model until an{' '}
          <code style={s.code}>ANTHROPIC_API_KEY</code> is set on the API.
        </p>
      )}
    </section>
  );
}

const s = {
  panel: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '18px 18px',
    marginTop: 26,
  } as CSSProperties,
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } as CSSProperties,
  h2: { fontSize: 16, margin: 0 } as CSSProperties,
  btn: {
    background: 'var(--accent)',
    color: '#0b0e14',
    fontWeight: 600,
    border: 'none',
    borderRadius: 10,
    padding: '8px 14px',
    fontSize: 13.5,
    cursor: 'pointer',
  } as CSSProperties,
  text: { lineHeight: 1.6, margin: '14px 0 10px', whiteSpace: 'pre-wrap' } as CSSProperties,
  badge: {
    display: 'inline-block',
    fontSize: 12,
    color: 'var(--muted)',
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '2px 8px',
  } as CSSProperties,
  muted: { color: 'var(--muted)', margin: '14px 0 0', lineHeight: 1.5 } as CSSProperties,
  code: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 12,
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    padding: '1px 5px',
  } as CSSProperties,
  err: { color: 'var(--bad)', margin: '12px 0 0', fontSize: 13.5 } as CSSProperties,
};
