'use client';

import { type CSSProperties, type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

interface PoLite {
  id: string;
  title: string;
  supplierName: string | null;
  projectId: string | null;
  projectName: string | null;
  value: number;
}

/** Record a GRN against an issued PO. The dropdown is fed from the Procurement API
 *  (status=issued) by the server page; picking a PO inherits its supplier, project + value
 *  — the operate axis composing through the contract, not a shared dependency. */
export default function GrnCreate({ pos }: { pos: PoLite[] }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [poId, setPoId] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selected = pos.find((p) => p.id === poId);

  // Picking a PO defaults the goods description + value from it (operate-chain inheritance).
  function pickPo(id: string): void {
    setPoId(id);
    const po = pos.find((p) => p.id === id);
    if (po) {
      if (!title.trim()) setTitle(`Receipt — ${po.title}`);
      if (!value.trim()) setValue(po.value ? String(po.value) : '');
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/inventory/grns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: t,
          value: Number(value) || 0,
          poId: poId || null,
          poTitle: selected?.title ?? null,
          supplierName: selected?.supplierName ?? null,
          projectId: selected?.projectId ?? null,
          projectName: selected?.projectName ?? null,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(d.error ?? `Error ${res.status}`);
      } else {
        setTitle('');
        setValue('');
        setPoId('');
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
      <select style={s.select} value={poId} onChange={(e) => pickPo(e.target.value)} disabled={busy}>
        <option value="">{pos.length ? 'Against issued PO…' : 'No issued POs yet'}</option>
        {pos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
            {p.supplierName ? ` · ${p.supplierName}` : ''}
          </option>
        ))}
      </select>
      <input
        style={s.input}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Goods received…"
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
        {busy ? 'Saving…' : 'Record GRN'}
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
  select: { ...field, minWidth: 220 } as CSSProperties,
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
