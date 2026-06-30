'use client';

import { type CSSProperties, useState } from 'react';

interface Contract { id: string; contractNumber: string; clientName: string }
interface PpmSchedule {
  id: string;
  contractId: string;
  taskDescription: string;
  frequency: string;
  nextDueDate: string;
  active: boolean;
  visitsGenerated: number;
}

const FREQUENCIES = ['monthly', 'quarterly', 'semi_annual', 'annual'];
const fmt = (iso: string) => (iso ? new Date(iso).toISOString().slice(0, 10) : '—');

export default function PpmClient({ initialSchedules, contracts }: { initialSchedules: PpmSchedule[]; contracts: Contract[] }) {
  const [schedules, setSchedules] = useState(initialSchedules);
  const [contractId, setContractId] = useState('');
  const [taskDescription, setTask] = useState('');
  const [frequency, setFrequency] = useState('quarterly');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const contractLabel = (id: string) => {
    const c = contracts.find((x) => x.id === id);
    return c ? `${c.contractNumber} — ${c.clientName}` : id;
  };

  const create = async () => {
    setError('');
    if (!contractId) return setError('Select a contract');
    if (!taskDescription.trim()) return setError('Task description is required');
    try {
      const res = await fetch('/api/amc/ppm-schedules', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contractId, taskDescription, frequency, startDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setSchedules((p) => [data, ...p]);
      setTask('');
    } catch (e) { setError((e as Error).message); }
  };

  const generateDue = async () => {
    setError(''); setNote('');
    try {
      const res = await fetch('/api/amc/ppm-schedules/generate-due', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setNote(`Generated ${Array.isArray(data) ? data.length : 0} preventive work order(s).`);
      // refresh schedules (nextDueDate advanced)
      const refreshed = await fetch('/api/amc/ppm-schedules').then((r) => r.json());
      if (Array.isArray(refreshed)) setSchedules(refreshed);
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <>
      <div style={st.form}>
        <label style={st.label}>Contract
          <select style={st.input} value={contractId} onChange={(e) => setContractId(e.target.value)}>
            <option value="">— select —</option>
            {contracts.map((c) => <option key={c.id} value={c.id}>{contractLabel(c.id)}</option>)}
          </select>
        </label>
        <label style={{ ...st.label, minWidth: 240 }}>Task<input style={st.input} value={taskDescription} onChange={(e) => setTask(e.target.value)} placeholder="Quarterly chiller service" /></label>
        <label style={st.label}>Frequency
          <select style={st.input} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            {FREQUENCIES.map((f) => <option key={f} value={f}>{f.replace('_', '-')}</option>)}
          </select>
        </label>
        <label style={st.label}>Start date<input style={st.input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <button style={st.btn} onClick={create}>Add schedule</button>
        <button style={st.btnAlt} onClick={generateDue}>Generate due visits</button>
      </div>
      {error && <p style={st.err}>{error}</p>}
      {note && <p style={st.note}>{note}</p>}

      <h2 style={st.h2}>Schedules</h2>
      {schedules.length === 0 ? (
        <p style={st.muted}>No PPM schedules yet.</p>
      ) : (
        <table style={st.table}>
          <thead><tr><th style={st.th}>Contract</th><th style={st.th}>Task</th><th style={st.th}>Frequency</th><th style={st.th}>Next due</th><th style={st.th}>Visits</th><th style={st.th}>Active</th></tr></thead>
          <tbody>
            {schedules.map((s) => (
              <tr key={s.id}>
                <td style={st.td}>{contractLabel(s.contractId)}</td>
                <td style={st.td}>{s.taskDescription}</td>
                <td style={st.td}>{s.frequency.replace('_', '-')}</td>
                <td style={st.td}>{fmt(s.nextDueDate)}</td>
                <td style={st.td}>{s.visitsGenerated}</td>
                <td style={{ ...st.td, color: s.active ? '#16a34a' : '#6b7280', fontWeight: 600 }}>{s.active ? 'yes' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

const st = {
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 12 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 130 } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  btnAlt: { padding: '8px 18px', borderRadius: 6, background: '#16a34a', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  err: { color: '#dc2626', margin: '6px 0 0', fontSize: 13 } as CSSProperties,
  note: { color: '#16a34a', margin: '6px 0 0', fontSize: 13 } as CSSProperties,
  h2: { fontSize: 20, margin: '18px 0 10px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
};
