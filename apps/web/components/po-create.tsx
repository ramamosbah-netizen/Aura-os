'use client';

import { type CSSProperties, type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

interface ProjectLite {
  id: string;
  title: string;
}

/** Raise a purchase order, optionally against a project (dropdown fed from the Projects
 *  API by the server page) plus a supplier name — Procurement composing with Projects via
 *  the contract, not a shared dependency. */
export default function PoCreate({ projects }: { projects: ProjectLite[] }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [supplier, setSupplier] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selected = projects.find((p) => p.id === projectId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/procurement/purchase-orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: t,
          value: Number(value) || 0,
          supplierName: supplier.trim() || null,
          projectId: projectId || null,
          projectName: selected?.title ?? null,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(d.error ?? `Error ${res.status}`);
      } else {
        setTitle('');
        setSupplier('');
        setValue('');
        setProjectId('');
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
        placeholder="PO title…"
        disabled={busy}
      />
      <input
        style={s.supplier}
        value={supplier}
        onChange={(e) => setSupplier(e.target.value)}
        placeholder="Supplier"
        disabled={busy}
      />
      <select style={s.select} value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={busy}>
        <option value="">{projects.length ? 'Against project…' : 'No projects yet'}</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
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
        {busy ? 'Adding…' : 'Add PO'}
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
  input: { ...field, flex: 1, minWidth: 180 } as CSSProperties,
  supplier: { ...field, minWidth: 150 } as CSSProperties,
  select: { ...field, minWidth: 170 } as CSSProperties,
  value: { ...field, width: 110 } as CSSProperties,
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
