'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import EmptyState from './ui/empty-state';
import { Badge, Button, Field, Input, KpiTile, Table, Td, Th } from './ui/kit';
import ProjectPicker from './ui/project-picker';

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
        <KpiTile label="Draft reports" value={kpi.draft} tone={kpi.draft > 0 ? 'warn' : undefined} />
        <KpiTile label="Submitted" value={kpi.submitted} tone="good" />
        <KpiTile label="Man-hours logged" value={kpi.manHours} />
      </div>

      <h2 style={st.h2}>New daily report</h2>
      <div style={st.form}>
        <Field label="Project"><ProjectPicker value={dr.projectId} onChange={(id) => setD('projectId', id)} /></Field>
        <Field label="Date"><Input type="date" value={dr.date} onChange={(e) => setD('date', e.target.value)} /></Field>
        <Field label="Work done today" style={{ minWidth: 280 }}><Input value={dr.workDescription} onChange={(e) => setD('workDescription', e.target.value)} placeholder="Containment 2nd fix, L3 east" /></Field>
        <Field label="Manpower"><Input style={{ minWidth: 90 }} inputMode="numeric" value={dr.manpowerCount} onChange={(e) => setD('manpowerCount', e.target.value)} placeholder="0" /></Field>
        <Field label="Plant/equip"><Input style={{ minWidth: 90 }} inputMode="numeric" value={dr.equipmentCount} onChange={(e) => setD('equipmentCount', e.target.value)} placeholder="0" /></Field>
        <Button onClick={createReport} disabled={busy}>Add report</Button>
        {error && <span style={st.err}>{error}</span>}
      </div>

      <h2 style={st.h2}>Site diary</h2>
      {rows.length === 0 ? (
        <EmptyState compact title="No daily reports" description="Record the day's work, manpower and plant, then submit — this is the site diary that backs progress claims and delay evidence." />
      ) : (
        <Table>
          <thead><tr><Th>Date</Th><Th>Work done</Th><Th align="right">Manpower</Th><Th align="right">Plant</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td>{r.date}</Td>
                <Td>{r.workDescription}</Td>
                <Td align="right">{r.manpowerCount}</Td>
                <Td align="right">{r.equipmentCount}</Td>
                <Td><Badge tone={r.status === 'submitted' ? 'good' : 'warn'}>{r.status}</Badge></Td>
                <Td>{r.status === 'draft' && <Button size="sm" tone="neutral" onClick={() => submit(r.id)}>Submit</Button>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <h2 style={st.h2}>Labour return</h2>
      <div style={st.form}>
        <Field label="Project"><ProjectPicker value={lr.projectId} onChange={(id) => setL('projectId', id)} /></Field>
        <Field label="Date"><Input type="date" value={lr.date} onChange={(e) => setL('date', e.target.value)} /></Field>
        <Field label="Trade"><Input value={lr.trade} onChange={(e) => setL('trade', e.target.value)} placeholder="Electrician" /></Field>
        <Field label="Headcount"><Input style={{ minWidth: 90 }} inputMode="numeric" value={lr.headcount} onChange={(e) => setL('headcount', e.target.value)} placeholder="0" /></Field>
        <Field label="Hours"><Input style={{ minWidth: 80 }} inputMode="numeric" value={lr.hours} onChange={(e) => setL('hours', e.target.value)} placeholder="8" /></Field>
        <Field label="Subcontractor"><Input value={lr.subcontractorName} onChange={(e) => setL('subcontractorName', e.target.value)} placeholder="optional" /></Field>
        <Button onClick={logLabour} disabled={busy}>Log labour</Button>
      </div>
      {lab.length === 0 ? (
        <EmptyState compact title="No labour logged" description="Record headcount and hours per trade — man-hours roll up automatically for productivity and payment." />
      ) : (
        <Table>
          <thead><tr><Th>Date</Th><Th>Trade</Th><Th>Subcontractor</Th><Th align="right">Head</Th><Th align="right">Hours</Th><Th align="right">Man-hours</Th></tr></thead>
          <tbody>
            {lab.map((l) => (
              <tr key={l.id}>
                <Td>{l.date}</Td>
                <Td>{l.trade}</Td>
                <Td>{l.subcontractorName || '—'}</Td>
                <Td align="right">{l.headcount}</Td>
                <Td align="right">{l.hours}</Td>
                <Td align="right" style={{ fontWeight: 600 }}>{l.manHours}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}

const st = {
  kpis: { display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' as const } as CSSProperties,
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 14 } as CSSProperties,
  err: { color: 'var(--bad)', marginLeft: 12, fontSize: 13, alignSelf: 'center' } as CSSProperties,
  h2: { fontSize: 20, margin: '22px 0 10px', color: 'var(--text)' } as CSSProperties,
};
