'use client';

import ProjectPicker from './ui/project-picker';

import { type CSSProperties, useMemo, useState } from 'react';
import EmptyState from './ui/empty-state';
import ExportButton from './export-button';

interface RiskLine {
  hazard: string;
  likelihood: number;
  severity: number;
  controls: string;
  residualLikelihood: number;
  residualSeverity: number;
}
export interface RiskAssessment {
  id: string;
  projectId: string;
  reference: string;
  activity: string;
  assessor: string | null;
  hazards: RiskLine[];
  initialScore: number;
  residualScore: number;
  residualBand: 'low' | 'medium' | 'high' | 'critical';
  status: 'draft' | 'approved' | 'expired';
  reviewDate: string | null;
  createdAt: string;
}

const bandColor: Record<string, string> = { low: '#16a34a', medium: '#d97706', high: '#dc2626', critical: '#991b1b' };
const statusColor: Record<string, string> = { draft: '#d97706', approved: '#16a34a', expired: '#6b7280' };
const emptyHazard = (): RiskLine => ({ hazard: '', likelihood: 3, severity: 3, controls: '', residualLikelihood: 1, residualSeverity: 2 });
const SCORES = [1, 2, 3, 4, 5];

export default function RiskAssessmentClient({ initial }: { initial: RiskAssessment[] }) {
  const [rows, setRows] = useState(initial);
  const [f, setF] = useState({ projectId: '', reference: '', activity: '', assessor: '', reviewDate: '' });
  const [hazards, setHazards] = useState<RiskLine[]>([emptyHazard()]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const kpi = useMemo(() => ({
    draft: rows.filter((r) => r.status === 'draft').length,
    highResidual: rows.filter((r) => (r.residualBand === 'high' || r.residualBand === 'critical')).length,
    approved: rows.filter((r) => r.status === 'approved').length,
  }), [rows]);

  const setField = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const setHaz = (i: number, k: keyof RiskLine, v: string | number) => setHazards((h) => h.map((row, idx) => (idx === i ? { ...row, [k]: typeof row[k] === 'number' ? Number(v) : v } : row)));

  const create = async () => {
    setError('');
    const clean = hazards.filter((h) => h.hazard.trim());
    if (!f.projectId.trim() || !f.reference.trim() || !f.activity.trim()) return setError('Project, reference and activity are required');
    if (clean.length === 0) return setError('Add at least one hazard');
    setBusy(true);
    try {
      const res = await fetch('/api/hse/risk-assessments', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: f.projectId, reference: f.reference, activity: f.activity, assessor: f.assessor || undefined, reviewDate: f.reviewDate || undefined, hazards: clean }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setRows((p) => [data, ...p]);
      setF({ projectId: f.projectId, reference: '', activity: '', assessor: '', reviewDate: '' });
      setHazards([emptyHazard()]);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const approve = async (id: string) => {
    setError('');
    try {
      const res = await fetch(`/api/hse/risk-assessments/${id}/approve`, { method: 'PUT' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setRows((p) => p.map((r) => (r.id === id ? data : r)));
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <>
      <div style={st.kpis}>
        <Kpi label="Draft" value={kpi.draft} bad={kpi.draft > 0} />
        <Kpi label="High/critical residual" value={kpi.highResidual} bad={kpi.highResidual > 0} />
        <Kpi label="Approved" value={kpi.approved} good />
      </div>

      <h2 style={st.h2}>New risk assessment (JSA)</h2>
      <div style={st.form}>
        <label style={st.label}>Project<ProjectPicker value={f.projectId} onChange={(id) => setField('projectId', id)} /></label>
        <label style={st.label}>Reference<input style={st.input} value={f.reference} onChange={(e) => setField('reference', e.target.value)} placeholder="RA-001" /></label>
        <label style={{ ...st.label, minWidth: 240 }}>Activity<input style={st.input} value={f.activity} onChange={(e) => setField('activity', e.target.value)} placeholder="Working at height — cable tray install" /></label>
        <label style={st.label}>Assessor<input style={st.input} value={f.assessor} onChange={(e) => setField('assessor', e.target.value)} placeholder="optional" /></label>
        <label style={st.label}>Review date<input type="date" style={st.input} value={f.reviewDate} onChange={(e) => setField('reviewDate', e.target.value)} /></label>
      </div>
      <table style={st.table}>
        <thead><tr><th style={st.th}>Hazard</th><th style={st.thC}>L</th><th style={st.thC}>S</th><th style={st.th}>Controls</th><th style={st.thC}>Res. L</th><th style={st.thC}>Res. S</th><th style={st.th}></th></tr></thead>
        <tbody>
          {hazards.map((h, i) => (
            <tr key={i}>
              <td style={st.td}><input style={{ ...st.input, minWidth: 160 }} value={h.hazard} onChange={(e) => setHaz(i, 'hazard', e.target.value)} placeholder="Fall from height" /></td>
              <td style={st.tdC}><Sel v={h.likelihood} on={(v) => setHaz(i, 'likelihood', v)} /></td>
              <td style={st.tdC}><Sel v={h.severity} on={(v) => setHaz(i, 'severity', v)} /></td>
              <td style={st.td}><input style={{ ...st.input, minWidth: 180 }} value={h.controls} onChange={(e) => setHaz(i, 'controls', e.target.value)} placeholder="Harness + edge protection" /></td>
              <td style={st.tdC}><Sel v={h.residualLikelihood} on={(v) => setHaz(i, 'residualLikelihood', v)} /></td>
              <td style={st.tdC}><Sel v={h.residualSeverity} on={(v) => setHaz(i, 'residualSeverity', v)} /></td>
              <td style={st.td}>{hazards.length > 1 && <button style={st.smRed} onClick={() => setHazards((hh) => hh.filter((_, idx) => idx !== i))}>✕</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 10 }}>
        <button style={st.smGray} onClick={() => setHazards((h) => [...h, emptyHazard()])}>+ Add hazard</button>
        <button style={{ ...st.btn, marginLeft: 12 }} onClick={create} disabled={busy}>{busy ? 'Saving…' : 'Create assessment'}</button>
        {error && <span style={st.err}>{error}</span>}
      </div>

      <div style={st.regHead}>
        <h2 style={st.h2}>Register</h2>
        <ExportButton filename="risk-assessments" title="Risk Assessment Register" rows={rows as unknown as Array<Record<string, unknown>>}
          columns={[{ key: 'reference', label: 'Reference' }, { key: 'activity', label: 'Activity' }, { key: 'assessor', label: 'Assessor' }, { key: 'initialScore', label: 'Initial' }, { key: 'residualScore', label: 'Residual' }, { key: 'residualBand', label: 'Band' }, { key: 'status', label: 'Status' }, { key: 'reviewDate', label: 'Review date' }]} />
      </div>
      {rows.length === 0 ? (
        <EmptyState compact title="No risk assessments" description="Assess the hazards of each high-risk activity, score likelihood × severity before and after controls, and approve before work starts." />
      ) : (
        <table style={st.table}>
          <thead><tr><th style={st.th}>Reference</th><th style={st.th}>Activity</th><th style={st.thC}>Initial</th><th style={st.thC}>Residual</th><th style={st.th}>Band</th><th style={st.th}>Status</th><th style={st.th}></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <>
                <tr key={r.id}>
                  <td style={st.td}><button style={st.linkBtn} onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{r.reference}</button></td>
                  <td style={st.td}>{r.activity}</td>
                  <td style={st.tdC}>{r.initialScore}</td>
                  <td style={st.tdC}>{r.residualScore}</td>
                  <td style={{ ...st.td, color: bandColor[r.residualBand], fontWeight: 700 }}>{r.residualBand}</td>
                  <td style={{ ...st.td, color: statusColor[r.status], fontWeight: 600 }}>{r.status}</td>
                  <td style={st.td}>{r.status === 'draft' && <button style={st.smGreen} onClick={() => approve(r.id)}>Approve</button>}</td>
                </tr>
                {expanded === r.id && (
                  <tr key={r.id + '-h'}>
                    <td style={{ ...st.td, background: 'var(--surface)' }} colSpan={7}>
                      <table style={{ ...st.table, margin: 0 }}>
                        <thead><tr><th style={st.thSm}>Hazard</th><th style={st.thSm}>L×S</th><th style={st.thSm}>Controls</th><th style={st.thSm}>Residual L×S</th></tr></thead>
                        <tbody>
                          {r.hazards.map((h, idx) => (
                            <tr key={idx}>
                              <td style={st.tdSm}>{h.hazard}</td>
                              <td style={st.tdSm}>{h.likelihood}×{h.severity} = {h.likelihood * h.severity}</td>
                              <td style={st.tdSm}>{h.controls || '—'}</td>
                              <td style={st.tdSm}>{h.residualLikelihood}×{h.residualSeverity} = {h.residualLikelihood * h.residualSeverity}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Sel({ v, on }: { v: number; on: (v: number) => void }) {
  return <select style={{ ...st.input, minWidth: 52 }} value={v} onChange={(e) => on(Number(e.target.value))}>{SCORES.map((n) => <option key={n} value={n}>{n}</option>)}</select>;
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
  kpi: { border: '1px solid var(--border)', borderRadius: 10, padding: '12px 18px', minWidth: 150, background: 'var(--surface)' } as CSSProperties,
  kpiLabel: { fontSize: 12, color: 'var(--muted)', marginBottom: 4 } as CSSProperties,
  kpiValue: { fontSize: 24, fontWeight: 700, letterSpacing: -0.5 } as CSSProperties,
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 14 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 120, background: 'var(--surface)', color: 'var(--fg)' } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  smGray: { padding: '5px 12px', borderRadius: 4, background: 'var(--surface-2, #e5e7eb)', color: 'inherit', border: '1px solid var(--border)', fontSize: 13, cursor: 'pointer' } as CSSProperties,
  smGreen: { padding: '4px 10px', borderRadius: 4, background: '#16a34a', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  smRed: { padding: '4px 10px', borderRadius: 4, background: '#dc2626', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  linkBtn: { background: 'none', border: 'none', color: 'var(--accent, #2563eb)', cursor: 'pointer', fontWeight: 600, padding: 0, fontSize: 14 } as CSSProperties,
  err: { color: '#dc2626', marginLeft: 12, fontSize: 13 } as CSSProperties,
  h2: { fontSize: 20, margin: '22px 0 10px' } as CSSProperties,
  regHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 8 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  thC: { textAlign: 'center' as const, padding: '8px 8px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)', verticalAlign: 'top' } as CSSProperties,
  tdC: { padding: '8px 8px', borderBottom: '1px solid var(--border, #e5e7eb)', textAlign: 'center' as const } as CSSProperties,
  thSm: { textAlign: 'left' as const, padding: '5px 10px', borderBottom: '1px solid var(--border, #e5e7eb)', fontWeight: 600, fontSize: 13 } as CSSProperties,
  tdSm: { padding: '5px 10px', borderBottom: '1px solid var(--border, #eef2f6)', fontSize: 13 } as CSSProperties,
};
