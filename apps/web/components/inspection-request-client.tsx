'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import EmptyState from './ui/empty-state';

export interface InspectionRequest {
  id: string;
  projectId: string;
  projectName: string | null;
  irNumber: string;
  discipline: 'civil' | 'mechanical' | 'electrical' | 'plumbing';
  locationDetail: string;
  inspectionDate: string;
  status: 'requested' | 'approved' | 'rejected';
  inspectedBy: string | null;
  comments: string | null;
  createdAt: string;
}

const DISCIPLINES = ['civil', 'mechanical', 'electrical', 'plumbing'];
const statusColor: Record<string, string> = { requested: '#d97706', approved: '#16a34a', rejected: '#dc2626' };

export default function InspectionRequestClient({ initial }: { initial: InspectionRequest[] }) {
  const [rows, setRows] = useState(initial);
  const [f, setF] = useState({ projectId: '', irNumber: '', discipline: 'electrical', locationDetail: '', inspectionDate: '' });
  const [comments, setComments] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const kpi = useMemo(() => ({
    pending: rows.filter((r) => r.status === 'requested').length,
    approved: rows.filter((r) => r.status === 'approved').length,
    rejected: rows.filter((r) => r.status === 'rejected').length,
  }), [rows]);

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const request = async () => {
    setError('');
    if (!f.projectId.trim() || !f.irNumber.trim() || !f.locationDetail.trim() || !f.inspectionDate.trim()) return setError('Project, IR number, location and date are required');
    setBusy(true);
    try {
      const res = await fetch('/api/quality/irs', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: f.projectId, irNumber: f.irNumber, discipline: f.discipline, locationDetail: f.locationDetail, inspectionDate: f.inspectionDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setRows((p) => [data, ...p]);
      setF({ projectId: f.projectId, irNumber: '', discipline: f.discipline, locationDetail: '', inspectionDate: '' });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const resolve = async (id: string, status: 'approved' | 'rejected') => {
    setError('');
    try {
      const res = await fetch(`/api/quality/irs/${id}/resolve`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status, comments: comments[id] || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setRows((p) => p.map((r) => (r.id === id ? data : r)));
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <>
      <div style={st.kpis}>
        <Kpi label="Awaiting inspection" value={kpi.pending} bad={kpi.pending > 0} />
        <Kpi label="Approved" value={kpi.approved} good />
        <Kpi label="Rejected" value={kpi.rejected} bad={kpi.rejected > 0} />
      </div>

      <h2 style={st.h2}>Request inspection</h2>
      <div style={st.form}>
        <label style={st.label}>Project ID<input style={st.input} value={f.projectId} onChange={(e) => set('projectId', e.target.value)} placeholder="uuid" /></label>
        <label style={st.label}>IR number<input style={st.input} value={f.irNumber} onChange={(e) => set('irNumber', e.target.value)} placeholder="IR-001" /></label>
        <label style={st.label}>Discipline<select style={st.input} value={f.discipline} onChange={(e) => set('discipline', e.target.value)}>{DISCIPLINES.map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
        <label style={{ ...st.label, minWidth: 220 }}>Location<input style={st.input} value={f.locationDetail} onChange={(e) => set('locationDetail', e.target.value)} placeholder="L3 riser, grid C4" /></label>
        <label style={st.label}>Date<input type="date" style={st.input} value={f.inspectionDate} onChange={(e) => set('inspectionDate', e.target.value)} /></label>
        <button style={st.btn} onClick={request} disabled={busy}>{busy ? 'Requesting…' : 'Request'}</button>
        {error && <span style={st.err}>{error}</span>}
      </div>

      <h2 style={st.h2}>Register</h2>
      {rows.length === 0 ? (
        <EmptyState compact title="No inspection requests" description="Raise an IR to call the consultant/QA for a hold or witness point before covering up the works." />
      ) : (
        <table style={st.table}>
          <thead><tr><th style={st.th}>IR</th><th style={st.th}>Discipline</th><th style={st.th}>Location</th><th style={st.th}>Date</th><th style={st.th}>Status</th><th style={st.th}>Actions</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={st.td}>{r.irNumber}</td>
                <td style={st.td}>{r.discipline}</td>
                <td style={st.td}>{r.locationDetail}</td>
                <td style={st.td}>{r.inspectionDate}</td>
                <td style={{ ...st.td, color: statusColor[r.status], fontWeight: 600 }}>
                  {r.status}{r.comments ? <div style={st.cmt}>{r.comments}</div> : null}
                </td>
                <td style={st.td}>
                  {r.status === 'requested' ? (
                    <>
                      <input style={{ ...st.input, minWidth: 140, marginRight: 6 }} placeholder="comments" value={comments[r.id] || ''} onChange={(e) => setComments((c) => ({ ...c, [r.id]: e.target.value }))} />
                      <button style={st.smGreen} onClick={() => resolve(r.id, 'approved')}>Approve</button>
                      <button style={st.smRed} onClick={() => resolve(r.id, 'rejected')}>Reject</button>
                    </>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Kpi({ label, value, good, bad }: { label: string; value: number; good?: boolean; bad?: boolean }) {
  return (
    <div style={st.kpi}>
      <div style={st.kpiLabel}>{label}</div>
      <div style={{ ...st.kpiValue, color: bad && value > 0 ? '#dc2626' : good ? '#16a34a' : 'var(--fg)' }}>{value}</div>
    </div>
  );
}

const st = {
  kpis: { display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' as const } as CSSProperties,
  kpi: { border: '1px solid var(--border)', borderRadius: 10, padding: '12px 18px', minWidth: 130, background: 'var(--surface)' } as CSSProperties,
  kpiLabel: { fontSize: 12, color: 'var(--muted)', marginBottom: 4 } as CSSProperties,
  kpiValue: { fontSize: 24, fontWeight: 700, letterSpacing: -0.5 } as CSSProperties,
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 14 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 120, background: 'var(--surface)', color: 'var(--fg)' } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  smGreen: { padding: '4px 10px', borderRadius: 4, background: '#16a34a', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', marginRight: 4 } as CSSProperties,
  smRed: { padding: '4px 10px', borderRadius: 4, background: '#dc2626', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  err: { color: '#dc2626', marginLeft: 12, fontSize: 13 } as CSSProperties,
  h2: { fontSize: 20, margin: '18px 0 10px' } as CSSProperties,
  cmt: { fontSize: 12, color: 'var(--muted)', fontWeight: 400, marginTop: 2 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)', verticalAlign: 'top' } as CSSProperties,
};
