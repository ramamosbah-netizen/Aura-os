'use client';

import { type CSSProperties, type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

interface AccountLite {
  id: string;
  name: string;
}

/** Create a tender, optionally linked to a CRM account (the dropdown is fed from the
 *  CRM API by the server page — modules composing in the UI via the contract). */
export default function TenderCreate({ accounts }: { accounts: AccountLite[] }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [accountId, setAccountId] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr(null);
    const account = accounts.find((a) => a.id === accountId);
    try {
      const res = await fetch('/api/tendering/tenders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: t,
          value: Number(value) || 0,
          accountId: accountId || null,
          accountName: account?.name ?? null,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(d.error ?? `Error ${res.status}`);
      } else {
        setTitle('');
        setValue('');
        setAccountId('');
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
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New tender title…"
        disabled={busy}
      />
      <select style={s.select} value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={busy}>
        <option value="">No account</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <input
        style={s.value}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Value"
        inputMode="numeric"
        disabled={busy}
      />
      <button type="submit" style={s.btn} disabled={busy || !title.trim()}>
        {busy ? 'Adding…' : 'Add tender'}
      </button>
      {err ? <span style={s.err}>{err}</span> : null}
    </form>
  );
}

const field: CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  color: 'var(--text)',
  padding: '9px 12px',
  fontSize: 14,
  outline: 'none',
};

const s = {
  form: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' } as CSSProperties,
  input: { ...field, flex: 1, minWidth: 200 } as CSSProperties,
  select: { ...field, minWidth: 150 } as CSSProperties,
  value: { ...field, width: 120 } as CSSProperties,
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
  err: { color: 'var(--bad)', fontSize: 13, width: '100%' } as CSSProperties,
};
