'use client';

import ProjectPicker from './ui/project-picker';

import { type CSSProperties, useMemo, useState } from 'react';
import EmptyState from './ui/empty-state';

export interface Ncr {
  id: string;
  projectId: string;
  projectName: string | null;
  ncrNumber: string;
  description: string;
  rootCause: string | null;
  proposedCorrection: string | null;
  severity: 'minor' | 'major';
  status: 'raised' | 'corrected' | 'closed';
  assignedTo: string | null;
  createdAt: string;
}

const statusColor: Record<string, string> = { raised: 'var(--bad)', corrected: '#d97706', closed: 'var(--good)' };
const sevColor: Record<string, string> = { minor: '#6b7280', major: 'var(--bad)' };

export default function NcrClient({ initial }: { initial: Ncr[] }) {
  const [rows, setRows] = useState(initial);
  const [f, setF] = useState({ projectId: '', ncrNumber: '', description: '', severity: 'minor', assignedTo: '', rootCause: '', proposedCorrection: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const kpi = useMemo(() => ({
    open: rows.filter((r) => r.status !== 'closed').length,
    major: rows.filter((r) => r.severity === 'major' && r.status !== 'closed').length,
    closed: rows.filter((r) => r.status === 'closed').length,
  }), [rows]);

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const raise = async () => {
    setError('');
    if (!f.projectId.trim() || !f.ncrNumber.trim() || !f.description.trim()) return setError('Project, NCR number and description are required');
    setBusy(true);
    try {
      const res = await fetch('/api/quality/ncrs', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId: f.projectId, ncrNumber: f.ncrNumber, description: f.description,
          severity: f.severity, assignedTo: f.assignedTo || undefined,
          rootCause: f.rootCause || undefined, proposedCorrection: f.proposedCorrection || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setRows((p) => [data, ...p]);
      setF({ projectId: f.projectId, ncrNumber: '', description: '', severity: 'minor', assignedTo: '', rootCause: '', proposedCorrection: '' });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const setStatus = async (id: string, status: 'corrected' | 'closed') => {
    setError('');
    try {
      const res = await fetch(`/api/quality/ncrs/${id}/status`, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setRows((p) => p.map((r) => (r.id === id ? data : r)));
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <>
      <div style={st.kpis}>
        <Kpi label="Open" value={kpi.open} bad={kpi.open > 0} />
        <Kpi label="Major (open)" value={kpi.major} bad={kpi.major > 0} />
        <Kpi label="Closed" value={kpi.closed} good />
      </div>

      <h2 style={st.h2}>Raise NCR</h2>
      <div style={st.form}>
        <label style={st.label}>Project<ProjectPicker value={f.projectId} onChange={(id) => set('projectId', id)} /></label>
        <label style={st.label}>NCR number<input style={st.input} value={f.ncrNumber} onChange={(e) => set('ncrNumber', e.target.value)} placeholder="NCR-001" /></label>
        <label style={{ ...st.label, minWidth: 260 }}>Description<input style={st.input} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Cable tray not per spec" /></label>
        <label style={st.label}>Severity<select style={st.input} value={f.severity} onChange={(e) => set('severity', e.target.value)}><option value="minor">minor</option><option value="major">major</option></select></label>
        <label style={st.label}>Assigned to<input style={st.input} value={f.assignedTo} onChange={(e) => set('assignedTo', e.target.value)} placeholder="optional" /></label>
        <button style={st.btn} onClick={raise} disabled={busy}>{busy ? 'Raising…' : 'Raise NCR'}</button>
        {error && <span style={st.err}>{error}</span>}
      </div>

      <h2 style={st.h2}>Register</h2>
      {rows.length === 0 ? (
        <EmptyState compact title="No NCRs raised" description="Raise a non-conformance report when work fails to meet spec, then track it through correction to close-out." />
      ) : (
        <table style={st.table}>
          <thead><tr><th style={st.th}>NCR</th><th style={st.th}>Description</th><th style={st.th}>Severity</th><th style={st.th}>Assigned</th><th style={st.th}>Status</th><th style={st.th}>Actions</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={st.td}>{r.ncrNumber}</td>
                <td style={st.td}>{r.description}</td>
                <td style={{ ...st.td, color: sevColor[r.severity], fontWeight: 600 }}>{r.severity}</td>
                <td style={st.td}>{r.assignedTo || '—'}</td>
                <td style={{ ...st.td, color: statusColor[r.status], fontWeight: 600 }}>{r.status}</td>
                <td style={st.td}>
                  {r.status === 'raised' && <button style={st.sm} onClick={() => setStatus(r.id, 'corrected')}>Mark corrected</button>}
                  {r.status === 'corrected' && <button style={st.smGreen} onClick={() => setStatus(r.id, 'closed')}>Close</button>}
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
      <div style={{ ...st.kpiValue, color: bad && value > 0 ? 'var(--bad)' : good ? 'var(--good)' : 'var(--text)' }}>{value}</div>
    </div>
  );
}

const st = {
  kpis: { display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' as const } as CSSProperties,
  kpi: { border: '1px solid var(--border)', borderRadius: 10, padding: '12px 18px', minWidth: 120, background: 'var(--panel)' } as CSSProperties,
  kpiLabel: { fontSize: 12, color: 'var(--muted)', marginBottom: 4 } as CSSProperties,
  kpiValue: { fontSize: 24, fontWeight: 700, letterSpacing: -0.5 } as CSSProperties,
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 14 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 120, background: 'var(--panel)', color: 'var(--text)' } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  sm: { padding: '4px 10px', borderRadius: 4, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', marginRight: 4 } as CSSProperties,
  smGreen: { padding: '4px 10px', borderRadius: 4, background: 'var(--good)', color: 'var(--accent-ink)', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  err: { color: 'var(--bad)', marginLeft: 12, fontSize: 13 } as CSSProperties,
  h2: { fontSize: 20, margin: '18px 0 10px' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)', verticalAlign: 'top' } as CSSProperties,
};
