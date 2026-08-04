'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import EmptyState from './ui/empty-state';
import ExportButton from './export-button';

export interface Calibration {
  id: string;
  equipmentName: string;
  equipmentSerial: string;
  instrumentType: string | null;
  calibrationDate: string;
  dueDate: string;
  certificateNumber: string | null;
  calibratedBy: string | null;
  status: 'valid' | 'due_soon' | 'expired';
  notes: string | null;
  createdAt: string;
}

const statusColor: Record<string, string> = { valid: '#16a34a', due_soon: '#d97706', expired: '#dc2626' };
const statusLabel: Record<string, string> = { valid: 'valid', due_soon: 'due soon', expired: 'expired' };
const today = () => new Date().toISOString().slice(0, 10);

export default function CalibrationClient({ initial }: { initial: Calibration[] }) {
  const [rows, setRows] = useState(initial);
  const [f, setF] = useState({ equipmentName: '', equipmentSerial: '', instrumentType: '', calibrationDate: today(), dueDate: '', certificateNumber: '', calibratedBy: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const kpi = useMemo(() => ({
    valid: rows.filter((r) => r.status === 'valid').length,
    dueSoon: rows.filter((r) => r.status === 'due_soon').length,
    expired: rows.filter((r) => r.status === 'expired').length,
  }), [rows]);

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const record = async () => {
    setError('');
    if (!f.equipmentName.trim() || !f.equipmentSerial.trim() || !f.dueDate.trim()) return setError('Equipment name, serial and due date are required');
    setBusy(true);
    try {
      const res = await fetch('/api/quality/calibrations', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          equipmentName: f.equipmentName, equipmentSerial: f.equipmentSerial,
          instrumentType: f.instrumentType || undefined, calibrationDate: f.calibrationDate, dueDate: f.dueDate,
          certificateNumber: f.certificateNumber || undefined, calibratedBy: f.calibratedBy || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setRows((p) => [data, ...p]);
      setF({ equipmentName: '', equipmentSerial: '', instrumentType: '', calibrationDate: today(), dueDate: '', certificateNumber: '', calibratedBy: '' });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const sorted = useMemo(() => [...rows].sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1)), [rows]);

  return (
    <>
      <div style={st.kpis}>
        <Kpi label="Valid" value={kpi.valid} good />
        <Kpi label="Due soon" value={kpi.dueSoon} warn={kpi.dueSoon > 0} />
        <Kpi label="Expired" value={kpi.expired} bad={kpi.expired > 0} />
      </div>

      <h2 style={st.h2}>Record calibration</h2>
      <div style={st.form}>
        <label style={{ ...st.label, minWidth: 180 }}>Equipment<input style={st.input} value={f.equipmentName} onChange={(e) => set('equipmentName', e.target.value)} placeholder="Cable certifier" /></label>
        <label style={st.label}>Serial<input style={st.input} value={f.equipmentSerial} onChange={(e) => set('equipmentSerial', e.target.value)} placeholder="SN-CC-01" /></label>
        <label style={st.label}>Type<input style={st.input} value={f.instrumentType} onChange={(e) => set('instrumentType', e.target.value)} placeholder="optional" /></label>
        <label style={st.label}>Calibrated<input type="date" style={st.input} value={f.calibrationDate} onChange={(e) => set('calibrationDate', e.target.value)} /></label>
        <label style={st.label}>Due<input type="date" style={st.input} value={f.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></label>
        <label style={st.label}>Certificate<input style={st.input} value={f.certificateNumber} onChange={(e) => set('certificateNumber', e.target.value)} placeholder="optional" /></label>
        <label style={st.label}>Lab / vendor<input style={st.input} value={f.calibratedBy} onChange={(e) => set('calibratedBy', e.target.value)} placeholder="optional" /></label>
        <button style={st.btn} onClick={record} disabled={busy}>{busy ? 'Saving…' : 'Record'}</button>
        {error && <span style={st.err}>{error}</span>}
      </div>

      <div style={st.regHead}>
        <h2 style={st.h2}>Calibration register</h2>
        <ExportButton filename="calibrations" title="Calibration Register" rows={sorted as unknown as Array<Record<string, unknown>>}
          columns={[{ key: 'equipmentName', label: 'Equipment' }, { key: 'equipmentSerial', label: 'Serial' }, { key: 'instrumentType', label: 'Type' }, { key: 'calibrationDate', label: 'Calibrated' }, { key: 'dueDate', label: 'Due' }, { key: 'certificateNumber', label: 'Certificate' }, { key: 'calibratedBy', label: 'Lab' }, { key: 'status', label: 'Status' }]} />
      </div>
      {rows.length === 0 ? (
        <EmptyState compact title="No equipment calibrated" description="Register the calibration of test & measurement equipment with its due date — the register flags what is due soon or expired so uncalibrated instruments never sign off work." />
      ) : (
        <table style={st.table}>
          <thead><tr><th style={st.th}>Equipment</th><th style={st.th}>Serial</th><th style={st.th}>Type</th><th style={st.th}>Calibrated</th><th style={st.th}>Due</th><th style={st.th}>Certificate</th><th style={st.th}>Status</th></tr></thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id}>
                <td style={st.td}>{r.equipmentName}</td>
                <td style={st.td}>{r.equipmentSerial}</td>
                <td style={st.td}>{r.instrumentType || '—'}</td>
                <td style={st.td}>{r.calibrationDate}</td>
                <td style={{ ...st.td, fontWeight: r.status === 'expired' ? 700 : 400, color: r.status === 'expired' ? '#dc2626' : 'inherit' }}>{r.dueDate}</td>
                <td style={st.td}>{r.certificateNumber || '—'}</td>
                <td style={{ ...st.td, color: statusColor[r.status], fontWeight: 600 }}>{statusLabel[r.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Kpi({ label, value, good, warn, bad }: { label: string; value: number; good?: boolean; warn?: boolean; bad?: boolean }) {
  const color = bad && value > 0 ? '#dc2626' : warn && value > 0 ? '#d97706' : good ? '#16a34a' : 'var(--text)';
  return (
    <div style={st.kpi}>
      <div style={st.kpiLabel}>{label}</div>
      <div style={{ ...st.kpiValue, color }}>{value}</div>
    </div>
  );
}

const st = {
  kpis: { display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap' as const } as CSSProperties,
  kpi: { border: '1px solid var(--border)', borderRadius: 10, padding: '12px 18px', minWidth: 120, background: 'var(--panel)' } as CSSProperties,
  kpiLabel: { fontSize: 12, color: 'var(--muted)', marginBottom: 4 } as CSSProperties,
  kpiValue: { fontSize: 24, fontWeight: 700, letterSpacing: -0.5 } as CSSProperties,
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 14 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 120, background: 'var(--panel)', color: 'var(--text)' } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  err: { color: '#dc2626', marginLeft: 12, fontSize: 13 } as CSSProperties,
  h2: { fontSize: 20, margin: '22px 0 10px' } as CSSProperties,
  regHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 8 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
};
