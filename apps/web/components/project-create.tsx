'use client';

import { type CSSProperties, type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

interface ContractLite {
  id: string;
  title: string;
  accountId: string | null;
  accountName: string | null;
  value: number;
}

/** Start a project from an ACTIVE contract. The dropdown is fed from the Contracts API
 *  (status=active) by the server page; picking a contract inherits its account + value —
 *  the deal chain arriving at delivery, composed through the contract, not a shared dep. */
export default function ProjectCreate({ contracts }: { contracts: ContractLite[] }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [contractId, setContractId] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selected = contracts.find((c) => c.id === contractId);

  // Picking an active contract defaults the title + value from it (deal-chain inheritance).
  function pickContract(id: string): void {
    setContractId(id);
    const c = contracts.find((x) => x.id === id);
    if (c) {
      if (!title.trim()) setTitle(c.title);
      if (!value.trim()) setValue(c.value ? String(c.value) : '');
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/projects/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: t,
          value: Number(value) || 0,
          contractId: contractId || null,
          contractTitle: selected?.title ?? null,
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
        setContractId('');
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
      <select style={s.select} value={contractId} onChange={(e) => pickContract(e.target.value)} disabled={busy}>
        <option value="">{contracts.length ? 'From active contract…' : 'No active contracts yet'}</option>
        {contracts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
            {c.accountName ? ` · ${c.accountName}` : ''}
          </option>
        ))}
      </select>
      <input
        style={s.input}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Project title…"
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
        {busy ? 'Adding…' : 'Add project'}
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
