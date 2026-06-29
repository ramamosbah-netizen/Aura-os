'use client';

import { type CSSProperties, useMemo, useState } from 'react';

interface Employee {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
}

interface ExpenseClaim {
  id: string;
  employeeId: string;
  projectId: string | null;
  category: string;
  amount: number;
  expenseDate: string;
  description: string;
  status: string;
  approvedBy: string | null;
  reimbursedDate: string | null;
}

const CATEGORIES = ['travel', 'accommodation', 'meals', 'fuel', 'materials', 'other'];
const statusColor: Record<string, string> = { draft: '#6b7280', submitted: '#d97706', approved: '#2563eb', rejected: '#dc2626', reimbursed: '#16a34a' };

export default function ExpenseClaimsClient({ initialClaims, employees }: { initialClaims: ExpenseClaim[]; employees: Employee[] }) {
  const [claims, setClaims] = useState(initialClaims);
  const [employeeId, setEmployeeId] = useState('');
  const [category, setCategory] = useState('travel');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const empName = (id: string) => {
    const e = employees.find((x) => x.id === id);
    if (!e) return id.slice(0, 8) + '…';
    return e.name || [e.firstName, e.lastName].filter(Boolean).join(' ') || id.slice(0, 8) + '…';
  };

  const totals = useMemo(() => {
    const pending = claims.filter((c) => c.status === 'submitted').reduce((s, c) => s + c.amount, 0);
    const outstanding = claims.filter((c) => c.status === 'approved').reduce((s, c) => s + c.amount, 0);
    return { pending, outstanding };
  }, [claims]);

  const create = async () => {
    setError('');
    if (!employeeId) return setError('Select an employee');
    if (!(Number(amount) > 0)) return setError('Amount must be positive');
    if (!expenseDate) return setError('Expense date is required');
    setBusy(true);
    try {
      const res = await fetch('/api/hr/expense-claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ employeeId, category, amount: Number(amount), expenseDate, description: description || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setClaims((prev) => [data, ...prev]);
      setAmount(''); setDescription('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const act = async (id: string, action: string) => {
    setError('');
    try {
      const res = await fetch(`/api/hr/expense-claims/${id}/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setClaims((prev) => prev.map((c) => (c.id === id ? data : c)));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <div style={st.cards}>
        <div style={st.card}><div style={st.cardLabel}>Pending approval</div><div style={st.cardVal}>{totals.pending.toLocaleString()} AED</div></div>
        <div style={st.card}><div style={st.cardLabel}>Approved, unpaid</div><div style={st.cardVal}>{totals.outstanding.toLocaleString()} AED</div></div>
      </div>

      <div style={st.form}>
        <label style={st.label}>Employee
          <select style={st.input} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">— select —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{empName(e.id)}</option>)}
          </select>
        </label>
        <label style={st.label}>Category
          <select style={st.input} value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label style={st.label}>Amount<input style={st.input} type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="350" /></label>
        <label style={st.label}>Date<input style={st.input} type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} /></label>
        <label style={st.label}>Description<input style={st.input} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Taxi to site" /></label>
        <button style={st.btn} disabled={busy} onClick={create}>{busy ? 'Saving…' : 'New Claim'}</button>
        {error && <p style={st.err}>{error}</p>}
      </div>

      <h2 style={st.h2}>Claims</h2>
      {claims.length === 0 ? (
        <p style={st.muted}>No expense claims yet.</p>
      ) : (
        <table style={st.table}>
          <thead>
            <tr>
              <th style={st.th}>Date</th>
              <th style={st.th}>Employee</th>
              <th style={st.th}>Category</th>
              <th style={st.th}>Amount</th>
              <th style={st.th}>Description</th>
              <th style={st.th}>Status</th>
              <th style={st.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {claims.map((c) => (
              <tr key={c.id}>
                <td style={st.td}>{c.expenseDate}</td>
                <td style={st.td}>{empName(c.employeeId)}</td>
                <td style={st.td}>{c.category}</td>
                <td style={st.td}>{c.amount.toLocaleString()}</td>
                <td style={st.td}>{c.description}</td>
                <td style={{ ...st.td, color: statusColor[c.status] || '#000', fontWeight: 600 }}>{c.status}</td>
                <td style={st.td}>
                  {c.status === 'draft' && <button style={st.sm} onClick={() => act(c.id, 'submit')}>Submit</button>}
                  {c.status === 'submitted' && <button style={st.sm} onClick={() => act(c.id, 'approve')}>Approve</button>}
                  {c.status === 'submitted' && <button style={st.smRed} onClick={() => act(c.id, 'reject')}>Reject</button>}
                  {c.status === 'approved' && <button style={st.smGreen} onClick={() => act(c.id, 'reimburse')}>Reimburse</button>}
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
  card: { padding: '12px 18px', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)', minWidth: 160 } as CSSProperties,
  cardLabel: { fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5 } as CSSProperties,
  cardVal: { fontSize: 22, fontWeight: 700, marginTop: 4 } as CSSProperties,
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 28 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 130 } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  sm: { padding: '4px 10px', borderRadius: 4, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', marginRight: 4 } as CSSProperties,
  smRed: { padding: '4px 10px', borderRadius: 4, background: '#dc2626', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', marginRight: 4 } as CSSProperties,
  smGreen: { padding: '4px 10px', borderRadius: 4, background: '#16a34a', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  err: { color: '#dc2626', margin: '6px 0 0', fontSize: 13, width: '100%' } as CSSProperties,
  h2: { fontSize: 20, margin: '0 0 10px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
};
