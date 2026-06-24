'use client';

import { type CSSProperties, type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

interface TenderLite {
  id: string;
  title: string;
  accountId: string | null;
  accountName: string | null;
  value: number;
}

/** Raise a contract from a WON tender. The dropdown is fed from the Tendering API
 *  (status=won) by the server page; picking a tender inherits its account + value —
 *  the deal chain composing in the UI through the contract, not a shared dependency. */
export default function ContractCreate({ tenders }: { tenders: TenderLite[] }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [tenderId, setTenderId] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selected = tenders.find((t) => t.id === tenderId);

  // Picking a won tender defaults the title + value from it (deal-chain inheritance).
  function pickTender(id: string): void {
    setTenderId(id);
    const t = tenders.find((x) => x.id === id);
    if (t) {
      if (!title.trim()) setTitle(t.title);
      if (!value.trim()) setValue(t.value ? String(t.value) : '');
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/contracts/contracts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: t,
          value: Number(value) || 0,
          tenderId: tenderId || null,
          tenderTitle: selected?.title ?? null,
          accountId: selected?.accountId ?? null,
          accountName: selected?.accountName ?? null,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(d.error ?? `Error ${res.status}`);
      } else {
        setTitle('');
        setValue('');
        setTenderId('');
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
      <select style={s.select} value={tenderId} onChange={(e) => pickTender(e.target.value)} disabled={busy}>
        <option value="">{tenders.length ? 'From won tender…' : 'No won tenders yet'}</option>
        {tenders.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title}
            {t.accountName ? ` · ${t.accountName}` : ''}
          </option>
        ))}
      </select>
      <input
        style={s.input}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Contract title…"
        disabled={busy}
      />
      <input
        style={s.value}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Value"
        inputMode="numeric"
        disabled={busy}
      />
      <button type="submit" style={s.btn} disabled={busy || !title.trim()}>
        {busy ? 'Adding…' : 'Add contract'}
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
  select: { ...field, minWidth: 200 } as CSSProperties,
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
