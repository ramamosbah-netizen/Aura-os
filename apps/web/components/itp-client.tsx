'use client';

import { type CSSProperties, useState } from 'react';

interface ItpPoint { activity: string; pointType: string; acceptanceCriteria: string; result: string }
interface Itp {
  id: string;
  projectId: string;
  reference: string;
  title: string;
  discipline: string;
  status: string;
  points: ItpPoint[];
}
interface DraftPoint { activity: string; pointType: string; acceptanceCriteria: string }

const POINT_TYPES = ['hold', 'witness', 'review', 'surveillance'];
const statusColor: Record<string, string> = { draft: '#6b7280', active: '#2563eb', closed: '#16a34a' };
const resultColor: Record<string, string> = { pending: '#6b7280', passed: '#16a34a', failed: '#dc2626' };
const emptyPoint = (): DraftPoint => ({ activity: '', pointType: 'hold', acceptanceCriteria: '' });

export default function ItpClient({ initialItps }: { initialItps: Itp[] }) {
  const [itps, setItps] = useState(initialItps);
  const [projectId, setProjectId] = useState('');
  const [reference, setReference] = useState('');
  const [title, setTitle] = useState('');
  const [discipline, setDiscipline] = useState('structural');
  const [points, setPoints] = useState<DraftPoint[]>([emptyPoint()]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState('');

  const setPoint = (i: number, k: keyof DraftPoint, v: string) => setPoints((p) => p.map((pt, idx) => (idx === i ? { ...pt, [k]: v } : pt)));

  const create = async () => {
    setError('');
    if (!projectId.trim() || !reference.trim() || !title.trim()) return setError('Project, reference and title are required');
    const payloadPoints = points.filter((p) => p.activity.trim()).map((p) => ({ activity: p.activity, pointType: p.pointType, acceptanceCriteria: p.acceptanceCriteria || undefined }));
    if (payloadPoints.length === 0) return setError('Add at least one inspection point');
    try {
      const res = await fetch('/api/quality/itps', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, reference, title, discipline, points: payloadPoints }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setItps((p) => [data, ...p]);
      setReference(''); setTitle(''); setPoints([emptyPoint()]);
    } catch (e) { setError((e as Error).message); }
  };

  const act = async (id: string, action: 'activate' | 'close') => {
    setError('');
    try {
      const res = await fetch(`/api/quality/itps/${id}/${action}`, { method: 'PUT' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setItps((p) => p.map((i) => (i.id === id ? data : i)));
    } catch (e) { setError((e as Error).message); }
  };

  const recordPoint = async (id: string, index: number, result: 'passed' | 'failed') => {
    setError('');
    try {
      const res = await fetch(`/api/quality/itps/${id}/points/${index}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ result }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setItps((p) => p.map((i) => (i.id === id ? data : i)));
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <>
      <h2 style={st.h2}>New ITP</h2>
      <div style={st.form}>
        <label style={st.label}>Project ID<input style={st.input} value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="uuid" /></label>
        <label style={st.label}>Reference<input style={st.input} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="ITP-CONC-001" /></label>
        <label style={{ ...st.label, minWidth: 220 }}>Title<input style={st.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Concrete pour ITP" /></label>
        <label style={st.label}>Discipline<input style={st.input} value={discipline} onChange={(e) => setDiscipline(e.target.value)} /></label>
      </div>
      <table style={st.table}>
        <thead><tr><th style={st.th}>Activity</th><th style={st.th}>Point type</th><th style={st.th}>Acceptance criteria</th><th style={st.th}></th></tr></thead>
        <tbody>
          {points.map((p, i) => (
            <tr key={i}>
              <td style={st.td}><input style={{ ...st.input, minWidth: 180 }} value={p.activity} onChange={(e) => setPoint(i, 'activity', e.target.value)} placeholder="Rebar fixing" /></td>
              <td style={st.td}><select style={st.input} value={p.pointType} onChange={(e) => setPoint(i, 'pointType', e.target.value)}>{POINT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></td>
              <td style={st.td}><input style={{ ...st.input, minWidth: 200 }} value={p.acceptanceCriteria} onChange={(e) => setPoint(i, 'acceptanceCriteria', e.target.value)} placeholder="Per drawing" /></td>
              <td style={st.td}>{points.length > 1 && <button style={st.smRed} onClick={() => setPoints((pp) => pp.filter((_, idx) => idx !== i))}>✕</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 10 }}>
        <button style={st.smGray} onClick={() => setPoints((p) => [...p, emptyPoint()])}>+ Add point</button>
        <button style={{ ...st.btn, marginLeft: 12 }} onClick={create}>Create ITP</button>
        {error && <span style={st.err}>{error}</span>}
      </div>

      <h2 style={st.h2}>Plans</h2>
      {itps.length === 0 ? (
        <p style={st.muted}>No ITPs yet.</p>
      ) : (
        <table style={st.table}>
          <thead><tr><th style={st.th}>Reference</th><th style={st.th}>Title</th><th style={st.th}>Disc.</th><th style={st.th}>Points</th><th style={st.th}>Status</th><th style={st.th}>Actions</th></tr></thead>
          <tbody>
            {itps.map((itp) => {
              const resolved = itp.points.filter((p) => p.result !== 'pending').length;
              return (
                <>
                  <tr key={itp.id}>
                    <td style={st.td}><button style={st.linkBtn} onClick={() => setExpanded(expanded === itp.id ? null : itp.id)}>{itp.reference}</button></td>
                    <td style={st.td}>{itp.title}</td>
                    <td style={st.td}>{itp.discipline}</td>
                    <td style={st.td}>{resolved}/{itp.points.length}</td>
                    <td style={{ ...st.td, color: statusColor[itp.status] || '#000', fontWeight: 600 }}>{itp.status}</td>
                    <td style={st.td}>
                      {itp.status === 'draft' && <button style={st.sm} onClick={() => act(itp.id, 'activate')}>Activate</button>}
                      {itp.status === 'active' && <button style={st.smGreen} onClick={() => act(itp.id, 'close')}>Close</button>}
                    </td>
                  </tr>
                  {expanded === itp.id && (
                    <tr key={itp.id + '-points'}>
                      <td style={{ ...st.td, background: 'var(--surface-2, #f8fafc)' }} colSpan={6}>
                        <table style={{ ...st.table, margin: 0 }}>
                          <thead><tr><th style={st.thSm}>Activity</th><th style={st.thSm}>Type</th><th style={st.thSm}>Criteria</th><th style={st.thSm}>Result</th><th style={st.thSm}></th></tr></thead>
                          <tbody>
                            {itp.points.map((pt, idx) => (
                              <tr key={idx}>
                                <td style={st.tdSm}>{pt.activity}</td>
                                <td style={st.tdSm}>{pt.pointType}</td>
                                <td style={st.tdSm}>{pt.acceptanceCriteria || '—'}</td>
                                <td style={{ ...st.tdSm, color: resultColor[pt.result], fontWeight: 600 }}>{pt.result}</td>
                                <td style={st.tdSm}>
                                  {itp.status === 'active' && pt.result === 'pending' && (
                                    <>
                                      <button style={st.smGreen} onClick={() => recordPoint(itp.id, idx, 'passed')}>Pass</button>
                                      <button style={st.smRed} onClick={() => recordPoint(itp.id, idx, 'failed')}>Fail</button>
                                    </>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

const st = {
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 14 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 120 } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  sm: { padding: '4px 10px', borderRadius: 4, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', marginRight: 4 } as CSSProperties,
  smGray: { padding: '5px 12px', borderRadius: 4, background: 'var(--surface-2, #e5e7eb)', color: 'inherit', border: 'none', fontSize: 13, cursor: 'pointer' } as CSSProperties,
  smGreen: { padding: '4px 10px', borderRadius: 4, background: '#16a34a', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', marginRight: 4 } as CSSProperties,
  smRed: { padding: '4px 10px', borderRadius: 4, background: '#dc2626', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  linkBtn: { background: 'none', border: 'none', color: 'var(--accent, #2563eb)', cursor: 'pointer', fontWeight: 600, padding: 0, fontSize: 14 } as CSSProperties,
  err: { color: '#dc2626', marginLeft: 12, fontSize: 13 } as CSSProperties,
  h2: { fontSize: 20, margin: '18px 0 10px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)', verticalAlign: 'top' } as CSSProperties,
  thSm: { textAlign: 'left' as const, padding: '5px 10px', borderBottom: '1px solid var(--border, #e5e7eb)', fontWeight: 600, fontSize: 13 } as CSSProperties,
  tdSm: { padding: '5px 10px', borderBottom: '1px solid var(--border, #eef2f6)', fontSize: 13 } as CSSProperties,
};
