'use client';

import { type CSSProperties, useState } from 'react';

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  joinedDate: string;
}

interface EosbResult {
  eligible: boolean;
  yearsOfService: number;
  dailyWage: number;
  grossDays: number;
  grossAmount: number;
  reductionFactor: number;
  cappedAmount: number;
  amount: number;
  notes: string[];
}

function money(n: number): string {
  return new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED', maximumFractionDigits: 0 }).format(n);
}

export default function EosbClient({ employees }: { employees: Employee[] }) {
  const [joinedDate, setJoinedDate] = useState('');
  const [lastWorkingDay, setLastWorkingDay] = useState('');
  const [basicSalary, setBasicSalary] = useState('');
  const [terminationType, setTerminationType] = useState<'termination' | 'resignation'>('termination');
  const [result, setResult] = useState<EosbResult | null>(null);
  const [err, setErr] = useState('');

  function pickEmployee(id: string): void {
    const e = employees.find((x) => x.id === id);
    if (e) setJoinedDate(e.joinedDate);
  }

  async function calc(): Promise<void> {
    setErr('');
    setResult(null);
    if (!(Number(basicSalary) > 0) || !joinedDate || !lastWorkingDay) {
      setErr('Basic salary, joined date and last working day are required.');
      return;
    }
    const res = await fetch('/api/hr/eosb', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ basicSalary: Number(basicSalary), joinedDate, lastWorkingDay, terminationType }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.message ?? data.error ?? 'Calculation failed');
      return;
    }
    setResult(data);
  }

  return (
    <div>
      <div style={s.form}>
        {employees.length > 0 && (
          <label style={s.field}>
            <span style={s.label}>Employee (optional — fills joined date)</span>
            <select style={s.input} defaultValue="" onChange={(e) => pickEmployee(e.target.value)}>
              <option value="">— select —</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
              ))}
            </select>
          </label>
        )}
        <div style={s.row}>
          <label style={s.field}>
            <span style={s.label}>Joined date</span>
            <input style={s.input} type="date" value={joinedDate} onChange={(e) => setJoinedDate(e.target.value)} />
          </label>
          <label style={s.field}>
            <span style={s.label}>Last working day</span>
            <input style={s.input} type="date" value={lastWorkingDay} onChange={(e) => setLastWorkingDay(e.target.value)} />
          </label>
        </div>
        <div style={s.row}>
          <label style={s.field}>
            <span style={s.label}>Basic monthly salary (AED)</span>
            <input style={s.input} type="number" value={basicSalary} onChange={(e) => setBasicSalary(e.target.value)} placeholder="e.g. 12000" />
          </label>
          <label style={s.field}>
            <span style={s.label}>Separation</span>
            <select style={s.input} value={terminationType} onChange={(e) => setTerminationType(e.target.value as 'termination' | 'resignation')}>
              <option value="termination">Termination</option>
              <option value="resignation">Resignation</option>
            </select>
          </label>
        </div>
        <button type="button" style={s.primary} onClick={calc}>Calculate gratuity</button>
      </div>
      {err && <p style={s.err}>{err}</p>}

      {result && (
        <div style={s.result}>
          {!result.eligible ? (
            <p style={s.muted}>Not eligible — under 1 year of service.</p>
          ) : (
            <>
              <div style={s.amount}>{money(result.amount)}</div>
              <div style={s.grid}>
                <Stat label="Years of service" value={String(result.yearsOfService)} />
                <Stat label="Daily wage" value={money(result.dailyWage)} />
                <Stat label="Gratuity days" value={String(result.grossDays)} />
                <Stat label="Gross amount" value={money(result.grossAmount)} />
                {result.reductionFactor < 1 && <Stat label="Resignation factor" value={`×${result.reductionFactor.toFixed(2)}`} />}
              </div>
              <ul style={s.notes}>
                {result.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.stat}>
      <span style={s.statLabel}>{label}</span>
      <span style={s.statValue}>{value}</span>
    </div>
  );
}

const s = {
  form: { display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 } as CSSProperties,
  row: { display: 'flex', gap: 12, flexWrap: 'wrap' } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 200 } as CSSProperties,
  label: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  input: { background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text)', padding: '9px 11px', fontSize: 14 } as CSSProperties,
  primary: { background: 'var(--accent)', border: 'none', borderRadius: 10, color: '#fff', padding: '11px 16px', fontSize: 14.5, cursor: 'pointer', fontWeight: 600, alignSelf: 'flex-start' } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 13.5, margin: '10px 2px' } as CSSProperties,
  result: { marginTop: 18, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: 20 } as CSSProperties,
  amount: { fontSize: 34, fontWeight: 700, color: 'var(--good)', letterSpacing: -1 } as CSSProperties,
  grid: { display: 'flex', flexWrap: 'wrap', gap: 22, marginTop: 16 } as CSSProperties,
  stat: { display: 'flex', flexDirection: 'column', gap: 3 } as CSSProperties,
  statLabel: { fontSize: 11.5, color: 'var(--muted)' } as CSSProperties,
  statValue: { fontSize: 16, fontWeight: 600 } as CSSProperties,
  notes: { margin: '18px 0 0', padding: '14px 0 0', borderTop: '1px solid var(--border)', color: 'var(--muted)', fontSize: 13, lineHeight: 1.7 } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 14, margin: 0 } as CSSProperties,
};
