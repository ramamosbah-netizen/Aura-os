'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import EmptyState from './ui/empty-state';
import ExportButton from './export-button';
import FileAttachmentZone, { type AttachmentItem } from './ui/file-attachment-zone';
import { Badge, Button, Field, Input, KpiTile, Table, Td, Th } from './ui/kit';
import ProjectPicker from './ui/project-picker';
import type { PickerProject } from './ui/project-picker';
import SaveViewButton from './save-view-button';
import SignatureCanvas from './ui/signature-canvas';
import { fetchWithOfflineFallback, generateUUID } from '@/lib/offline-sync';

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

export default function DailyReportClient({ reports, labour, initialProjectId = '', projects, projectsUnavailable = false }: { reports: DailyReport[]; labour: LabourAllocation[]; initialProjectId?: string; projects?: PickerProject[]; projectsUnavailable?: boolean }) {
  const [rows, setRows] = useState(reports);
  const [lab, setLab] = useState(labour);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dr, setDr] = useState({ projectId: initialProjectId, date: today(), workDescription: '', manpowerCount: '', equipmentCount: '' });
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [signature, setSignature] = useState<string | null>(null);
  const [lr, setLr] = useState({ projectId: initialProjectId, date: today(), trade: '', headcount: '', hours: '', subcontractorName: '' });
  const reportProjectSelected = dr.projectId.trim().length > 0;
  const labourProjectSelected = lr.projectId.trim().length > 0;

  const kpi = useMemo(() => ({
    draft: rows.filter((r) => r.status === 'draft').length,
    submitted: rows.filter((r) => r.status === 'submitted').length,
    manHours: Math.round(lab.reduce((s, l) => s + l.manHours, 0)),
  }), [rows, lab]);

  const setD = (k: keyof typeof dr, v: string) => setDr((p) => ({ ...p, [k]: v }));
  const setL = (k: keyof typeof lr, v: string) => setLr((p) => ({ ...p, [k]: v }));

  const createReport = async () => {
    setError('');
    if (!reportProjectSelected) return setError('Select a project before creating a daily report.');
    if (!dr.date.trim() || !dr.workDescription.trim()) return setError('Date and work description are required');
    setBusy(true);
    try {
      const payload = { projectId: dr.projectId, date: dr.date, workDescription: dr.workDescription, manpowerCount: Number(dr.manpowerCount) || 0, equipmentCount: Number(dr.equipmentCount) || 0 };
      const result = await fetchWithOfflineFallback<DailyReport>('/api/site/daily-reports', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, { entityType: 'daily_report', priority: 'high' });
      if (!result.ok && !result.offline) throw new Error(result.error || 'Failed');
      if (result.offline && result.pendingSync) {
        // Insert an optimistic placeholder row — the sync engine will replay it
        const offlineRow: DailyReport = {
          id: result.data?.id || `offline-${generateUUID()}`,
          projectId: dr.projectId,
          projectName: null,
          date: dr.date,
          workDescription: dr.workDescription,
          manpowerCount: Number(dr.manpowerCount) || 0,
          equipmentCount: Number(dr.equipmentCount) || 0,
          status: 'draft',
          createdAt: new Date().toISOString(),
        };
        setRows((p) => [offlineRow, ...p]);
      } else if (result.data) {
        setRows((p) => [result.data!, ...p]);
      }
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
    if (!labourProjectSelected) return setError('Select a project before logging labour.');
    if (!lr.trade.trim() || !lr.date.trim()) return setError('Trade and date are required');
    setBusy(true);
    try {
      const payload = { projectId: lr.projectId, date: lr.date, trade: lr.trade, headcount: Number(lr.headcount) || 0, hours: Number(lr.hours) || 0, subcontractorName: lr.subcontractorName || undefined };
      const result = await fetchWithOfflineFallback<LabourAllocation>('/api/site/labour', {
        method: 'POST',
        body: JSON.stringify(payload),
      }, { entityType: 'labour_return', priority: 'normal' });
      if (!result.ok && !result.offline) throw new Error(result.error || 'Failed');
      if (result.offline && result.pendingSync) {
        const offlineRow: LabourAllocation = {
          id: result.data?.id || `offline-${generateUUID()}`,
          projectId: lr.projectId,
          date: lr.date,
          trade: lr.trade,
          headcount: Number(lr.headcount) || 0,
          hours: Number(lr.hours) || 0,
          manHours: (Number(lr.headcount) || 0) * (Number(lr.hours) || 0),
          subcontractorName: lr.subcontractorName || null,
          notes: null,
        };
        setLab((p) => [offlineRow, ...p]);
      } else if (result.data) {
        setLab((p) => [result.data!, ...p]);
      }
      setLr({ projectId: lr.projectId, date: today(), trade: '', headcount: '', hours: '', subcontractorName: '' });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <>
      <div style={st.kpis}>
        <KpiTile label="Draft reports" value={kpi.draft} tone={kpi.draft > 0 ? 'warn' : undefined} />
        <KpiTile label="Submitted" value={kpi.submitted} tone="good" />
        <KpiTile label="Man-hours logged" value={kpi.manHours} />
        <div style={{ marginLeft: 'auto', alignSelf: 'center', display: 'flex', gap: 8 }}>
          <SaveViewButton />
          <ExportButton
            filename="daily-reports"
            title="Daily Site Reports"
            rows={rows as unknown as Array<Record<string, unknown>>}
            columns={[
              { key: 'date', label: 'Date' },
              { key: 'workDescription', label: 'Description' },
              { key: 'manpowerCount', label: 'Manpower' },
              { key: 'equipmentCount', label: 'Equipment' },
              { key: 'status', label: 'Status' },
            ]}
          />
        </div>
      </div>

      <h2 style={st.h2}>New daily report</h2>
      <div style={st.formCard}>
        <div style={st.formHeader}><div><div style={st.formEyebrow}>Controlled site record</div><strong>Start with the project</strong><span style={st.formHint}>A daily report cannot be issued without a project context.</span></div><span style={reportProjectSelected ? st.readyBadge : st.lockedBadge}>{reportProjectSelected ? 'Project selected' : 'Project required'}</span></div>
        <div style={st.form}>
          <Field label="Project"><ProjectPicker value={dr.projectId} onChange={(id) => setD('projectId', id)} projects={projects} disabled={busy || projectsUnavailable} /></Field>
          <Field label="Date"><Input disabled={!reportProjectSelected || busy} type="date" value={dr.date} onChange={(e) => setD('date', e.target.value)} /></Field>
          <Field label="Work done today" style={{ minWidth: 280 }}><Input disabled={!reportProjectSelected || busy} value={dr.workDescription} onChange={(e) => setD('workDescription', e.target.value)} placeholder="Containment 2nd fix, L3 east" /></Field>
          <Field label="Manpower"><Input disabled={!reportProjectSelected || busy} style={{ minWidth: 90 }} inputMode="numeric" value={dr.manpowerCount} onChange={(e) => setD('manpowerCount', e.target.value)} placeholder="0" /></Field>
          <Field label="Plant/equip"><Input disabled={!reportProjectSelected || busy} style={{ minWidth: 90 }} inputMode="numeric" value={dr.equipmentCount} onChange={(e) => setD('equipmentCount', e.target.value)} placeholder="0" /></Field>
        </div>

        {!reportProjectSelected && <div role="status" style={st.projectGate}>Select a project first to unlock the report fields, photos and Add report action.</div>}
        {projectsUnavailable && <div role="alert" style={st.err}>Project list is unavailable. The report form is locked until projects can be loaded.</div>}
        {reportProjectSelected && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14 }}>
          <FileAttachmentZone label="Site Progress Photos" attachments={attachments} onChange={setAttachments} />
          <SignatureCanvas label="Supervisor Sign-off" value={signature} onChange={setSignature} />
        </div>}

        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button onClick={createReport} disabled={busy || !reportProjectSelected}>{busy ? 'Saving…' : 'Add report'}</Button>
          {error && <span style={st.err}>{error}</span>}
        </div>
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
                <Td><Badge tone={r.status === 'submitted' ? 'good' : r.id.startsWith('offline-') || r.id.startsWith('client-') ? 'info' : 'warn'}>{r.id.startsWith('offline-') || r.id.startsWith('client-') ? '📡 Queued' : r.status}</Badge></Td>
                <Td>
                  {r.status === 'draft' && <Button size="sm" tone="neutral" onClick={() => submit(r.id)}>Submit</Button>}
                  <a href={`/site/daily-reports/${r.id}/print`} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }} title="Print Daily Report (PDF)">🖨</a>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <h2 style={st.h2}>Labour return</h2>
      <div style={st.form}>
        <Field label="Project"><ProjectPicker value={lr.projectId} onChange={(id) => setL('projectId', id)} projects={projects} disabled={busy || projectsUnavailable} /></Field>
        <Field label="Date"><Input disabled={!labourProjectSelected || busy} type="date" value={lr.date} onChange={(e) => setL('date', e.target.value)} /></Field>
        <Field label="Trade"><Input disabled={!labourProjectSelected || busy} value={lr.trade} onChange={(e) => setL('trade', e.target.value)} placeholder="Electrician" /></Field>
        <Field label="Headcount"><Input disabled={!labourProjectSelected || busy} style={{ minWidth: 90 }} inputMode="numeric" value={lr.headcount} onChange={(e) => setL('headcount', e.target.value)} placeholder="0" /></Field>
        <Field label="Hours"><Input disabled={!labourProjectSelected || busy} style={{ minWidth: 80 }} inputMode="numeric" value={lr.hours} onChange={(e) => setL('hours', e.target.value)} placeholder="8" /></Field>
        <Field label="Subcontractor"><Input disabled={!labourProjectSelected || busy} value={lr.subcontractorName} onChange={(e) => setL('subcontractorName', e.target.value)} placeholder="optional" /></Field>
        <Button onClick={logLabour} disabled={busy || !labourProjectSelected}>Log labour</Button>
      </div>
      {!labourProjectSelected && <div role="status" style={st.projectGate}>Select a project before logging a labour return.</div>}
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
  formCard: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', marginBottom: 18 } as CSSProperties,
  formHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 14, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'color-mix(in srgb, var(--panel, #fff) 92%, var(--accent, #2563eb))' } as CSSProperties,
  formEyebrow: { color: 'var(--accent)', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 4 } as CSSProperties,
  formHint: { display: 'block', color: 'var(--muted)', fontSize: 12, fontWeight: 400, marginTop: 3 } as CSSProperties,
  readyBadge: { color: 'var(--good)', border: '1px solid color-mix(in srgb, var(--good) 40%, transparent)', background: 'color-mix(in srgb, var(--good) 12%, transparent)', borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' as const } as CSSProperties,
  lockedBadge: { color: 'var(--warn)', border: '1px solid color-mix(in srgb, var(--warn) 40%, transparent)', background: 'color-mix(in srgb, var(--warn) 12%, transparent)', borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' as const } as CSSProperties,
  projectGate: { marginTop: 14, padding: '10px 12px', borderRadius: 8, color: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 9%, transparent)', border: '1px solid color-mix(in srgb, var(--warn) 25%, transparent)', fontSize: 13 } as CSSProperties,
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end' } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 13, alignSelf: 'center' } as CSSProperties,
  h2: { fontSize: 20, margin: '22px 0 10px', color: 'var(--text)' } as CSSProperties,
};
