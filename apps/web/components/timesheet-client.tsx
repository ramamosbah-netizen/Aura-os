'use client';

import { type CSSProperties, useState } from 'react';

interface TimesheetEntry {
  id: string;
  employeeId: string;
  projectId: string | null;
  date: string;
  hours: number;
  overtime: number;
  description: string;
  status: string;
  createdAt: string;
}

function fmtDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const statusColor: Record<string, string> = { draft: '#6b7280', submitted: '#2563eb', approved: '#16a34a', rejected: '#dc2626' };

export default function TimesheetClient({ initialEntries }: { initialEntries: TimesheetEntry[] }) {
  const [entries, setEntries] = useState(initialEntries);
  const [empId, setEmpId] = useState('');
  const [date, setDate] = useState('');
  const [hours, setHours] = useState('8');
  const [ot, setOt] = useState('0');
  const [desc, setDesc] = useState('');
  const [projId, setProjId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!empId || !date) return setError('Employee ID and date are required');
    setBusy(true);
    try {
      const res = await fetch('/api/hr/timesheets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          employeeId: empId,
          date,
          hours: Number(hours),
          overtime: Number(ot) || 0,
          description: desc || undefined,
          projectId: projId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setEntries((prev) => [data, ...prev]);
      setDesc('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const action = async (id: string, act: 'submit' | 'approve') => {
    try {
      const res = await fetch(`/api/hr/timesheets/${id}/${act}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      setEntries((prev) => prev.map((e) => (e.id === id ? data : e)));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <div style={st.form}>
        <label style={st.label}>Employee ID<input style={st.input} value={empId} onChange={(e) => setEmpId(e.target.value)} placeholder="uuid" /></label>
        <label style={st.label}>Date<input style={st.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label style={st.label}>Hours<input style={st.input} type="number" min="0" max="24" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} /></label>
        <label style={st.label}>OT<input style={st.input} type="number" min="0" max="24" step="0.5" value={ot} onChange={(e) => setOt(e.target.value)} /></label>
        <label style={st.label}>Project ID<input style={st.input} value={projId} onChange={(e) => setProjId(e.target.value)} placeholder="optional" /></label>
        <label style={st.label}>Description<input style={st.input} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="cable pulling B2" /></label>
        <button style={st.btn} disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Log Hours'}</button>
        {error && <p style={st.err}>{error}</p>}
      </div>

      <h2 style={st.h2}>Entries</h2>
      {entries.length === 0 ? (
        <p style={st.muted}>No timesheet entries yet.</p>
      ) : (
        <table style={st.table}>
          <thead>
            <tr>
              <th style={st.th}>Date</th>
              <th style={st.th}>Employee</th>
              <th style={st.th}>Hours</th>
              <th style={st.th}>OT</th>
              <th style={st.th}>Description</th>
              <th style={st.th}>Status</th>
              <th style={st.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td style={st.td}>{fmtDate(e.date)}</td>
                <td style={st.td}>{e.employeeId.slice(0, 8)}…</td>
                <td style={st.td}>{e.hours}</td>
                <td style={st.td}>{e.overtime}</td>
                <td style={st.td}>{e.description || '—'}</td>
                <td style={{ ...st.td, color: statusColor[e.status] || '#000', fontWeight: 600 }}>{e.status}</td>
                <td style={st.td}>
                  {e.status === 'draft' && <button style={st.sm} onClick={() => action(e.id, 'submit')}>Submit</button>}
                  {e.status === 'submitted' && <button style={st.sm} onClick={() => action(e.id, 'approve')}>Approve</button>}
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
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 28 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 120 } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  sm: { padding: '4px 10px', borderRadius: 4, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  err: { color: '#dc2626', margin: '6px 0 0', fontSize: 13, width: '100%' } as CSSProperties,
  h2: { fontSize: 20, margin: '0 0 10px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
};
