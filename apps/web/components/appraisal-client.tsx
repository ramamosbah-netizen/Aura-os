'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import EmptyState from './ui/empty-state';
import ExportButton from './export-button';

interface Criterion { name: string; weight: number; score: number }
export interface Appraisal {
  id: string;
  employeeId: string;
  employeeName: string | null;
  period: string;
  reviewerId: string | null;
  criteria: Criterion[];
  overallScore: number;
  status: 'draft' | 'submitted' | 'acknowledged';
  strengths: string | null;
  improvements: string | null;
  comments: string | null;
  createdAt: string;
}

const statusColor: Record<string, string> = { draft: '#d97706', submitted: '#2563eb', acknowledged: '#16a34a' };
const scoreColor = (n: number) => (n >= 70 ? '#16a34a' : n >= 50 ? '#d97706' : '#dc2626');
const emptyCriterion = (): Criterion => ({ name: '', weight: 1, score: 3 });
const SCORES = [0, 1, 2, 3, 4, 5];

export default function AppraisalClient({ initial }: { initial: Appraisal[] }) {
  const [rows, setRows] = useState(initial);
  const [f, setF] = useState({ employeeId: '', employeeName: '', period: '', strengths: '', improvements: '' });
  const [criteria, setCriteria] = useState<Criterion[]>([emptyCriterion()]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const kpi = useMemo(() => ({
    draft: rows.filter((r) => r.status === 'draft').length,
    awaiting: rows.filter((r) => r.status === 'submitted').length,
    avg: rows.length ? Math.round(rows.reduce((s, r) => s + r.overallScore, 0) / rows.length) : 0,
  }), [rows]);

  const setField = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const setCrit = (i: number, k: keyof Criterion, v: string | number) => setCriteria((c) => c.map((row, idx) => (idx === i ? { ...row, [k]: k === 'name' ? v : Number(v) } : row)));

  const create = async () => {
    setError('');
    const clean = criteria.filter((c) => c.name.trim() && c.weight > 0);
    if (!f.employeeId.trim() || !f.period.trim()) return setError('Employee ID and period are required');
    if (clean.length === 0) return setError('Add at least one weighted criterion');
    setBusy(true);
    try {
      const res = await fetch('/api/hr/appraisals', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ employeeId: f.employeeId, employeeName: f.employeeName || undefined, period: f.period, criteria: clean, strengths: f.strengths || undefined, improvements: f.improvements || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setRows((p) => [data, ...p]);
      setF({ employeeId: '', employeeName: '', period: f.period, strengths: '', improvements: '' });
      setCriteria([emptyCriterion()]);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const act = async (id: string, action: 'submit' | 'acknowledge') => {
    setError('');
    try {
      const res = await fetch(`/api/hr/appraisals/${id}/${action}`, { method: 'PUT' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setRows((p) => p.map((r) => (r.id === id ? data : r)));
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <>
      <div style={st.kpis}>
        <Kpi label="Draft" value={String(kpi.draft)} />
        <Kpi label="Awaiting acknowledgement" value={String(kpi.awaiting)} />
        <Kpi label="Avg score" value={`${kpi.avg}/100`} color={scoreColor(kpi.avg)} />
      </div>

      <h2 style={st.h2}>New appraisal</h2>
      <div style={st.form}>
        <label style={st.label}>Employee ID<input style={st.input} value={f.employeeId} onChange={(e) => setField('employeeId', e.target.value)} placeholder="uuid" /></label>
        <label style={st.label}>Employee name<input style={st.input} value={f.employeeName} onChange={(e) => setField('employeeName', e.target.value)} placeholder="optional" /></label>
        <label style={st.label}>Period<input style={st.input} value={f.period} onChange={(e) => setField('period', e.target.value)} placeholder="2026-H1" /></label>
        <label style={{ ...st.label, minWidth: 200 }}>Strengths<input style={st.input} value={f.strengths} onChange={(e) => setField('strengths', e.target.value)} placeholder="optional" /></label>
        <label style={{ ...st.label, minWidth: 200 }}>Improvements<input style={st.input} value={f.improvements} onChange={(e) => setField('improvements', e.target.value)} placeholder="optional" /></label>
      </div>
      <table style={st.table}>
        <thead><tr><th style={st.th}>Competency</th><th style={st.thC}>Weight</th><th style={st.thC}>Score (0–5)</th><th style={st.th}></th></tr></thead>
        <tbody>
          {criteria.map((c, i) => (
            <tr key={i}>
              <td style={st.td}><input style={{ ...st.input, minWidth: 200 }} value={c.name} onChange={(e) => setCrit(i, 'name', e.target.value)} placeholder="Technical quality" /></td>
              <td style={st.tdC}><input style={{ ...st.input, minWidth: 70 }} inputMode="numeric" value={c.weight} onChange={(e) => setCrit(i, 'weight', e.target.value)} /></td>
              <td style={st.tdC}><select style={{ ...st.input, minWidth: 60 }} value={c.score} onChange={(e) => setCrit(i, 'score', e.target.value)}>{SCORES.map((n) => <option key={n} value={n}>{n}</option>)}</select></td>
              <td style={st.td}>{criteria.length > 1 && <button style={st.smRed} onClick={() => setCriteria((cc) => cc.filter((_, idx) => idx !== i))}>✕</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 10 }}>
        <button style={st.smGray} onClick={() => setCriteria((c) => [...c, emptyCriterion()])}>+ Add competency</button>
        <button style={{ ...st.btn, marginLeft: 12 }} onClick={create} disabled={busy}>{busy ? 'Saving…' : 'Create appraisal'}</button>
        {error && <span style={st.err}>{error}</span>}
      </div>

      <div style={st.regHead}>
        <h2 style={st.h2}>Appraisals</h2>
        <ExportButton filename="appraisals" title="Performance Appraisals" rows={rows as unknown as Array<Record<string, unknown>>}
          columns={[{ key: 'employeeName', label: 'Employee' }, { key: 'employeeId', label: 'Employee ID' }, { key: 'period', label: 'Period' }, { key: 'overallScore', label: 'Overall' }, { key: 'status', label: 'Status' }]} />
      </div>
      {rows.length === 0 ? (
        <EmptyState compact title="No appraisals" description="Score each competency by weight to produce an overall 0–100 rating, then submit for the employee to acknowledge." />
      ) : (
        <table style={st.table}>
          <thead><tr><th style={st.th}>Employee</th><th style={st.th}>Period</th><th style={st.thC}>Overall</th><th style={st.th}>Status</th><th style={st.th}></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <>
                <tr key={r.id}>
                  <td style={st.td}><button style={st.linkBtn} onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{r.employeeName || r.employeeId}</button></td>
                  <td style={st.td}>{r.period}</td>
                  <td style={{ ...st.tdC, color: scoreColor(r.overallScore), fontWeight: 700 }}>{r.overallScore}</td>
                  <td style={{ ...st.td, color: statusColor[r.status], fontWeight: 600 }}>{r.status}</td>
                  <td style={st.td}>
                    {r.status === 'draft' && <button style={st.sm} onClick={() => act(r.id, 'submit')}>Submit</button>}
                    {r.status === 'submitted' && <button style={st.smGreen} onClick={() => act(r.id, 'acknowledge')}>Acknowledge</button>}
                  </td>
                </tr>
                {expanded === r.id && (
                  <tr key={r.id + '-c'}>
                    <td style={{ ...st.td, background: 'var(--surface)' }} colSpan={5}>
                      <table style={{ ...st.table, margin: 0 }}>
                        <thead><tr><th style={st.thSm}>Competency</th><th style={st.thSm}>Weight</th><th style={st.thSm}>Score</th></tr></thead>
                        <tbody>
                          {r.criteria.map((c, idx) => (
                            <tr key={idx}><td style={st.tdSm}>{c.name}</td><td style={st.tdSm}>{c.weight}</td><td style={st.tdSm}>{c.score}/5</td></tr>
                          ))}
                        </tbody>
                      </table>
                      {r.strengths && <p style={st.note}><b>Strengths:</b> {r.strengths}</p>}
                      {r.improvements && <p style={st.note}><b>Improvements:</b> {r.improvements}</p>}
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

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={st.kpi}>
      <div style={st.kpiLabel}>{label}</div>
      <div style={{ ...st.kpiValue, color: color ?? 'var(--fg)' }}>{value}</div>
    </div>
  );
}

const st = {
  kpis: { display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' as const } as CSSProperties,
  kpi: { border: '1px solid var(--border)', borderRadius: 10, padding: '12px 18px', minWidth: 160, background: 'var(--surface)' } as CSSProperties,
  kpiLabel: { fontSize: 12, color: 'var(--muted)', marginBottom: 4 } as CSSProperties,
  kpiValue: { fontSize: 24, fontWeight: 700, letterSpacing: -0.5 } as CSSProperties,
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 14 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 120, background: 'var(--surface)', color: 'var(--fg)' } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  sm: { padding: '4px 10px', borderRadius: 4, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  smGray: { padding: '5px 12px', borderRadius: 4, background: 'var(--surface-2, #e5e7eb)', color: 'inherit', border: '1px solid var(--border)', fontSize: 13, cursor: 'pointer' } as CSSProperties,
  smGreen: { padding: '4px 10px', borderRadius: 4, background: '#16a34a', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  smRed: { padding: '4px 10px', borderRadius: 4, background: '#dc2626', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  linkBtn: { background: 'none', border: 'none', color: 'var(--accent, #2563eb)', cursor: 'pointer', fontWeight: 600, padding: 0, fontSize: 14 } as CSSProperties,
  err: { color: '#dc2626', marginLeft: 12, fontSize: 13 } as CSSProperties,
  h2: { fontSize: 20, margin: '22px 0 10px' } as CSSProperties,
  regHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 8 } as CSSProperties,
  note: { fontSize: 13, color: 'var(--muted)', margin: '6px 0 0' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  thC: { textAlign: 'center' as const, padding: '8px 8px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)', verticalAlign: 'top' } as CSSProperties,
  tdC: { padding: '8px 8px', borderBottom: '1px solid var(--border, #e5e7eb)', textAlign: 'center' as const } as CSSProperties,
  thSm: { textAlign: 'left' as const, padding: '5px 10px', borderBottom: '1px solid var(--border, #e5e7eb)', fontWeight: 600, fontSize: 13 } as CSSProperties,
  tdSm: { padding: '5px 10px', borderBottom: '1px solid var(--border, #eef2f6)', fontSize: 13 } as CSSProperties,
};
