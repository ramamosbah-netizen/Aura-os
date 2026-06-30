'use client';

import { type CSSProperties, useState } from 'react';

interface MaterialApproval {
  id: string;
  projectId: string;
  reference: string;
  materialName: string;
  manufacturer: string;
  supplier: string;
  discipline: string;
  status: string;
  revision: number;
  reviewComments: string;
}

const STATUS_COLOR: Record<string, string> = {
  draft: 'var(--muted)',
  submitted: 'var(--accent)',
  approved: 'var(--good)',
  approved_as_noted: 'var(--warn, #d9883b)',
  rejected: 'var(--bad)',
};

export default function MarClient({ initialMars }: { initialMars: MaterialApproval[] }) {
  const [mars, setMars] = useState<MaterialApproval[]>(initialMars);
  const [err, setErr] = useState('');

  const [projectId, setProjectId] = useState('');
  const [reference, setReference] = useState('');
  const [materialName, setMaterialName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [supplier, setSupplier] = useState('');
  const [discipline, setDiscipline] = useState('');

  async function refresh(): Promise<void> {
    const res = await fetch('/api/quality/material-approvals');
    if (res.ok) setMars(await res.json());
  }

  async function create(): Promise<void> {
    if (!projectId.trim() || !reference.trim() || !materialName.trim()) {
      setErr('Project ID, reference and material are required');
      return;
    }
    setErr('');
    const res = await fetch('/api/quality/material-approvals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, reference, materialName, manufacturer: manufacturer || undefined, supplier: supplier || undefined, discipline: discipline || undefined }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d.message ?? d.error ?? 'Failed to create MAR');
      return;
    }
    setReference(''); setMaterialName(''); setManufacturer(''); setSupplier(''); setDiscipline('');
    await refresh();
  }

  async function act(id: string, action: 'submit' | 'review' | 'revise', body?: unknown): Promise<void> {
    setErr('');
    const res = await fetch(`/api/quality/material-approvals/${id}/${action}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d.message ?? d.error ?? `${action} failed`);
      return;
    }
    await refresh();
  }

  function review(id: string, decision: 'approved' | 'approved_as_noted' | 'rejected'): void {
    let comments: string | undefined;
    if (decision !== 'approved') {
      comments = window.prompt(`Comments for "${decision.replace('_', ' ')}"`) ?? '';
      if (!comments.trim()) { setErr('Comments are required for this decision'); return; }
    }
    void act(id, 'review', { decision, comments });
  }

  return (
    <div>
      <div style={s.createBar}>
        <input style={s.inputSm} placeholder="Project ID" value={projectId} onChange={(e) => setProjectId(e.target.value)} />
        <input style={s.inputSm} placeholder="Ref (MAR-001)" value={reference} onChange={(e) => setReference(e.target.value)} />
        <input style={s.input} placeholder="Material" value={materialName} onChange={(e) => setMaterialName(e.target.value)} />
        <input style={s.inputSm} placeholder="Manufacturer" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
        <input style={s.inputSm} placeholder="Supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        <input style={s.inputXs} placeholder="Disc." value={discipline} onChange={(e) => setDiscipline(e.target.value)} />
        <button type="button" style={s.primary} onClick={create}>Add MAR</button>
      </div>
      {err && <p style={s.err}>{err}</p>}

      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Ref</th>
            <th style={s.th}>Material</th>
            <th style={s.th}>Manufacturer</th>
            <th style={s.th}>Status</th>
            <th style={s.thR}>Rev</th>
            <th style={s.thR}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {mars.length === 0 ? (
            <tr><td style={s.muted} colSpan={6}>No material approvals yet — add one above.</td></tr>
          ) : (
            mars.map((m) => (
              <tr key={m.id} style={s.row}>
                <td style={s.tdCode}>{m.reference}</td>
                <td style={s.td}>{m.materialName}{m.reviewComments && <div style={s.note}>“{m.reviewComments}”</div>}</td>
                <td style={s.tdMuted}>{m.manufacturer || '—'}</td>
                <td style={s.td}><span style={{ ...s.tag, color: STATUS_COLOR[m.status] ?? 'var(--text)', borderColor: STATUS_COLOR[m.status] ?? 'var(--border)' }}>{m.status.replace(/_/g, ' ')}</span></td>
                <td style={s.tdR}>{m.revision}</td>
                <td style={s.tdR}>
                  {m.status === 'draft' && <button type="button" style={s.btn} onClick={() => act(m.id, 'submit')}>Submit</button>}
                  {m.status === 'submitted' && (
                    <>
                      <button type="button" style={s.okBtn} onClick={() => review(m.id, 'approved')}>Approve</button>
                      <button type="button" style={s.btn} onClick={() => review(m.id, 'approved_as_noted')}>As noted</button>
                      <button type="button" style={s.badBtn} onClick={() => review(m.id, 'rejected')}>Reject</button>
                    </>
                  )}
                  {(m.status === 'rejected' || m.status === 'approved_as_noted') && <button type="button" style={s.btn} onClick={() => act(m.id, 'revise')}>Revise</button>}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

const s = {
  createBar: { display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' } as CSSProperties,
  input: { flex: 1, minWidth: 140, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text)', padding: '9px 11px', fontSize: 13.5 } as CSSProperties,
  inputSm: { width: 130, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text)', padding: '9px 11px', fontSize: 13.5 } as CSSProperties,
  inputXs: { width: 70, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text)', padding: '9px 11px', fontSize: 13.5 } as CSSProperties,
  primary: { background: 'var(--accent)', border: 'none', borderRadius: 9, color: '#fff', padding: '9px 14px', fontSize: 13.5, cursor: 'pointer', fontWeight: 600 } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 13, margin: '4px 2px' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 12 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5 } as CSSProperties,
  thR: { textAlign: 'right', color: 'var(--muted)', fontWeight: 500, padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5 } as CSSProperties,
  row: { borderBottom: '1px solid var(--border)' } as CSSProperties,
  td: { padding: '10px' } as CSSProperties,
  tdCode: { padding: '10px', fontFamily: 'ui-monospace, monospace', fontSize: 13 } as CSSProperties,
  tdMuted: { padding: '10px', color: 'var(--muted)' } as CSSProperties,
  tdR: { padding: '10px', textAlign: 'right' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '12px 10px', fontSize: 13.5 } as CSSProperties,
  note: { color: 'var(--muted)', fontSize: 11.5, fontStyle: 'italic', marginTop: 2 } as CSSProperties,
  tag: { fontSize: 11, border: '1px solid var(--border)', borderRadius: 999, padding: '1px 8px', textTransform: 'capitalize' } as CSSProperties,
  btn: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '5px 10px', fontSize: 12.5, cursor: 'pointer', marginLeft: 6 } as CSSProperties,
  okBtn: { background: 'var(--good)', border: 'none', borderRadius: 8, color: '#04210f', padding: '5px 10px', fontSize: 12.5, cursor: 'pointer', marginLeft: 6, fontWeight: 600 } as CSSProperties,
  badBtn: { background: 'var(--panel)', border: '1px solid var(--bad)', borderRadius: 8, color: 'var(--bad)', padding: '5px 10px', fontSize: 12.5, cursor: 'pointer', marginLeft: 6 } as CSSProperties,
};
