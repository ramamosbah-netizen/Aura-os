'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import { DISCIPLINES, DISCIPLINE_LABELS, type Discipline } from '@aura/shared';
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
  discipline: Discipline;
  locationDetail: string;
  inspectionDate: string;
  status: 'requested' | 'approved' | 'rejected';
  inspectedBy: string | null;
  comments: string | null;
  createdAt: string;
}

// TC-GATE-12: the canonical platform vocabulary. This list used to be four values, none of which
// could describe an ELV system — on an ELV ERP.

export default function InspectionRequestClient({ initial }: { initial: InspectionRequest[] }) {
  const [rows, setRows] = useState(initial);
  const [f, setF] = useState({ projectId: '', irNumber: '', discipline: 'electrical', locationDetail: '', inspectionDate: '' });
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  /**
   * THE SIGNATURE BELONGS TO THE DECISION, not to the request.
   *
   * It used to sit in the "Request inspection" form beside the photo picker, wired to a handler
   * whose value the submit payload never read — so the pad was offered at the moment an
   * inspection was ASKED FOR, which is before anyone has looked at anything. A consultant signs
   * when they approve or reject, so it is keyed by the row being resolved.
   */
  const [signatures, setSignatures] = useState<Record<string, string | null>>({});
  const [signedBy, setSignedBy] = useState<Record<string, string>>({});
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

      /**
       * THE PART THAT WAS MISSING. The picked photographs were held in React state, drawn back as
       * thumbnails, and never sent — the payload above has no field for them, and until now
       * quality had no upload route to send them to. Only for an IR that really exists: there is
       * no id to attach to before the record is created.
       */
      const failed: string[] = [];
      for (const [i, a] of attachments.entries()) {
        if (!a.dataUrl) continue;
        try {
          await uploadEvidence(data.id, a.dataUrl, a.name, `Inspection photo ${i + 1}`);
        } catch (e) { failed.push(`${a.name}: ${(e as Error).message}`); }
      }

      setRows((p) => [data, ...p]);
      setF({ projectId: f.projectId, irNumber: '', discipline: f.discipline, locationDetail: '', inspectionDate: '' });
      // Said out loud rather than clearing the picker and letting the screen imply it was saved —
      // the silent discard is the whole defect being fixed here.
      if (failed.length) {
        setError(`The inspection was raised. ${failed.length} photo(s) were not attached: ${failed.join('; ')}`);
        return;
      }
      setAttachments([]);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  /**
   * Send one photograph to storage and attach it to the inspection, in one call.
   *
   * THE FILE IS NAMED FOR WHAT IT ACTUALLY IS. FileAttachmentZone re-encodes images to keep a site
   * upload small, so a picked `riser.png` is JPEG bytes by the time it gets here. The server
   * judges the type from the CONTENT and refuses a file whose name disagrees with it, so the
   * extension is taken from the data URL's own media type.
   */
  const uploadEvidence = async (irId: string, dataUrl: string, baseName: string, description: string): Promise<void> => {
    const mediaType = /^data:([^;,]+)/.exec(dataUrl)?.[1] || 'application/octet-stream';
    const bytes = await (await fetch(dataUrl)).blob();
    const ext = mediaType === 'image/jpeg' ? 'jpg' : mediaType === 'image/png' ? 'png' : (mediaType.split('/')[1] || 'bin');
    const stem = baseName.replace(/\.[^.]+$/, '') || 'evidence';
    const form = new FormData();
    form.append('file', bytes, `${stem}.${ext}`);
    form.append('description', description);
    const res = await fetch(`/api/quality/irs/${irId}/evidence/upload`, { method: 'POST', body: form });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.message || body?.error || `evidence upload failed (${res.status})`);
  };

  const resolve = async (id: string, status: 'approved' | 'rejected') => {
    setError('');
    // THE SIGNATURE AND ITS SIGNATORY MOVE TOGETHER. Asked here so the person is still looking at
    // the pad; the API refuses the mismatch too, but this message can name the field.
    const ink = signatures[id] ?? null;
    const name = (signedBy[id] ?? '').trim();
    if (ink && !name) return setError('Name the person who signed this inspection. A signature recorded against whoever entered it is not attributable to them.');
    if (name && !ink) return setError('A signatory was named but nothing was signed.');
    try {
      const res = await fetch(`/api/quality/irs/${id}/resolve`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status,
          comments: comments[id] || undefined,
          signedBy: name || undefined,
          signature: ink || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setRows((p) => p.map((r) => (r.id === id ? data : r)));
      // Drop the ink once it is stored, so a second inspection on the same screen cannot inherit
      // the signature a different party just gave.
      setSignatures((prev) => { const next = { ...prev }; delete next[id]; return next; });
      setSignedBy((prev) => { const next = { ...prev }; delete next[id]; return next; });
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
          <Field label="Discipline"><Select value={f.discipline} onChange={(e) => set('discipline', e.target.value)}>{DISCIPLINES.map((d) => <option key={d} value={d}>{DISCIPLINE_LABELS[d]}</option>)}</Select></Field>
          <Field label="Location" style={{ minWidth: 220 }}><Input value={f.locationDetail} onChange={(e) => set('locationDetail', e.target.value)} placeholder="L3 riser, grid C4" /></Field>
          <Field label="Date"><Input type="date" value={f.inspectionDate} onChange={(e) => set('inspectionDate', e.target.value)} /></Field>
        </div>

        <div style={{ marginTop: 14 }}>
          {/* The signature is no longer here: it evidences the DECISION and is offered on the row
              being resolved, not at the moment an inspection is asked for. */}
          <FileAttachmentZone label="Inspection Photo Evidence" attachments={attachments} onChange={setAttachments} />
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
                    <div style={{ display: 'grid', gap: 8 }} data-testid={`ir-resolve-${r.irNumber}`}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <Input style={{ minWidth: 140 }} placeholder="comments" value={comments[r.id] || ''} onChange={(e) => setComments((c) => ({ ...c, [r.id]: e.target.value }))} />
                        <Button size="sm" tone="neutral" onClick={() => resolve(r.id, 'approved')}>Approve</Button>
                        <Button size="sm" tone="danger" onClick={() => resolve(r.id, 'rejected')}>Reject</Button>
                      </div>
                      {/* WHO SIGNED — a name, not an account. An inspection is witnessed by a
                          consultant who holds no AURA user, and the person entering the decision
                          is the recorder rather than the signatory. */}
                      <Input
                        aria-label={`Name of the person who signed ${r.irNumber}`}
                        placeholder="Name of the person who signed"
                        value={signedBy[r.id] || ''}
                        onChange={(e) => setSignedBy((c) => ({ ...c, [r.id]: e.target.value }))}
                        data-testid={`ir-signed-by-${r.irNumber}`}
                      />
                      <SignatureCanvas
                        label="Inspector / Witness Signature"
                        value={signatures[r.id] ?? null}
                        onChange={(dataUrl) => setSignatures((c) => ({ ...c, [r.id]: dataUrl }))}
                        height={100}
                      />
                    </div>
                  ) : (
                    <a href={`/quality/irs/${r.id}/print`} data-testid={`ir-print-${r.irNumber}`} style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
                      Inspection request →
                    </a>
                  )}
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
