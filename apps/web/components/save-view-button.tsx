'use client';

import { type CSSProperties, useState } from 'react';

/** Saves the current route + querystring as a named view. Drop into any list page. */
export default function SaveViewButton({ excludeParams = [] }: { excludeParams?: string[] }) {
  const [busy, setBusy] = useState(false);
  async function save() {
    const label = window.prompt('Save current view as:');
    if (!label?.trim()) return;
    setBusy(true);
    try {
      const query = new URLSearchParams(window.location.search);
      for (const key of excludeParams) query.delete(key);
      await fetch('/api/views', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label, path: window.location.pathname, query: query.toString() ? `?${query}` : '' }),
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
