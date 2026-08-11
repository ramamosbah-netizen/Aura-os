'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import EmptyState from './ui/empty-state';
import ExportButton from './export-button';
import FileAttachmentZone, { type AttachmentItem } from './ui/file-attachment-zone';
import { Badge, Button, Field, Input, KpiTile, Select, Table, Td, Th } from './ui/kit';
import ProjectPicker from './ui/project-picker';
import SaveViewButton from './save-view-button';
import SignatureCanvas from './ui/signature-canvas';

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

export default function InspectionRequestClient({ initial }: { initial: InspectionRequest[] }) {
  const [rows, setRows] = useState(initial);
  const [f, setF] = useState({ projectId: '', irNumber: '', discipline: 'electrical', locationDetail: '', inspectionDate: '' });
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [signature, setSignature] = useState<string | null>(null);
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

  const statusTone = (s: string): 'good' | 'bad' | 'warn' => (s === 'approved' ? 'good' : s === 'rejected' ? 'bad' : 'warn');

  return (
    <>
      <div style={st.kpis}>
        <KpiTile label="Awaiting inspection" value={kpi.pending} tone={kpi.pending > 0 ? 'warn' : undefined} />
        <KpiTile label="Approved" value={kpi.approved} tone="good" />
        <KpiTile label="Rejected" value={kpi.rejected} tone={kpi.rejected > 0 ? 'bad' : undefined} />
        <div style={{ marginLeft: 'auto', alignSelf: 'center', display: 'flex', gap: 8 }}>
          <SaveViewButton />
          <ExportButton
            filename="inspection-requests"
            title="Inspection Requests Register"
            rows={rows as unknown as Array<Record<string, unknown>>}
            columns={[
              { key: 'irNumber', label: 'IR #' },
              { key: 'discipline', label: 'Discipline' },
              { key: 'locationDetail', label: 'Location' },
              { key: 'inspectionDate', label: 'Date' },
              { key: 'status', label: 'Status' },
            ]}
          />
        </div>
      </div>

      <h2 style={st.h2}>Request inspection</h2>
      <div style={st.formCard}>
        <div style={st.form}>
          <Field label="Project"><ProjectPicker value={f.projectId} onChange={(id) => set('projectId', id)} /></Field>
          <Field label="IR number"><Input value={f.irNumber} onChange={(e) => set('irNumber', e.target.value)} placeholder="IR-001" /></Field>
          <Field label="Discipline"><Select value={f.discipline} onChange={(e) => set('discipline', e.target.value)}>{DISCIPLINES.map((d) => <option key={d} value={d}>{d}</option>)}</Select></Field>
          <Field label="Location" style={{ minWidth: 220 }}><Input value={f.locationDetail} onChange={(e) => set('locationDetail', e.target.value)} placeholder="L3 riser, grid C4" /></Field>
          <Field label="Date"><Input type="date" value={f.inspectionDate} onChange={(e) => set('inspectionDate', e.target.value)} /></Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14 }}>
          <FileAttachmentZone label="Inspection Photo Evidence" attachments={attachments} onChange={setAttachments} />
          <SignatureCanvas label="Inspector / Witness Signature" value={signature} onChange={setSignature} />
        </div>

        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button onClick={request} disabled={busy}>{busy ? 'Requesting…' : 'Request'}</Button>
          {error && <span style={st.err}>{error}</span>}
        </div>
      </div>

      <h2 style={st.h2}>Register</h2>
      {rows.length === 0 ? (
        <EmptyState compact title="No inspection requests" description="Raise an IR to call the consultant/QA for a hold or witness point before covering up the works." />
      ) : (
        <Table>
          <thead><tr><Th>IR</Th><Th>Discipline</Th><Th>Location</Th><Th>Date</Th><Th>Status</Th><Th>Actions</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td>{r.irNumber}</Td>
                <Td>{r.discipline}</Td>
                <Td>{r.locationDetail}</Td>
                <Td>{r.inspectionDate}</Td>
                <Td>
                  <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                  {r.comments ? <div style={st.cmt}>{r.comments}</div> : null}
                </Td>
                <Td>
                  {r.status === 'requested' ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <Input style={{ minWidth: 140 }} placeholder="comments" value={comments[r.id] || ''} onChange={(e) => setComments((c) => ({ ...c, [r.id]: e.target.value }))} />
                      <Button size="sm" tone="neutral" onClick={() => resolve(r.id, 'approved')}>Approve</Button>
                      <Button size="sm" tone="danger" onClick={() => resolve(r.id, 'rejected')}>Reject</Button>
                    </div>
                  ) : '—'}
                </Td>
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
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end' } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 13, alignSelf: 'center' } as CSSProperties,
  h2: { fontSize: 20, margin: '18px 0 10px', color: 'var(--text)' } as CSSProperties,
  cmt: { fontSize: 12, color: 'var(--muted)', fontWeight: 400, marginTop: 2 } as CSSProperties,
};
