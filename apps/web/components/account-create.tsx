'use client';

import { type CSSProperties, type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

/** Inline create form for CRM accounts — posts to the BFF route, then refreshes the list. */
export default function AccountCreate() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/crm/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: n }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(d.error ?? `Error ${res.status}`);
      } else {
        setName('');
        router.refresh();
      }
    } catch {
      setErr('Could not reach the API.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={s.form}>
      <input
        style={s.input}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New account name…"
        disabled={busy}
      />
      <button type="submit" style={s.btn} disabled={busy || !name.trim()}>
        {busy ? 'Adding…' : 'Add account'}
      </button>
      {err ? <span style={s.err}>{err}</span> : null}
    </form>
  );
}

const s = {
  form: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 } as CSSProperties,
  input: {
    flex: 1,
    maxWidth: 360,
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    color: 'var(--text)',
    padding: '9px 12px',
    fontSize: 14,
    outline: 'none',
  } as CSSProperties,
  btn: {
    background: 'var(--accent)',
    color: '#0b0e14',
    fontWeight: 600,
    border: 'none',
    borderRadius: 10,
    padding: '9px 16px',
    fontSize: 14,
    cursor: 'pointer',
  } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 13 } as CSSProperties,
};
