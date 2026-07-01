'use client';

import { type CSSProperties, useState } from 'react';
import ExportButton from './export-button';

interface Vehicle { id: string; make: string; model: string; plateNumber: string }

interface SalikCharge {
  id: string;
  vehicleId: string;
  plateNumber: string;
  gate: string;
  chargeDate: string;
  chargeTime: string;
  amount: number;
  status: string;
  allocatedTo: string;
}

const STATUS_COLOR: Record<string, string> = {
  recorded: 'var(--accent)',
  allocated: 'var(--good)',
  disputed: 'var(--bad)',
};

export default function SalikClient({ initialCharges, vehicles }: { initialCharges: SalikCharge[]; vehicles: Vehicle[] }) {
  const [charges, setCharges] = useState<SalikCharge[]>(initialCharges);
  const [err, setErr] = useState('');

  const [vehicleId, setVehicleId] = useState('');
  const [gate, setGate] = useState('');
  const [chargeDate, setChargeDate] = useState('');
  const [amount, setAmount] = useState('');

  const total = Math.round(charges.filter((c) => c.status !== 'disputed').reduce((s, c) => s + c.amount, 0) * 100) / 100;

  function plate(id: string): string {
    return vehicles.find((v) => v.id === id)?.plateNumber ?? id.slice(0, 8);
  }

  async function refresh(): Promise<void> {
    const res = await fetch('/api/fleet/salik');
    if (res.ok) setCharges(await res.json());
  }

  async function record(): Promise<void> {
    if (!vehicleId.trim() || !gate.trim() || !chargeDate.trim()) {
      setErr('Vehicle, gate and date are required');
      return;
    }
    setErr('');
    const res = await fetch('/api/fleet/salik', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vehicleId, gate, chargeDate, amount: amount ? Number(amount) : undefined }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d.message ?? d.error ?? 'Failed to record charge');
      return;
    }
    setGate(''); setChargeDate(''); setAmount('');
    await refresh();
  }

  async function act(id: string, action: 'allocate' | 'dispute'): Promise<void> {
    let body: unknown;
    if (action === 'allocate') {
      const to = window.prompt('Allocate to (driver / project)');
      if (!to?.trim()) return;
      body = { allocatedTo: to };
    }
    setErr('');
    const res = await fetch(`/api/fleet/salik/${id}/${action}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setErr(d.message ?? d.error ?? `${action} failed`);
      return;
    }
    await refresh();
  }

  return (
    <div>
      <div style={s.createBar}>
        <select style={s.inputSm} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          <option value="">Vehicle…</option>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plateNumber} ({v.make} {v.model})</option>)}
        </select>
        <input style={s.input} placeholder="Gate (e.g. Al Garhoud)" value={gate} onChange={(e) => setGate(e.target.value)} />
        <input style={s.inputSm} type="date" value={chargeDate} onChange={(e) => setChargeDate(e.target.value)} />
        <input style={s.inputXs} placeholder="AED (4)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button type="button" style={s.primary} onClick={record}>Record</button>
      </div>
      {err && <p style={s.err}>{err}</p>}

      <div style={s.statBar}>
        <span style={s.stat}><b>{charges.length}</b> charges</span>
        <span style={s.stat}>Total (excl. disputed): <b>AED {total.toLocaleString('en-AE', { minimumFractionDigits: 2 })}</b></span>
      </div>

      <div style={{ margin: '8px 0' }}><ExportButton filename="salik" rows={charges as unknown as Array<Record<string, unknown>>} columns={[{ key: 'chargeDate' }, { key: 'gate' }, { key: 'amount' }, { key: 'status' }, { key: 'allocatedTo' }]} /></div>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>Date</th>
            <th style={s.th}>Vehicle</th>
            <th style={s.th}>Gate</th>
            <th style={s.thR}>Amount</th>
            <th style={s.th}>Status</th>
            <th style={s.th}>Allocated to</th>
            <th style={s.thR}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {charges.length === 0 ? (
            <tr><td style={s.muted} colSpan={7}>No Salik charges yet — record one above.</td></tr>
          ) : (
            charges.map((c) => (
              <tr key={c.id} style={s.row}>
                <td style={s.td}>{c.chargeDate}</td>
                <td style={s.td}>{plate(c.vehicleId)}</td>
                <td style={s.td}>{c.gate}</td>
                <td style={s.tdR}>{c.amount.toFixed(2)}</td>
                <td style={s.td}><span style={{ ...s.tag, color: STATUS_COLOR[c.status] ?? 'var(--text)', borderColor: STATUS_COLOR[c.status] ?? 'var(--border)' }}>{c.status}</span></td>
                <td style={s.tdMuted}>{c.allocatedTo || '—'}</td>
                <td style={s.tdR}>
                  {c.status === 'recorded' && (
                    <>
                      <button type="button" style={s.btn} onClick={() => act(c.id, 'allocate')}>Allocate</button>
                      <button type="button" style={s.badBtn} onClick={() => act(c.id, 'dispute')}>Dispute</button>
                    </>
                  )}
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
  input: { flex: 1, minWidth: 150, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text)', padding: '9px 11px', fontSize: 13.5 } as CSSProperties,
  inputSm: { width: 160, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text)', padding: '9px 11px', fontSize: 13.5 } as CSSProperties,
  inputXs: { width: 80, background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text)', padding: '9px 11px', fontSize: 13.5 } as CSSProperties,
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
  tdMuted: { padding: '10px', color: 'var(--muted)' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '12px 10px', fontSize: 13.5 } as CSSProperties,
  tag: { fontSize: 11, border: '1px solid var(--border)', borderRadius: 999, padding: '1px 8px', textTransform: 'capitalize' } as CSSProperties,
  btn: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '5px 10px', fontSize: 12.5, cursor: 'pointer', marginLeft: 6 } as CSSProperties,
  badBtn: { background: 'var(--panel)', border: '1px solid var(--bad)', borderRadius: 8, color: 'var(--bad)', padding: '5px 10px', fontSize: 12.5, cursor: 'pointer', marginLeft: 6 } as CSSProperties,
};
