'use client';

import { Fragment, type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import CreateDrawer from './ui/create-drawer';

// Clause library — the reusable contract language behind every contract. The store, service and
// API have existed since the module was built; this is the screen that finally makes them usable.

export interface Clause {
  id: string;
  code: string;
  title: string;
  category: string;
  body: string;
  tags: string[];
  revision: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES = [
  'general', 'payment', 'retention', 'variation', 'delay_ld', 'warranty',
  'indemnity', 'termination', 'insurance', 'hse', 'other',
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  general: 'General', payment: 'Payment terms', retention: 'Retention', variation: 'Variations',
  delay_ld: 'Delay / LDs', warranty: 'Warranty', indemnity: 'Indemnity', termination: 'Termination',
  insurance: 'Insurance', hse: 'HSE', other: 'Other',
};

export default function ClauseLibraryClient({ initialClauses }: { initialClauses: Clause[] }) {
  const [clauses, setClauses] = useState<Clause[]>(initialClauses);
  const [category, setCategory] = useState<string>('');
  const [query, setQuery] = useState('');
  const [showRetired, setShowRetired] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/contracts/clauses', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setClauses(data as Clause[]);
    } catch { /* keep what we have — the page still reads */ }
  }, []);

  useEffect(() => { if (initialClauses.length === 0) void load(); }, [initialClauses.length, load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clauses
      .filter((c) => (showRetired ? true : c.active))
      .filter((c) => (category ? c.category === category : true))
      .filter((c) => (q ? `${c.code} ${c.title} ${c.body} ${c.tags.join(' ')}`.toLowerCase().includes(q) : true))
      .sort((a, b) => (a.code < b.code ? -1 : 1));
  }, [clauses, category, query, showRetired]);

  const counts = useMemo(() => {
    const byCategory = new Map<string, number>();
    for (const c of clauses) if (c.active) byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + 1);
    return { active: clauses.filter((c) => c.active).length, retired: clauses.filter((c) => !c.active).length, byCategory };
  }, [clauses]);

  const revise = async (id: string, patch: Record<string, unknown>, note?: string): Promise<void> => {
    setBusy(true); setErr(''); setMsg('');
    try {
      const res = await fetch(`/api/contracts/clauses/${id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.message ?? d.error ?? 'Action failed'); return; }
      if (note) setMsg(note);
      await load();
    } catch { setErr('API unreachable'); } finally { setBusy(false); }
  };

  return (
    <div>
      {err && <div style={st.err}>{err}</div>}
      {msg && <div style={st.ok}>{msg}</div>}

      <div style={st.stats}>
        <Stat label="Clauses in use" value={String(counts.active)} strong />
        <Stat label="Retired" value={String(counts.retired)} />
        <Stat label="Categories covered" value={`${counts.byCategory.size} of ${CATEGORIES.length}`} accent />
      </div>

      <div style={st.toolbar}>
        <input
          style={st.input}
          placeholder="Search code, title, body or tag…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select style={st.select} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABEL[c]}{counts.byCategory.get(c) ? ` (${counts.byCategory.get(c)})` : ''}</option>
          ))}
        </select>
        <label style={st.check}>
          <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} /> Show retired
        </label>
        <div style={{ flex: 1 }} />
        <CreateDrawer
          entity="Clause"
          subtitle="Reusable contract language. Give it a code your team will recognise — it is how the clause gets pulled into a contract."
          endpoint="/api/contracts/clauses"
          fields={[
            { name: 'code', label: 'Code', kind: 'text', required: true, placeholder: 'e.g. PAY-01' },
            {
              name: 'category', label: 'Category', kind: 'select', defaultValue: 'general',
              options: CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] })),
            },
            { name: 'title', label: 'Title', kind: 'text', required: true, placeholder: 'e.g. Payment within 30 days of certification', span: 2 },
            { name: 'body', label: 'Clause text', kind: 'textarea', required: true, span: 2, hint: 'The language as it will appear in the contract' },
            { name: 'tags', label: 'Tags', kind: 'text', transform: 'csv', placeholder: 'comma separated, e.g. fidic, main-contract', span: 2 },
          ]}
        />
      </div>

      <section className="panel">
        {visible.length === 0 ? (
          <p style={st.muted}>
            {clauses.length === 0
              ? 'The library is empty — add the clauses your contracts keep reusing (payment terms, retention, LDs, warranty).'
              : 'No clause matches this filter.'}
          </p>
        ) : (
          <table className="data-table">
            <thead><tr>{['Code', 'Title', 'Category', 'Tags', 'Rev.', 'Status', 'Actions'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {visible.map((c) => (
                <Fragment key={c.id}>
                  <tr style={c.active ? undefined : { opacity: 0.6 }}>
                    <td style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700 }}>{c.code}</td>
                    <td>
                      <button style={st.linkish} onClick={() => setOpen(open === c.id ? null : c.id)}>
                        {c.title} {open === c.id ? '▾' : '▸'}
                      </button>
                    </td>
                    <td>{CATEGORY_LABEL[c.category] ?? c.category}</td>
                    <td style={{ color: 'var(--muted)' }}>{c.tags.length ? c.tags.join(', ') : '—'}</td>
                    <td>r{c.revision}</td>
                    <td><span className={c.active ? 'badge badge-good' : 'badge'}>{c.active ? 'in use' : 'retired'}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {c.active ? (
                        <button className="btn btn-ghost" style={st.smBtn} disabled={busy}
                          onClick={() => void revise(c.id, { active: false }, `${c.code} retired — existing contracts are unaffected.`)}>Retire</button>
                      ) : (
                        <button className="btn" style={{ ...st.smBtn, color: 'var(--good)' }} disabled={busy}
                          onClick={() => void revise(c.id, { active: true }, `${c.code} back in use.`)}>Restore</button>
                      )}
                    </td>
                  </tr>
                  {open === c.id && (
                    <tr>
                      <td colSpan={7} style={st.bodyCell}>
                        <pre style={st.body}>{c.body}</pre>
                        <div style={st.metaLine}>
                          Revision {c.revision} · updated {new Date(c.updatedAt).toLocaleDateString()}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, strong, accent }: { label: string; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <div style={{ minWidth: 130 }}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: strong ? 16 : 13.5, fontWeight: strong ? 800 : 600, color: accent ? 'var(--accent)' : 'var(--text)' }}>{value}</div>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  err: { padding: '10px 12px', border: '1px solid var(--bad)', borderRadius: 10, color: 'var(--bad)', marginBottom: 12, fontSize: 13 },
  ok: { padding: '10px 12px', border: '1px solid var(--good)', borderRadius: 10, color: 'var(--good)', marginBottom: 12, fontSize: 13 },
  stats: { display: 'flex', gap: 26, flexWrap: 'wrap', padding: '12px 0 16px' },
  toolbar: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 },
  input: { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', fontSize: 13, minWidth: 260 },
  select: { padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--panel)', color: 'var(--text)', fontSize: 13 },
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--muted)' },
  muted: { color: 'var(--muted)', fontSize: 13.5, margin: '8px 0' },
  smBtn: { fontSize: 12, padding: '3px 8px' },
  linkish: { background: 'none', border: 'none', padding: 0, color: 'var(--accent)', font: 'inherit', cursor: 'pointer', textAlign: 'left' },
  bodyCell: { background: 'var(--panel-2, transparent)', padding: '10px 14px' },
  body: { whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.55, margin: 0, color: 'var(--text)' },
  metaLine: { fontSize: 11.5, color: 'var(--muted)', marginTop: 8 },
};
