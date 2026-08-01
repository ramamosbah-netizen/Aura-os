'use client';

import { useEffect } from 'react';
import type { CSSProperties } from 'react';

// ErrorState — the recoverable error boundary UI shared by every route-level
// `error.tsx`. App Router error boundaries MUST be client components and receive
// `{ error, reset }`. Before this, a thrown render/fetch error showed Next's
// unstyled default (or a blank page); now the user keeps the app shell, sees a
// human message, and can retry (`reset`) without a hard reload.
//
// `label` names the area ("CRM", "Finance") so the message is contextual.
export default function ErrorState({
  error,
  reset,
  label,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  label?: string;
}) {
  useEffect(() => {
    // Surface to the console/monitoring; digest correlates with server logs.
    console.error(`[${label ?? 'app'}] route error:`, error);
  }, [error, label]);

  const where = label ? `${label} couldn’t load` : 'Something went wrong';

  return (
    <div style={st.wrap} role="alert">
      <div style={st.badge} aria-hidden>
        !
      </div>
      <h1 style={st.h1}>{where}</h1>
      <p style={st.sub}>
        An unexpected error interrupted this page. Your data is safe — this is a display
        problem, not a lost change. Try again, or use ⌘K to go elsewhere.
      </p>
      {error?.digest ? <p style={st.digest}>Reference: {error.digest}</p> : null}
      <div style={st.actions}>
        <button type="button" onClick={() => reset()} style={st.primary}>
          ↻ Try again
        </button>
        <a href="/" style={st.secondary}>
          Back to My Work
        </a>
      </div>
    </div>
  );
}

const st = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '84px 24px',
    gap: 4,
  } as CSSProperties,
  badge: {
    width: 46,
    height: 46,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 12,
    background: 'var(--bad-soft)',
    color: 'var(--bad)',
    fontSize: 24,
    fontWeight: 800,
    marginBottom: 10,
  } as CSSProperties,
  h1: { fontSize: 21, margin: 0, color: 'var(--text)' } as CSSProperties,
  sub: {
    color: 'var(--muted)',
    fontSize: 14,
    maxWidth: 440,
    lineHeight: 1.6,
    margin: '8px 0 0',
  } as CSSProperties,
  digest: {
    color: 'var(--muted)',
    fontSize: 11.5,
    fontFamily: 'ui-monospace, monospace',
    marginTop: 10,
  } as CSSProperties,
  actions: { display: 'flex', gap: 10, marginTop: 20 } as CSSProperties,
  primary: {
    background: 'var(--accent)',
    color: 'var(--accent-ink)',
    border: '1px solid var(--accent)',
    borderRadius: 10,
    padding: '9px 18px',
    fontSize: 13.5,
    fontWeight: 600,
    cursor: 'pointer',
  } as CSSProperties,
  secondary: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '9px 18px',
    fontSize: 13.5,
    color: 'var(--text)',
    textDecoration: 'none',
  } as CSSProperties,
};
