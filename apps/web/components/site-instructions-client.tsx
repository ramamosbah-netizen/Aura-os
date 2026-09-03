'use client';

import ProjectPicker from './ui/project-picker';

import { type CSSProperties, useMemo, useState } from 'react';
import EmptyState from './ui/empty-state';
import type { PickerProject } from './ui/project-picker';

interface SiteInstruction {
  id: string;
  projectId: string;
  projectName: string | null;
  reference: string;
  issuedBy: string;
  date: string;
  instruction: string;
  costImplication: boolean;
  timeImplication: boolean;
  status: string;
}

const statusColor: Record<string, string> = { open: 'var(--warn)', acknowledged: 'var(--accent)', closed: 'var(--good)' };
const today = () => new Date().toISOString().slice(0, 10);

export default function SiteInstructionsClient({ initialInstructions, initialProjectId = '', projects, projectsUnavailable = false }: { initialInstructions: SiteInstruction[]; initialProjectId?: string; projects?: PickerProject[]; projectsUnavailable?: boolean }) {
  const [items, setItems] = useState(initialInstructions);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [reference, setReference] = useState('');
  const [issuedBy, setIssuedBy] = useState('');
  const [date, setDate] = useState(today());
  const [instruction, setInstruction] = useState('');
  const [costImplication, setCost] = useState(false);
  const [timeImplication, setTime] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const projectSelected = projectId.trim().length > 0;

  const counts = useMemo(() => ({
    open: items.filter((i) => i.status === 'open').length,
    withImplication: items.filter((i) => (i.costImplication || i.timeImplication) && i.status !== 'closed').length,
  }), [items]);

  const create = async () => {
    setError('');
    if (!projectSelected) return setError('Select a project before issuing a site instruction.');
    if (!reference.trim() || !issuedBy.trim() || !instruction.trim()) return setError('Reference, issued-by and instruction are required');
    setCreating(true);
    try {
      const res = await fetch('/api/site/instructions', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, reference, issuedBy, date, instruction, costImplication, timeImplication }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setItems((p) => [data, ...p]);
      setReference(''); setInstruction(''); setCost(false); setTime(false);
    } catch (e) { setError((e as Error).message); } finally { setCreating(false); }
  };

  const act = async (id: string, action: 'acknowledge' | 'close') => {
    setError('');
    try {
      const res = await fetch(`/api/site/instructions/${id}/${action}`, { method: 'PUT' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setItems((p) => p.map((i) => (i.id === id ? data : i)));
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <>
      <div style={st.cards}>
        <div style={st.card}><div style={st.cardLabel}>Open</div><div style={{ ...st.cardVal, color: 'var(--warn)' }}>{counts.open}</div></div>
        <div style={st.card}><div style={st.cardLabel}>Open w/ cost or time impact</div><div style={st.cardVal}>{counts.withImplication}</div></div>
      </div>

      <form style={st.form} onSubmit={(event) => { event.preventDefault(); void create(); }}>
        <div style={st.formHeader}><div><div style={st.formEyebrow}>Controlled site record</div><strong>Issue a new instruction</strong><span style={st.formHint}>Every instruction must be anchored to a project.</span></div><span style={projectSelected ? st.readyBadge : st.lockedBadge}>{projectSelected ? 'Project selected' : 'Project required'}</span></div>
        <label style={st.label}>Project <span style={st.required} aria-hidden="true">*</span><ProjectPicker value={projectId} onChange={setProjectId} projects={projects} disabled={creating || projectsUnavailable} /></label>
        {!projectSelected && <div role="status" style={st.projectGate}>Select a project first to unlock the instruction fields and Issue SI action.</div>}
        {projectsUnavailable && <div role="alert" style={st.err}>Project list is unavailable. The instruction form is locked until projects can be loaded.</div>}
        <label style={{ ...st.label, opacity: projectSelected ? 1 : 0.55 }}>Reference<input required style={st.input} disabled={!projectSelected || creating} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="SI-001" /></label>
        <label style={{ ...st.label, opacity: projectSelected ? 1 : 0.55 }}>Issued by<input required style={st.input} disabled={!projectSelected || creating} value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} placeholder="Consultant" /></label>
        <label style={{ ...st.label, opacity: projectSelected ? 1 : 0.55 }}>Date<input required style={st.input} disabled={!projectSelected || creating} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label style={{ ...st.label, minWidth: 280, flex: '1 1 280px', opacity: projectSelected ? 1 : 0.55 }}>Instruction<input required style={st.input} disabled={!projectSelected || creating} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Relocate the FACP to level 2 lobby" /></label>
        <label style={{ ...st.check, opacity: projectSelected ? 1 : 0.55 }}><input type="checkbox" disabled={!projectSelected || creating} checked={costImplication} onChange={(e) => setCost(e.target.checked)} /> Cost impact</label>
        <label style={{ ...st.check, opacity: projectSelected ? 1 : 0.55 }}><input type="checkbox" disabled={!projectSelected || creating} checked={timeImplication} onChange={(e) => setTime(e.target.checked)} /> Time impact</label>
        <button type="submit" style={{ ...st.btn, opacity: projectSelected && !creating ? 1 : 0.5, cursor: projectSelected && !creating ? 'pointer' : 'not-allowed' }} disabled={!projectSelected || creating}>{creating ? 'Issuing…' : 'Issue SI'}</button>
        {error && <p role="alert" style={st.err}>{error}</p>}
      </form>

      <h2 style={st.h2}>Instructions</h2>
      {items.length === 0 ? (
        <EmptyState
          compact
          title="No site instructions recorded"
          description="Issue a formal site instruction (SI) with cost and time-impact flags to the contractor."
        />
      ) : (
        <table style={st.table}>
          <thead><tr><th style={st.th}>Date</th><th style={st.th}>Ref</th><th style={st.th}>Issued by</th><th style={st.th}>Instruction</th><th style={st.th}>Impact</th><th style={st.th}>Status</th><th style={st.th}>Actions</th></tr></thead>
          <tbody>
            {items.map((si) => (
              <tr key={si.id}>
                <td style={st.td}>{si.date}</td>
                <td style={st.td}>{si.reference}</td>
                <td style={st.td}>{si.issuedBy}</td>
                <td style={st.td}>{si.instruction}</td>
                <td style={st.td}>{[si.costImplication && 'cost', si.timeImplication && 'time'].filter(Boolean).join(' + ') || '—'}</td>
                <td style={{ ...st.td, color: statusColor[si.status] || '#000', fontWeight: 600 }}>{si.status}</td>
                <td style={st.td}>
                  {si.status === 'open' && <button style={st.sm} onClick={() => act(si.id, 'acknowledge')}>Acknowledge</button>}
                  {si.status !== 'closed' && <button style={st.smGreen} onClick={() => act(si.id, 'close')}>Close</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

const st = {
  cards: { display: 'flex', gap: 14, marginBottom: 22 } as CSSProperties,
  card: { padding: '12px 18px', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)', minWidth: 170 } as CSSProperties,
  cardLabel: { fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5 } as CSSProperties,
  cardVal: { fontSize: 22, fontWeight: 700, marginTop: 4 } as CSSProperties,
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 22 } as CSSProperties,
  formHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, width: '100%', padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border, #e5e7eb)', background: 'color-mix(in srgb, var(--panel, #fff) 92%, var(--accent, #2563eb))' } as CSSProperties,
  formEyebrow: { color: 'var(--accent)', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 4 } as CSSProperties,
  formHint: { display: 'block', color: 'var(--muted)', fontSize: 12, fontWeight: 400, marginTop: 3 } as CSSProperties,
  readyBadge: { color: 'var(--good)', border: '1px solid color-mix(in srgb, var(--good) 40%, transparent)', background: 'color-mix(in srgb, var(--good) 12%, transparent)', borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' as const } as CSSProperties,
  lockedBadge: { color: 'var(--warn)', border: '1px solid color-mix(in srgb, var(--warn) 40%, transparent)', background: 'color-mix(in srgb, var(--warn) 12%, transparent)', borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' as const } as CSSProperties,
  projectGate: { width: '100%', padding: '10px 12px', borderRadius: 8, color: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 9%, transparent)', border: '1px solid color-mix(in srgb, var(--warn) 25%, transparent)', fontSize: 13 } as CSSProperties,
  required: { color: 'var(--bad, #dc2626)', marginLeft: 3 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 130 } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  sm: { padding: '4px 10px', borderRadius: 4, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', marginRight: 4 } as CSSProperties,
  smGreen: { padding: '4px 10px', borderRadius: 4, background: 'var(--good)', color: 'var(--accent-ink)', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  err: { color: 'var(--bad)', margin: '6px 0 0', fontSize: 13, width: '100%' } as CSSProperties,
  h2: { fontSize: 20, margin: '18px 0 10px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
};
