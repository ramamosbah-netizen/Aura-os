'use client';

import { type CSSProperties, useState } from 'react';

/** Saves the current route + querystring as a named view. Drop into any list page. */
export default function SaveViewButton() {
  const [busy, setBusy] = useState(false);
  async function save() {
    const label = window.prompt('Save current view as:');
    if (!label?.trim()) return;
    setBusy(true);
    try {
      await fetch('/api/views', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label, path: window.location.pathname, query: window.location.search }),
      });
    } finally { setBusy(false); }
  }
  return (
    <button type="button" style={s} onClick={save} disabled={busy}>
      {busy ? '…' : '☆ Save view'}
    </button>
  );
}

const s: CSSProperties = {
  background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text)', padding: '6px 12px', fontSize: 12.5, cursor: 'pointer',
};
