'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import EmptyState from './ui/empty-state';

export interface DailyReport {
  id: string;
  projectId: string;
  projectName: string | null;
  date: string;
  workDescription: string;
  manpowerCount: number;
  equipmentCount: number;
  status: 'draft' | 'submitted';
  createdAt: string;
}

export interface LabourAllocation {
  id: string;
  projectId: string;
  date: string;
  trade: string;
  headcount: number;
  hours: number;
  manHours: number;
  subcontractorName: string | null;
  notes: string | null;
}

const today = () => new Date().toISOString().slice(0, 10);
const statusColor: Record<string, string> = { draft: '#d97706', submitted: '#16a34a' };

export default function DailyReportClient({ reports, labour }: { reports: DailyReport[]; labour: LabourAllocation[] }) {
  const [rows, setRows] = useState(reports);
  const [lab, setLab] = useState(labour);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dr, setDr] = useState({ projectId: '', date: today(), workDescription: '', manpowerCount: '', equipmentCount: '' });
  const [lr, setLr] = useState({ projectId: '', date: today(), trade: '', headcount: '', hours: '', subcontractorName: '' });

  const kpi = useMemo(() => ({
    draft: rows.filter((r) => r.status === 'draft').length,
    submitted: rows.filter((r) => r.status === 'submitted').length,
    manHours: Math.round(lab.reduce((s, l) => s + l.manHours, 0)),
  }), [rows, lab]);

  const setD = (k: keyof typeof dr, v: string) => setDr((p) => ({ ...p, [k]: v }));
  const setL = (k: keyof typeof lr, v: string) => setLr((p) => ({ ...p, [k]: v }));

  const createReport = async () => {
    setError('');
    if (!dr.projectId.trim() || !dr.date.trim() || !dr.workDescription.trim()) return setError('Project, date and work description are required');
    setBusy(true);
    try {
      const res = await fetch('/api/site/daily-reports', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: dr.projectId, date: dr.date, workDescription: dr.workDescription, manpowerCount: Number(dr.manpowerCount) || 0, equipmentCount: Number(dr.equipmentCount) || 0 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setRows((p) => [data, ...p]);
      setDr({ projectId: dr.projectId, date: today(), workDescription: '', manpowerCount: '', equipmentCount: '' });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const submit = async (id: string) => {
    setError('');
    try {
      const res = await fetch(`/api/site/daily-reports/${id}/submit`, { method: 'PUT' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setRows((p) => p.map((r) => (r.id === id ? data : r)));
    } catch (e) { setError((e as Error).message); }
  };

  const logLabour = async () => {
    setError('');
    if (!lr.projectId.trim() || !lr.trade.trim() || !lr.date.trim()) return setError('Project, trade and date are required');
    setBusy(true);
    try {
      const res = await fetch('/api/site/labour', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: lr.projectId, date: lr.date, trade: lr.trade, headcount: Number(lr.headcount) || 0, hours: Number(lr.hours) || 0, subcontractorName: lr.subcontractorName || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setLab((p) => [data, ...p]);
      setLr({ projectId: lr.projectId, date: today(), trade: '', headcount: '', hours: '', subcontractorName: '' });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <>
      <div style={st.kpis}>
        <Kpi label="Draft reports" value={kpi.draft} bad={kpi.draft > 0} />
        <Kpi label="Submitted" value={kpi.submitted} good />
        <Kpi label="Man-hours logged" value={kpi.manHours} />
      </div>

      <h2 style={st.h2}>New daily report</h2>
      <div style={st.form}>
        <label style={st.label}>Project ID<input style={st.input} value={dr.projectId} onChange={(e) => setD('projectId', e.target.value)} placeholder="uuid" /></label>
        <label style={st.label}>Date<input type="date" style={st.input} value={dr.date} onChange={(e) => setD('date', e.target.value)} /></label>
        <label style={{ ...st.label, minWidth: 280 }}>Work done today<input style={st.input} value={dr.workDescription} onChange={(e) => setD('workDescription', e.target.value)} placeholder="Containment 2nd fix, L3 east" /></label>
        <label style={st.label}>Manpower<input style={{ ...st.input, minWidth: 90 }} inputMode="numeric" value={dr.manpowerCount} onChange={(e) => setD('manpowerCount', e.target.value)} placeholder="0" /></label>
        <label style={st.label}>Plant/equip<input style={{ ...st.input, minWidth: 90 }} inputMode="numeric" value={dr.equipmentCount} onChange={(e) => setD('equipmentCount', e.target.value)} placeholder="0" /></label>
        <button style={st.btn} onClick={createReport} disabled={busy}>Add report</button>
        {error && <span style={st.err}>{error}</span>}
      </div>

      <h2 style={st.h2}>Site diary</h2>
      {rows.length === 0 ? (
        <EmptyState compact title="No daily reports" description="Record the day's work, manpower and plant, then submit — this is the site diary that backs progress claims and delay evidence." />
      ) : (
        <table style={st.table}>
          <thead><tr><th style={st.th}>Date</th><th style={st.th}>Work done</th><th style={st.thR}>Manpower</th><th style={st.thR}>Plant</th><th style={st.th}>Status</th><th style={st.th}></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={st.td}>{r.date}</td>
                <td style={st.td}>{r.workDescription}</td>
                <td style={st.tdR}>{r.manpowerCount}</td>
                <td style={st.tdR}>{r.equipmentCount}</td>
                <td style={{ ...st.td, color: statusColor[r.status], fontWeight: 600 }}>{r.status}</td>
                <td style={st.td}>{r.status === 'draft' && <button style={st.smGreen} onClick={() => submit(r.id)}>Submit</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={st.h2}>Labour return</h2>
      <div style={st.form}>
        <label style={st.label}>Project ID<input style={st.input} value={lr.projectId} onChange={(e) => setL('projectId', e.target.value)} placeholder="uuid" /></label>
        <label style={st.label}>Date<input type="date" style={st.input} value={lr.date} onChange={(e) => setL('date', e.target.value)} /></label>
        <label style={st.label}>Trade<input style={st.input} value={lr.trade} onChange={(e) => setL('trade', e.target.value)} placeholder="Electrician" /></label>
        <label style={st.label}>Headcount<input style={{ ...st.input, minWidth: 90 }} inputMode="numeric" value={lr.headcount} onChange={(e) => setL('headcount', e.target.value)} placeholder="0" /></label>
        <label style={st.label}>Hours<input style={{ ...st.input, minWidth: 80 }} inputMode="numeric" value={lr.hours} onChange={(e) => setL('hours', e.target.value)} placeholder="8" /></label>
        <label style={st.label}>Subcontractor<input style={st.input} value={lr.subcontractorName} onChange={(e) => setL('subcontractorName', e.target.value)} placeholder="optional" /></label>
        <button style={st.btn} onClick={logLabour} disabled={busy}>Log labour</button>
      </div>
      {lab.length === 0 ? (
        <EmptyState compact title="No labour logged" description="Record headcount and hours per trade — man-hours roll up automatically for productivity and payment." />
      ) : (
        <table style={st.table}>
          <thead><tr><th style={st.th}>Date</th><th style={st.th}>Trade</th><th style={st.th}>Subcontractor</th><th style={st.thR}>Head</th><th style={st.thR}>Hours</th><th style={st.thR}>Man-hours</th></tr></thead>
          <tbody>
            {lab.map((l) => (
              <tr key={l.id}>
                <td style={st.td}>{l.date}</td>
                <td style={st.td}>{l.trade}</td>
                <td style={st.td}>{l.subcontractorName || '—'}</td>
                <td style={st.tdR}>{l.headcount}</td>
                <td style={st.tdR}>{l.hours}</td>
                <td style={{ ...st.tdR, fontWeight: 600 }}>{l.manHours}</td>
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
      <div style={{ ...st.kpiValue, color: bad && value > 0 ? '#d97706' : good ? '#16a34a' : 'var(--fg)' }}>{value}</div>
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
  smGreen: { padding: '4px 10px', borderRadius: 4, background: '#16a34a', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  err: { color: '#dc2626', marginLeft: 12, fontSize: 13 } as CSSProperties,
  h2: { fontSize: 20, margin: '22px 0 10px' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  thR: { textAlign: 'right' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)', verticalAlign: 'top' } as CSSProperties,
  tdR: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)', textAlign: 'right' as const } as CSSProperties,
};
