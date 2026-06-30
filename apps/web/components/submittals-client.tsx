'use client';

import { type CSSProperties, useMemo, useState } from 'react';

interface Submittal {
  id: string;
  projectId: string;
  reference: string;
  title: string;
  discipline: string;
  revision: number;
  status: string;
  reviewCode: string | null;
  reviewComments: string;
}

const DISCIPLINES = ['architectural', 'structural', 'mep', 'elv', 'civil', 'other'];
const statusColor: Record<string, string> = { draft: '#6b7280', submitted: '#2563eb', returned: '#16a34a' };
const codeColor: Record<string, string> = { A: '#16a34a', B: '#16a34a', C: '#d97706', D: '#dc2626' };

export default function SubmittalsClient({ initialSubmittals }: { initialSubmittals: Submittal[] }) {
  const [items, setItems] = useState(initialSubmittals);
  const [projectId, setProjectId] = useState('');
  const [reference, setReference] = useState('');
  const [title, setTitle] = useState('');
  const [discipline, setDiscipline] = useState('elv');
  const [error, setError] = useState('');

  const counts = useMemo(() => ({
    underReview: items.filter((s) => s.status === 'submitted').length,
    resubmit: items.filter((s) => s.status === 'returned' && (s.reviewCode === 'C' || s.reviewCode === 'D')).length,
  }), [items]);

  const create = async () => {
    setError('');
    if (!projectId.trim() || !reference.trim() || !title.trim()) return setError('Project, reference and title are required');
    try {
      const res = await fetch('/api/doccontrol/submittals', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, reference, title, discipline }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setItems((p) => [data, ...p]);
      setReference(''); setTitle('');
    } catch (e) { setError((e as Error).message); }
  };

  const submit = async (id: string) => {
    setError('');
    try {
      const res = await fetch(`/api/doccontrol/submittals/${id}/submit`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setItems((p) => p.map((s) => (s.id === id ? data : s)));
    } catch (e) { setError((e as Error).message); }
  };

  const returnCode = async (id: string) => {
    setError('');
    const code = prompt('Review code (A=approved, B=approved w/ comments, C=revise, D=rejected):', 'A');
    if (!code || !['A', 'B', 'C', 'D'].includes(code.toUpperCase())) return;
    const comments = prompt('Review comments (optional):') || undefined;
    try {
      const res = await fetch(`/api/doccontrol/submittals/${id}/return`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reviewCode: code.toUpperCase(), reviewComments: comments }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setItems((p) => p.map((s) => (s.id === id ? data : s)));
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <>
      <div style={st.cards}>
        <div style={st.card}><div style={st.cardLabel}>Under review</div><div style={{ ...st.cardVal, color: '#2563eb' }}>{counts.underReview}</div></div>
        <div style={st.card}><div style={st.cardLabel}>Awaiting resubmission</div><div style={{ ...st.cardVal, color: '#d97706' }}>{counts.resubmit}</div></div>
      </div>

      <div style={st.form}>
        <label style={st.label}>Project ID<input style={st.input} value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="uuid" /></label>
        <label style={st.label}>Reference<input style={st.input} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="SUB-CCTV-001" /></label>
        <label style={{ ...st.label, minWidth: 240 }}>Title<input style={st.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="CCTV head-end shop drawing" /></label>
        <label style={st.label}>Discipline
          <select style={st.input} value={discipline} onChange={(e) => setDiscipline(e.target.value)}>
            {DISCIPLINES.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <button style={st.btn} onClick={create}>Add submittal</button>
        {error && <p style={st.err}>{error}</p>}
      </div>

      <h2 style={st.h2}>Register</h2>
      {items.length === 0 ? (
        <p style={st.muted}>No submittals recorded.</p>
      ) : (
        <table style={st.table}>
          <thead><tr><th style={st.th}>Reference</th><th style={st.th}>Title</th><th style={st.th}>Disc.</th><th style={st.th}>Rev</th><th style={st.th}>Status</th><th style={st.th}>Code</th><th style={st.th}>Actions</th></tr></thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id}>
                <td style={st.td}>{s.reference}</td>
                <td style={st.td}>{s.title}</td>
                <td style={st.td}>{s.discipline}</td>
                <td style={st.td}>{s.revision}</td>
                <td style={{ ...st.td, color: statusColor[s.status] || '#000', fontWeight: 600 }}>{s.status}</td>
                <td style={{ ...st.td, color: s.reviewCode ? codeColor[s.reviewCode] : '#000', fontWeight: 700 }}>{s.reviewCode || '—'}</td>
                <td style={st.td}>
                  {s.status === 'draft' && <button style={st.sm} onClick={() => submit(s.id)}>Submit</button>}
                  {s.status === 'submitted' && <button style={st.smGreen} onClick={() => returnCode(s.id)}>Return code</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

const st = {
  cards: { display: 'flex', gap: 14, marginBottom: 22 } as CSSProperties,
  card: { padding: '12px 18px', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)', minWidth: 170 } as CSSProperties,
  cardLabel: { fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5 } as CSSProperties,
  cardVal: { fontSize: 22, fontWeight: 700, marginTop: 4 } as CSSProperties,
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 22 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 130 } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  sm: { padding: '4px 10px', borderRadius: 4, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  smGreen: { padding: '4px 10px', borderRadius: 4, background: '#16a34a', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  err: { color: '#dc2626', margin: '6px 0 0', fontSize: 13, width: '100%' } as CSSProperties,
  h2: { fontSize: 20, margin: '18px 0 10px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
};
