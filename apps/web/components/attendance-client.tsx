'use client';

import { type CSSProperties, useState } from 'react';

interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string;
  workedHours: number;
  notes: string;
}

const STATUSES = ['present', 'absent', 'late', 'half_day', 'leave', 'holiday'] as const;

const STATUS_COLOR: Record<string, string> = {
  present: 'var(--good)',
  late: 'var(--warn, #d9883b)',
  half_day: 'var(--warn, #d9883b)',
  absent: 'var(--bad)',
  leave: 'var(--muted)',
  holiday: 'var(--muted)',
};

export default function AttendanceClient({ initialRecords }: { initialRecords: AttendanceRecord[] }) {
  const [records, setRecords] = useState<AttendanceRecord[]>(initialRecords);
  const [err, setErr] = useState('');

  const [employeeName, setEmployeeName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [date, setDate] = useState('');
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('present');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');

  const totalHours = Math.round(records.reduce((s, r) => s + r.workedHours, 0) * 100) / 100;
  const presentCount = records.filter((r) => r.status === 'present' || r.status === 'late' || r.status === 'half_day').length;

  async function refresh(): Promise<void> {
    const res = await fetch('/api/hr/attendance');
    if (res.ok) setRecords(await res.json());
  }

  async function record(): Promise<void> {
    if (!employeeId.trim() || !date.trim()) {
      setErr('Employee ID and date are required');
      return;
    }
    setErr('');
    const res = await fetch('/api/hr/attendance', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        employeeId,
        employeeName: employeeName || undefined,
        date,
        status,
        checkIn: checkIn || undefined,
        checkOut: checkOut || undefined,
      }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d.message ?? d.error ?? 'Failed to record attendance');
      return;
    }
    setEmployeeName('');
    setEmployeeId('');
    setDate('');
    setCheckIn('');
    setCheckOut('');
    setStatus('present');
    await refresh();
  }

  async function checkout(id: string): Promise<void> {
    const time = window.prompt('Check-out time (HH:MM)');
    if (!time) return;
    setErr('');
    const res = await fetch(`/api/hr/attendance/${id}/checkout`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ checkOut: time }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d.message ?? d.error ?? 'Check-out failed');
      return;
    }
    await refresh();
  }

  return (
    <div>
      <div style={s.createBar}>
        <input style={s.input} placeholder="Employee name" value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} />
        <input style={s.input} placeholder="Employee ID (uuid)" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} />
        <input style={s.inputSm} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <select style={s.inputSm} value={status} onChange={(e) => setStatus(e.target.value as (typeof STATUSES)[number])}>
          {STATUSES.map((st2) => <option key={st2} value={st2}>{st2.replace('_', '-')}</option>)}
        </select>
        <input style={s.inputXs} placeholder="In" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        <input style={s.inputXs} placeholder="Out" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
        <button type="button" style={s.primary} onClick={record}>Record</button>
      </div>
      {err && <p style={s.err}>{err}</p>}

      <div style={s.statBar}>
        <span style={s.stat}><b>{records.length}</b> records</span>
        <span style={s.stat}><b>{presentCount}</b> present/late</span>
        <span style={s.stat}><b>{totalHours}</b> total hours</span>
      </div>

      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Date</th>
            <th style={s.th}>Employee</th>
            <th style={s.th}>Status</th>
            <th style={s.thR}>In</th>
            <th style={s.thR}>Out</th>
            <th style={s.thR}>Hours</th>
            <th style={s.thR}></th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 ? (
            <tr><td style={s.muted} colSpan={7}>No attendance yet — record one above.</td></tr>
          ) : (
            records.map((r) => (
              <tr key={r.id} style={s.row}>
                <td style={s.td}>{r.date}</td>
                <td style={s.td}>{r.employeeName}</td>
                <td style={s.td}><span style={{ ...s.tag, color: STATUS_COLOR[r.status] ?? 'var(--text)', borderColor: STATUS_COLOR[r.status] ?? 'var(--border)' }}>{r.status.replace('_', '-')}</span></td>
                <td style={s.tdR}>{r.checkIn ?? '—'}</td>
                <td style={s.tdR}>{r.checkOut ?? '—'}</td>
                <td style={s.tdR}>{r.workedHours}</td>
                <td style={s.tdR}>{r.checkIn && !r.checkOut && <button type="button" style={s.outBtn} onClick={() => checkout(r.id)}>Check out</button>}</td>
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
  input: { flex: 1, minWidth: 130, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text)', padding: '9px 11px', fontSize: 13.5 } as CSSProperties,
  inputSm: { width: 130, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text)', padding: '9px 11px', fontSize: 13.5 } as CSSProperties,
  inputXs: { width: 70, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text)', padding: '9px 11px', fontSize: 13.5 } as CSSProperties,
  primary: { background: 'var(--accent)', border: 'none', borderRadius: 9, color: '#fff', padding: '9px 14px', fontSize: 13.5, cursor: 'pointer', fontWeight: 600 } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 13, margin: '4px 2px' } as CSSProperties,
  statBar: { display: 'flex', gap: 18, padding: '10px 14px', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, marginTop: 4, fontSize: 13.5 } as CSSProperties,
  stat: { color: 'var(--muted)' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 12 } as CSSProperties,
  th: { textAlign: 'left', color: 'var(--muted)', fontWeight: 500, padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5 } as CSSProperties,
  thR: { textAlign: 'right', color: 'var(--muted)', fontWeight: 500, padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: 12.5 } as CSSProperties,
  row: { borderBottom: '1px solid var(--border)' } as CSSProperties,
  td: { padding: '10px' } as CSSProperties,
  tdR: { padding: '10px', textAlign: 'right' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '12px 10px', fontSize: 13.5 } as CSSProperties,
  tag: { fontSize: 11, border: '1px solid var(--border)', borderRadius: 999, padding: '1px 8px' } as CSSProperties,
  outBtn: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '5px 10px', fontSize: 12.5, cursor: 'pointer' } as CSSProperties,
};
