'use client';

import { useEffect } from 'react';
import './globals.css';

// global-error replaces the ROOT layout when the error happens in the layout
// itself (e.g. the workspace/me fetch throws), so it must render its own
// <html>/<body>. This is the last-resort boundary — deliberately dependency-free
// and self-contained so it renders even when the shell cannot.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app] global error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          role="alert"
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '24px',
            gap: 6,
            background: 'var(--bg, #0b1220)',
            color: 'var(--text, #e6edf6)',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div
            aria-hidden
            style={{
              width: 48,
              height: 48,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 12,
              background: 'var(--bad-soft, #3a1520)',
              color: 'var(--bad, #ff6b81)',
              fontSize: 26,
              fontWeight: 800,
              marginBottom: 12,
            }}
          >
            !
          </div>
          <h1 style={{ fontSize: 22, margin: 0 }}>AURA OS couldn’t start this page</h1>
          <p style={{ maxWidth: 440, lineHeight: 1.6, opacity: 0.75, fontSize: 14 }}>
            A problem interrupted the workspace shell. Your data is safe. Reload to recover.
          </p>
          {error?.digest ? (
            <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11.5, opacity: 0.6 }}>
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 20,
              background: 'var(--accent, #f6a821)',
              color: 'var(--accent-ink, #1a1205)',
              border: 'none',
              borderRadius: 10,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ↻ Reload workspace
          </button>
        </div>
      </body>
    </html>
  );
}
