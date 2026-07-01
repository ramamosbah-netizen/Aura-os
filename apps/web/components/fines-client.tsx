'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import ExportButton from './export-button';

interface Vehicle {
  id: string;
  make: string;
  model: string;
  plateNumber: string;
}

interface TrafficFine {
  id: string;
  vehicleId: string;
  driverEmployeeId: string | null;
  fineNumber: string;
  violation: string;
  location: string;
  amount: number;
  blackPoints: number;
  fineDate: string;
  status: string;
  paidDate: string | null;
}

const statusColor: Record<string, string> = { pending: '#d97706', assigned: '#2563eb', disputed: '#7c3aed', paid: '#16a34a' };

export default function FinesClient({ initialFines, vehicles }: { initialFines: TrafficFine[]; vehicles: Vehicle[] }) {
  const [fines, setFines] = useState(initialFines);
  const [vehicleId, setVehicleId] = useState('');
  const [fineNumber, setFineNumber] = useState('');
  const [violation, setViolation] = useState('');
  const [location, setLocation] = useState('');
  const [amount, setAmount] = useState('');
  const [points, setPoints] = useState('0');
  const [fineDate, setFineDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const vehLabel = (id: string) => {
    const v = vehicles.find((x) => x.id === id);
    return v ? `${v.plateNumber} (${v.make} ${v.model})` : id.slice(0, 8) + '…';
  };

  const totals = useMemo(() => {
    const outstanding = fines.filter((f) => f.status !== 'paid' && f.status !== 'disputed').reduce((s, f) => s + f.amount, 0);
    const points = fines.filter((f) => f.status !== 'disputed').reduce((s, f) => s + f.blackPoints, 0);
    return { outstanding, points };
  }, [fines]);

  const record = async () => {
    setError('');
    if (!vehicleId) return setError('Select a vehicle');
    if (!fineNumber || !violation || !fineDate) return setError('Fine number, violation, and date are required');
    if (!(Number(amount) > 0)) return setError('Amount must be positive');
    setBusy(true);
    try {
      const res = await fetch('/api/fleet/fines', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ vehicleId, fineNumber, violation, location: location || undefined, amount: Number(amount), blackPoints: Number(points) || 0, fineDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setFines((prev) => [data, ...prev]);
      setFineNumber(''); setViolation(''); setLocation(''); setAmount(''); setPoints('0');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const act = async (id: string, action: 'assign' | 'dispute' | 'pay', body?: object) => {
    setError('');
    try {
      const res = await fetch(`/api/fleet/fines/${id}/${action}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setFines((prev) => prev.map((f) => (f.id === id ? data : f)));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const assign = (id: string) => {
    const driver = prompt('Driver employee ID to assign liability:');
    if (driver) act(id, 'assign', { driverEmployeeId: driver });
  };

  return (
    <>
      <div style={st.cards}>
        <div style={st.card}><div style={st.cardLabel}>Outstanding</div><div style={st.cardVal}>{totals.outstanding.toLocaleString()} AED</div></div>
        <div style={st.card}><div style={st.cardLabel}>Black points</div><div style={st.cardVal}>{totals.points}</div></div>
      </div>

      <div style={st.form}>
        <label style={st.label}>Vehicle
          <select style={st.input} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">— select —</option>
            {vehicles.map((v) => <option key={v.id} value={v.id}>{vehLabel(v.id)}</option>)}
          </select>
        </label>
        <label style={st.label}>Fine #<input style={st.input} value={fineNumber} onChange={(e) => setFineNumber(e.target.value)} placeholder="DXB-12345" /></label>
        <label style={st.label}>Violation<input style={st.input} value={violation} onChange={(e) => setViolation(e.target.value)} placeholder="Speeding" /></label>
        <label style={st.label}>Location<input style={st.input} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Sheikh Zayed Rd" /></label>
        <label style={st.label}>Amount<input style={st.input} type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="600" /></label>
        <label style={st.label}>Points<input style={st.input} type="number" min="0" max="24" value={points} onChange={(e) => setPoints(e.target.value)} /></label>
        <label style={st.label}>Date<input style={st.input} type="date" value={fineDate} onChange={(e) => setFineDate(e.target.value)} /></label>
        <button style={st.btn} disabled={busy} onClick={record}>{busy ? 'Saving…' : 'Record Fine'}</button>
        {error && <p style={st.err}>{error}</p>}
      </div>

      <h2 style={st.h2}>Fines</h2>
      <div style={{ margin: '8px 0' }}><div style={{ margin: '8px 0' }}><ExportButton filename="traffic-fines" rows={fines as unknown as Array<Record<string, unknown>>} /></div></div>
      {fines.length === 0 ? (
        <p style={st.muted}>No fines recorded.</p>
      ) : (
        <table style={st.table}>
          <thead>
            <tr>
              <th style={st.th}>Date</th>
              <th style={st.th}>Vehicle</th>
              <th style={st.th}>Fine #</th>
              <th style={st.th}>Violation</th>
              <th style={st.th}>Amount</th>
              <th style={st.th}>Pts</th>
              <th style={st.th}>Status</th>
              <th style={st.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {fines.map((f) => (
              <tr key={f.id}>
                <td style={st.td}>{f.fineDate}</td>
                <td style={st.td}>{vehLabel(f.vehicleId)}</td>
                <td style={st.td}>{f.fineNumber}</td>
                <td style={st.td}>{f.violation}</td>
                <td style={st.td}>{f.amount.toLocaleString()}</td>
                <td style={st.td}>{f.blackPoints}</td>
                <td style={{ ...st.td, color: statusColor[f.status] || '#000', fontWeight: 600 }}>{f.status}</td>
                <td style={st.td}>
                  {f.status === 'pending' && <button style={st.sm} onClick={() => assign(f.id)}>Assign</button>}
                  {f.status === 'pending' && <button style={st.smGray} onClick={() => act(f.id, 'dispute')}>Dispute</button>}
                  {(f.status === 'pending' || f.status === 'assigned') && <button style={st.smGreen} onClick={() => act(f.id, 'pay')}>Pay</button>}
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
  card: { padding: '12px 18px', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)', minWidth: 140 } as CSSProperties,
  cardLabel: { fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5 } as CSSProperties,
  cardVal: { fontSize: 22, fontWeight: 700, marginTop: 4 } as CSSProperties,
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 28 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 120 } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  sm: { padding: '4px 10px', borderRadius: 4, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', marginRight: 4 } as CSSProperties,
  smGray: { padding: '4px 10px', borderRadius: 4, background: '#7c3aed', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', marginRight: 4 } as CSSProperties,
  smGreen: { padding: '4px 10px', borderRadius: 4, background: '#16a34a', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  err: { color: '#dc2626', margin: '6px 0 0', fontSize: 13, width: '100%' } as CSSProperties,
  h2: { fontSize: 20, margin: '0 0 10px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
};
