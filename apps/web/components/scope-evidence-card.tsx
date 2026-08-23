'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';

// Requirements / Scope Evidence (Slice 5 closing) — the capture step the Scope Assist journey was
// missing. Without it the evidence a grounded scope is built on could only be created through the API,
// so "Opportunity → capture evidence → Scope Assist" was not completable in the app at all.
//
// "Delete" is the existing `dropped` status, not a row removal: Scope Assist skips dropped
// requirements, so retiring one changes the evidence fingerprint and marks live proposals STALE —
// history stays readable instead of being rewritten under an already-accepted scope.

interface Requirement {
  id: string;
  title: string;
  detail: string | null;
  priority: 'must' | 'should' | 'could';
  status: 'open' | 'met' | 'dropped';
}

type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; requirements: Requirement[] };

export default function ScopeEvidenceCard({ opportunityId, onChanged }: { opportunityId: string; onChanged?: () => void }) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [priority, setPriority] = useState<Requirement['priority']>('must');

  const base = `/api/crm/opportunities/${opportunityId}/requirements`;

  const read = useCallback(async () => {
    try {
      const res = await fetch(base, { cache: 'no-store' });
      if (!res.ok) { setLoad({ state: 'error', message: `Could not load requirements (${res.status})` }); return; }
      const j = await res.json();
      setLoad({ state: 'ready', requirements: Array.isArray(j) ? j : [] });
    } catch { setLoad({ state: 'error', message: 'Requirements service unreachable' }); }
  }, [base]);
  useEffect(() => { void read(); }, [read]);

  const send = useCallback(async (url: string, method: 'POST' | 'PATCH', body: unknown): Promise<boolean> => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(typeof j?.message === 'string' ? j.message : `Request failed (${res.status})`);
        return false;
      }
      await read();
      onChanged?.();
      return true;
    } finally { setBusy(false); }
  }, [read, onChanged]);

  const add = async () => {
    if (!title.trim()) return;
    if (await send(base, 'POST', { title: title.trim(), detail: detail.trim() || undefined, priority })) {
      setTitle(''); setDetail('');
    }
  };

  if (load.state === 'loading') return <div style={st.wrap}><p style={st.muted}>Loading requirements…</p></div>;
  if (load.state === 'error') return <div style={st.wrap}><p style={st.err}>{load.message}</p></div>;

  const live = load.requirements.filter((r) => r.status !== 'dropped');
  const dropped = load.requirements.filter((r) => r.status === 'dropped');

  return (
    <div style={st.wrap}>
      <div style={st.head}>
        <span style={st.title}>Requirements · Scope Evidence</span>
        <span style={st.muted}>what AURA grounds a suggested scope on — capture it here first</span>
      </div>

      {err && <p style={st.err}>{err}</p>}

      {live.length === 0 && <p style={st.empty}>No requirements captured yet. Add what the client asked for — Scope Assist will only propose scope it can trace back to one of these.</p>}

      {live.length > 0 && (
        <ul style={st.list}>
          {live.map((r) => (
            <li key={r.id} style={st.item}>
              <div style={st.itemMain}>
                <span style={st.pri(r.priority)}>{r.priority}</span>
                <span style={st.desc}>{r.title}</span>
                <button style={st.linkBtn} disabled={busy} title="Retire this requirement (kept as dropped, not deleted)"
                  onClick={() => void send(`${base}/${r.id}`, 'PATCH', { status: 'dropped' })}>drop</button>
              </div>
              {r.detail && <p style={st.detail}>{r.detail}</p>}
            </li>
          ))}
        </ul>
      )}

      {dropped.length > 0 && (
        <p style={st.muted}>
          {dropped.length} dropped —{' '}
          {dropped.map((r) => (
            <button key={r.id} style={st.linkBtn} disabled={busy}
              onClick={() => void send(`${base}/${r.id}`, 'PATCH', { status: 'open' })}>restore &ldquo;{r.title.slice(0, 28)}&rdquo;</button>
          ))}
        </p>
      )}

      <div style={st.form}>
        <input style={st.input} placeholder="Requirement (e.g. 48 IP cameras with 30-day retention)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input style={st.input} placeholder="Detail (optional)" value={detail} onChange={(e) => setDetail(e.target.value)} />
        <select style={st.select} value={priority} onChange={(e) => setPriority(e.target.value as Requirement['priority'])}>
          <option value="must">must</option>
          <option value="should">should</option>
          <option value="could">could</option>
        </select>
        <button style={st.btn} disabled={busy || !title.trim()} onClick={() => void add()}>+ Capture</button>
      </div>
    </div>
  );
}

const st = {
  wrap: { border: '1px solid var(--border)', borderRadius: 8, background: 'var(--panel-2)', padding: 12, marginBottom: 10 } as CSSProperties,
  head: { display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 8 } as CSSProperties,
  title: { fontWeight: 700, fontSize: 13 } as CSSProperties,
  muted: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  empty: { fontSize: 12.5, color: 'var(--muted)', margin: '4px 0 8px' } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 12.5, margin: '0 0 8px' } as CSSProperties,
  list: { listStyle: 'none', margin: '0 0 8px', padding: 0, display: 'flex', flexDirection: 'column', gap: 5 } as CSSProperties,
  item: { border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', background: 'var(--panel)' } as CSSProperties,
  itemMain: { display: 'flex', gap: 8, alignItems: 'baseline' } as CSSProperties,
  desc: { fontSize: 12.5, fontWeight: 600, flex: 1 } as CSSProperties,
  detail: { fontSize: 12, color: 'var(--muted)', margin: '3px 0 0' } as CSSProperties,
  pri: (p: string): CSSProperties => ({
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, borderRadius: 4, padding: '1px 6px',
    border: '1px solid var(--border)', color: p === 'must' ? 'var(--warn)' : 'var(--muted)',
  }),
  linkBtn: { background: 'none', border: 'none', padding: 0, marginLeft: 6, color: 'var(--muted)', fontSize: 11.5, textDecoration: 'underline', cursor: 'pointer' } as CSSProperties,
  form: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' } as CSSProperties,
  input: { flex: '1 1 200px', minWidth: 140, fontSize: 12.5, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' } as CSSProperties,
  select: { fontSize: 12.5, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)' } as CSSProperties,
  btn: { fontSize: 12, padding: '5px 11px', borderRadius: 6, border: '1px solid var(--text)', background: 'var(--text)', color: 'var(--panel)', cursor: 'pointer' } as CSSProperties,
};
