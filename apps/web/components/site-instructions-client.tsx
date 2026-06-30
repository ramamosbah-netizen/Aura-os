'use client';

import { type CSSProperties, useMemo, useState } from 'react';

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

const statusColor: Record<string, string> = { open: '#d97706', acknowledged: '#2563eb', closed: '#16a34a' };
const today = () => new Date().toISOString().slice(0, 10);

export default function SiteInstructionsClient({ initialInstructions }: { initialInstructions: SiteInstruction[] }) {
  const [items, setItems] = useState(initialInstructions);
  const [projectId, setProjectId] = useState('');
  const [reference, setReference] = useState('');
  const [issuedBy, setIssuedBy] = useState('');
  const [date, setDate] = useState(today());
  const [instruction, setInstruction] = useState('');
  const [costImplication, setCost] = useState(false);
  const [timeImplication, setTime] = useState(false);
  const [error, setError] = useState('');

  const counts = useMemo(() => ({
    open: items.filter((i) => i.status === 'open').length,
    withImplication: items.filter((i) => (i.costImplication || i.timeImplication) && i.status !== 'closed').length,
  }), [items]);

  const create = async () => {
    setError('');
    if (!projectId.trim() || !reference.trim() || !issuedBy.trim() || !instruction.trim()) return setError('Project, reference, issued-by and instruction are required');
    try {
      const res = await fetch('/api/site/instructions', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, reference, issuedBy, date, instruction, costImplication, timeImplication }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setItems((p) => [data, ...p]);
      setReference(''); setInstruction(''); setCost(false); setTime(false);
    } catch (e) { setError((e as Error).message); }
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
        <div style={st.card}><div style={st.cardLabel}>Open</div><div style={{ ...st.cardVal, color: '#d97706' }}>{counts.open}</div></div>
        <div style={st.card}><div style={st.cardLabel}>Open w/ cost or time impact</div><div style={st.cardVal}>{counts.withImplication}</div></div>
      </div>

      <div style={st.form}>
        <label style={st.label}>Project ID<input style={st.input} value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="uuid" /></label>
        <label style={st.label}>Reference<input style={st.input} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="SI-001" /></label>
        <label style={st.label}>Issued by<input style={st.input} value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} placeholder="Consultant" /></label>
        <label style={st.label}>Date<input style={st.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label style={{ ...st.label, minWidth: 280 }}>Instruction<input style={st.input} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Relocate the FACP to level 2 lobby" /></label>
        <label style={st.check}><input type="checkbox" checked={costImplication} onChange={(e) => setCost(e.target.checked)} /> Cost impact</label>
        <label style={st.check}><input type="checkbox" checked={timeImplication} onChange={(e) => setTime(e.target.checked)} /> Time impact</label>
        <button style={st.btn} onClick={create}>Issue SI</button>
        {error && <p style={st.err}>{error}</p>}
      </div>

      <h2 style={st.h2}>Instructions</h2>
      {items.length === 0 ? (
        <p style={st.muted}>No site instructions recorded.</p>
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
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  check: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 130 } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  sm: { padding: '4px 10px', borderRadius: 4, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', marginRight: 4 } as CSSProperties,
  smGreen: { padding: '4px 10px', borderRadius: 4, background: '#16a34a', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  err: { color: '#dc2626', margin: '6px 0 0', fontSize: 13, width: '100%' } as CSSProperties,
  h2: { fontSize: 20, margin: '18px 0 10px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
};
