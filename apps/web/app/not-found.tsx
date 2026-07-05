import type { CSSProperties } from 'react';
import Link from 'next/link';

// Styled 404 — rendered inside the app shell so the user keeps sidebar + search
// and can recover without the browser back button.
export default function NotFound() {
  return (
    <div style={st.wrap}>
      <div style={st.code}>404</div>
      <h1 style={st.h1}>Page not found</h1>
      <p style={st.sub}>
        This page doesn&apos;t exist or has moved. Use the sidebar, or press{' '}
        <span style={st.kbd}>⌘K</span> to search and jump anywhere.
      </p>
      <Link href="/" style={st.btn}>
        ← Back to My Work
      </Link>
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
    padding: '96px 24px',
    gap: 6,
  } as CSSProperties,
  code: {
    fontSize: 56,
    fontWeight: 800,
    color: 'var(--accent)',
    letterSpacing: 2,
    lineHeight: 1,
  } as CSSProperties,
  h1: { fontSize: 22, margin: '10px 0 0' } as CSSProperties,
  sub: { color: 'var(--muted)', fontSize: 14, maxWidth: 420, lineHeight: 1.6 } as CSSProperties,
  kbd: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: 12,
    border: '1px solid var(--border)',
    borderRadius: 5,
    padding: '1px 6px',
    color: 'var(--text)',
  } as CSSProperties,
  btn: {
    marginTop: 18,
    display: 'inline-block',
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '9px 18px',
    color: 'var(--text)',
    fontSize: 14,
  } as CSSProperties,
};
