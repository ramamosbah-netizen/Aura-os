'use client';

import ProjectPicker from './ui/project-picker';

import { type CSSProperties, useMemo, useState } from 'react';
import EmptyState from './ui/empty-state';

export interface Snag {
  id: string;
  projectId: string;
  projectName: string | null;
  description: string;
  locationDetail: string;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'resolved' | 'closed';
  assignedTo: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

const SEVERITIES = ['low', 'medium', 'high'];
const statusColor: Record<string, string> = { open: '#dc2626', resolved: '#d97706', closed: '#16a34a' };
const sevColor: Record<string, string> = { low: '#6b7280', medium: '#d97706', high: '#dc2626' };

export default function SnagClient({ initial }: { initial: Snag[] }) {
  const [rows, setRows] = useState(initial);
  const [f, setF] = useState({ projectId: '', description: '', locationDetail: '', severity: 'medium', assignedTo: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const kpi = useMemo(() => ({
    open: rows.filter((r) => r.status === 'open').length,
    high: rows.filter((r) => r.severity === 'high' && r.status !== 'closed').length,
    closed: rows.filter((r) => r.status === 'closed').length,
  }), [rows]);

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const log = async () => {
    setError('');
    if (!f.projectId.trim() || !f.description.trim() || !f.locationDetail.trim()) return setError('Project, description and location are required');
    setBusy(true);
    try {
      const res = await fetch('/api/quality/snags', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: f.projectId, description: f.description, locationDetail: f.locationDetail, severity: f.severity, assignedTo: f.assignedTo || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setRows((p) => [data, ...p]);
      setF({ projectId: f.projectId, description: '', locationDetail: '', severity: 'medium', assignedTo: '' });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const act = async (id: string, action: 'resolve' | 'close') => {
    setError('');
    try {
      const res = await fetch(`/api/quality/snags/${id}/${action}`, { method: 'PUT' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setRows((p) => p.map((r) => (r.id === id ? data : r)));
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <>
      <div style={st.kpis}>
        <Kpi label="Open" value={kpi.open} bad={kpi.open > 0} />
        <Kpi label="High (open)" value={kpi.high} bad={kpi.high > 0} />
        <Kpi label="Closed" value={kpi.closed} good />
      </div>

      <h2 style={st.h2}>Log snag</h2>
      <div style={st.form}>
        <label style={st.label}>Project<ProjectPicker value={f.projectId} onChange={(id) => set('projectId', id)} /></label>
        <label style={{ ...st.label, minWidth: 240 }}>Description<input style={st.input} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Scratched faceplate" /></label>
        <label style={{ ...st.label, minWidth: 200 }}>Location<input style={st.input} value={f.locationDetail} onChange={(e) => set('locationDetail', e.target.value)} placeholder="Room 204, door" /></label>
        <label style={st.label}>Severity<select style={st.input} value={f.severity} onChange={(e) => set('severity', e.target.value)}>{SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        <label style={st.label}>Assigned to<input style={st.input} value={f.assignedTo} onChange={(e) => set('assignedTo', e.target.value)} placeholder="optional" /></label>
        <button style={st.btn} onClick={log} disabled={busy}>{busy ? 'Logging…' : 'Log snag'}</button>
        {error && <span style={st.err}>{error}</span>}
      </div>

      <h2 style={st.h2}>Punch list</h2>
      {rows.length === 0 ? (
        <EmptyState compact title="No snags logged" description="Log punch-list items found during pre-handover walk-downs, then resolve and close each before handover." />
      ) : (
        <table style={st.table}>
          <thead><tr><th style={st.th}>Description</th><th style={st.th}>Location</th><th style={st.th}>Severity</th><th style={st.th}>Assigned</th><th style={st.th}>Status</th><th style={st.th}>Actions</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={st.td}>{r.description}</td>
                <td style={st.td}>{r.locationDetail}</td>
                <td style={{ ...st.td, color: sevColor[r.severity], fontWeight: 600 }}>{r.severity}</td>
                <td style={st.td}>{r.assignedTo || '—'}</td>
                <td style={{ ...st.td, color: statusColor[r.status], fontWeight: 600 }}>{r.status}</td>
                <td style={st.td}>
                  {r.status === 'open' && <button style={st.sm} onClick={() => act(r.id, 'resolve')}>Resolve</button>}
                  {r.status === 'resolved' && <button style={st.smGreen} onClick={() => act(r.id, 'close')}>Close</button>}
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
  kpi: { border: '1px solid var(--border)', borderRadius: 10, padding: '12px 18px', minWidth: 120, background: 'var(--surface)' } as CSSProperties,
  kpiLabel: { fontSize: 12, color: 'var(--muted)', marginBottom: 4 } as CSSProperties,
  kpiValue: { fontSize: 24, fontWeight: 700, letterSpacing: -0.5 } as CSSProperties,
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 14 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 120, background: 'var(--surface)', color: 'var(--fg)' } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  sm: { padding: '4px 10px', borderRadius: 4, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', marginRight: 4 } as CSSProperties,
  smGreen: { padding: '4px 10px', borderRadius: 4, background: '#16a34a', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  err: { color: '#dc2626', marginLeft: 12, fontSize: 13 } as CSSProperties,
  h2: { fontSize: 20, margin: '18px 0 10px' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)', verticalAlign: 'top' } as CSSProperties,
};
