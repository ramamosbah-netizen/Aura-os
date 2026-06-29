'use client';

import { type CSSProperties, useMemo, useState } from 'react';

interface Employee { id: string; firstName?: string; lastName?: string; name?: string }
interface StaffAdvance {
  id: string;
  employeeId: string;
  amount: number;
  reason: string;
  installments: number;
  amountRepaid: number;
  status: string;
  requestDate: string;
}

const statusColor: Record<string, string> = { requested: '#d97706', approved: '#2563eb', rejected: '#dc2626', disbursed: '#7c3aed', settled: '#16a34a' };
const today = () => new Date().toISOString().slice(0, 10);

export default function StaffAdvancesClient({ initialAdvances, employees }: { initialAdvances: StaffAdvance[]; employees: Employee[] }) {
  const [advances, setAdvances] = useState(initialAdvances);
  const [employeeId, setEmployeeId] = useState('');
  const [amount, setAmount] = useState('');
  const [installments, setInstallments] = useState('6');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const empName = (id: string) => {
    const e = employees.find((x) => x.id === id);
    if (!e) return id.slice(0, 8) + '…';
    return e.name || [e.firstName, e.lastName].filter(Boolean).join(' ') || id.slice(0, 8) + '…';
  };

  const totals = useMemo(() => {
    const outstanding = advances.filter((a) => a.status === 'disbursed').reduce((s, a) => s + (a.amount - a.amountRepaid), 0);
    const pending = advances.filter((a) => a.status === 'requested').length;
    return { outstanding, pending };
  }, [advances]);

  const create = async () => {
    setError('');
    if (!employeeId) return setError('Select an employee');
    if (!(Number(amount) > 0)) return setError('Amount must be positive');
    try {
      const res = await fetch('/api/hr/staff-advances', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ employeeId, amount: Number(amount), installments: Number(installments) || 1, reason: reason || undefined, requestDate: today() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setAdvances((prev) => [data, ...prev]);
      setAmount(''); setReason('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const act = async (id: string, action: string, body?: object) => {
    setError('');
    try {
      const res = await fetch(`/api/hr/staff-advances/${id}/${action}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setAdvances((prev) => prev.map((a) => (a.id === id ? data : a)));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const repay = (a: StaffAdvance) => {
    const remaining = (a.amount - a.amountRepaid).toFixed(2);
    const amt = prompt(`Repayment amount (outstanding ${remaining}):`, (a.amount / a.installments).toFixed(2));
    if (amt && Number(amt) > 0) act(a.id, 'repay', { amount: Number(amt) });
  };

  return (
    <>
      <div style={st.cards}>
        <div style={st.card}><div style={st.cardLabel}>Outstanding</div><div style={st.cardVal}>{totals.outstanding.toLocaleString()} AED</div></div>
        <div style={st.card}><div style={st.cardLabel}>Pending requests</div><div style={st.cardVal}>{totals.pending}</div></div>
      </div>

      <div style={st.form}>
        <label style={st.label}>Employee
          <select style={st.input} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">— select —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{empName(e.id)}</option>)}
          </select>
        </label>
        <label style={st.label}>Amount<input style={st.input} type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="6000" /></label>
        <label style={st.label}>Installments<input style={st.input} type="number" min="1" max="60" value={installments} onChange={(e) => setInstallments(e.target.value)} /></label>
        <label style={st.label}>Reason<input style={st.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="(optional)" /></label>
        <button style={st.btn} onClick={create}>Request</button>
        {error && <p style={st.err}>{error}</p>}
      </div>

      <h2 style={st.h2}>Advances</h2>
      {advances.length === 0 ? (
        <p style={st.muted}>No staff advances yet.</p>
      ) : (
        <table style={st.table}>
          <thead><tr><th style={st.th}>Date</th><th style={st.th}>Employee</th><th style={st.th}>Amount</th><th style={st.th}>Repaid</th><th style={st.th}>×</th><th style={st.th}>Status</th><th style={st.th}>Actions</th></tr></thead>
          <tbody>
            {advances.map((a) => (
              <tr key={a.id}>
                <td style={st.td}>{a.requestDate}</td>
                <td style={st.td}>{empName(a.employeeId)}</td>
                <td style={st.td}>{a.amount.toLocaleString()}</td>
                <td style={st.td}>{a.amountRepaid.toLocaleString()}</td>
                <td style={st.td}>{a.installments}</td>
                <td style={{ ...st.td, color: statusColor[a.status] || '#000', fontWeight: 600 }}>{a.status}</td>
                <td style={st.td}>
                  {a.status === 'requested' && <button style={st.sm} onClick={() => act(a.id, 'approve')}>Approve</button>}
                  {a.status === 'requested' && <button style={st.smRed} onClick={() => act(a.id, 'reject')}>Reject</button>}
                  {a.status === 'approved' && <button style={st.smPurple} onClick={() => act(a.id, 'disburse')}>Disburse</button>}
                  {a.status === 'disbursed' && <button style={st.smGreen} onClick={() => repay(a)}>Repay</button>}
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
  card: { padding: '12px 18px', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)', minWidth: 150 } as CSSProperties,
  cardLabel: { fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5 } as CSSProperties,
  cardVal: { fontSize: 22, fontWeight: 700, marginTop: 4 } as CSSProperties,
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 22 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 130 } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  sm: { padding: '4px 10px', borderRadius: 4, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', marginRight: 4 } as CSSProperties,
  smRed: { padding: '4px 10px', borderRadius: 4, background: '#dc2626', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', marginRight: 4 } as CSSProperties,
  smPurple: { padding: '4px 10px', borderRadius: 4, background: '#7c3aed', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  smGreen: { padding: '4px 10px', borderRadius: 4, background: '#16a34a', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  err: { color: '#dc2626', margin: '6px 0 0', fontSize: 13, width: '100%' } as CSSProperties,
  h2: { fontSize: 20, margin: '18px 0 10px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
};
