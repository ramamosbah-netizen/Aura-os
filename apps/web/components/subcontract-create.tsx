'use client';

import { type CSSProperties, type FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

interface ProjectLite {
  id: string;
  title: string;
}

export default function SubcontractCreate({ projects }: { projects: ProjectLite[] }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState('');
  const [subcontractorName, setSubcontractorName] = useState('');
  const [value, setValue] = useState('');
  const [retention, setRetention] = useState('10');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selectedProject = projects.find((p) => p.id === projectId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    const subName = subcontractorName.trim();
    if (!t || !projectId || !subName || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/subcontracts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          projectName: selectedProject?.title ?? undefined,
          title: t,
          subcontractorName: subName,
          value: Number(value) || 0,
          retentionPercentage: Number(retention) !== 10 ? Number(retention) : undefined,
        }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(d.error ?? `Error ${res.status}`);
      } else {
        setTitle('');
        setSubcontractorName('');
        setValue('');
        setRetention('10');
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
      <select style={s.select} value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={busy}>
        <option value="">{projects.length ? 'Select project…' : 'No projects yet'}</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
      </select>
      <input
        style={s.input}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Subcontract title (e.g. HVAC Installation)"
        disabled={busy}
      />
      <input
        style={s.input}
        value={subcontractorName}
        onChange={(e) => setSubcontractorName(e.target.value)}
        placeholder="Subcontractor name"
        disabled={busy}
      />
      <input
        style={s.value}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Contract Value"
        inputMode="numeric"
        disabled={busy}
      />
      <input
        style={s.retention}
        value={retention}
        onChange={(e) => setRetention(e.target.value)}
        placeholder="Retention %"
        inputMode="numeric"
        disabled={busy}
      />
      <button type="submit" style={s.btn} disabled={busy || !title.trim() || !projectId || !subcontractorName.trim()}>
        {busy ? 'Adding…' : 'Add Subcontract'}
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
  retention: { ...field, width: 90 } as CSSProperties,
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
