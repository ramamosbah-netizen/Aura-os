'use client';

import { type CSSProperties, useState } from 'react';

interface PettyCashFund {
  id: string;
  name: string;
  balance: number;
  status: string;
}

interface Transaction {
  id: string;
  type: 'topup' | 'expense';
  category: string;
  amount: number;
  description: string;
  balanceAfter: number;
  transactionDate: string;
}

const CATEGORIES = ['office', 'travel', 'fuel', 'materials', 'refreshments', 'other'];
const today = () => new Date().toISOString().slice(0, 10);

export default function PettyCashClient({ initialFunds }: { initialFunds: PettyCashFund[] }) {
  const [funds, setFunds] = useState(initialFunds);
  const [selected, setSelected] = useState<string | null>(null);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [error, setError] = useState('');

  // new fund form
  const [name, setName] = useState('');
  const [openingFloat, setOpeningFloat] = useState('');

  // transaction form
  const [type, setType] = useState<'topup' | 'expense'>('expense');
  const [category, setCategory] = useState('office');
  const [amount, setAmount] = useState('');
  const [txDate, setTxDate] = useState(today());
  const [description, setDescription] = useState('');

  const createFund = async () => {
    setError('');
    if (!name.trim()) return setError('Fund name is required');
    try {
      const res = await fetch('/api/finance/petty-cash', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, openingFloat: openingFloat ? Number(openingFloat) : 0 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setFunds((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setName(''); setOpeningFloat('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const openFund = async (id: string) => {
    setError('');
    setSelected(id);
    try {
      const res = await fetch(`/api/finance/petty-cash/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setTxns(data.transactions ?? []);
    } catch (e) {
      setError((e as Error).message);
      setTxns([]);
    }
  };

  const recordTx = async () => {
    setError('');
    if (!selected) return;
    if (!(Number(amount) > 0)) return setError('Amount must be positive');
    try {
      const res = await fetch(`/api/finance/petty-cash/${selected}/transactions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, amount: Number(amount), transactionDate: txDate, category: type === 'expense' ? category : undefined, description: description || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setTxns((prev) => [data.transaction, ...prev]);
      setFunds((prev) => prev.map((f) => (f.id === selected ? data.fund : f)));
      setAmount(''); setDescription('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const selectedFund = funds.find((f) => f.id === selected);

  return (
    <>
      <div style={st.form}>
        <label style={st.label}>New fund<input style={st.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Site A Float" /></label>
        <label style={st.label}>Opening float<input style={st.input} type="number" min="0" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} placeholder="5000" /></label>
        <button style={st.btn} onClick={createFund}>Open Fund</button>
      </div>

      <h2 style={st.h2}>Funds</h2>
      {funds.length === 0 ? (
        <p style={st.muted}>No petty cash funds yet.</p>
      ) : (
        <table style={st.table}>
          <thead><tr><th style={st.th}>Fund</th><th style={st.th}>Balance</th><th style={st.th}>Status</th><th style={st.th}></th></tr></thead>
          <tbody>
            {funds.map((f) => (
              <tr key={f.id} style={f.id === selected ? { background: 'var(--surface-2, #f1f5f9)' } : undefined}>
                <td style={st.td}>{f.name}</td>
                <td style={st.td}>{f.balance.toLocaleString()} AED</td>
                <td style={st.td}>{f.status}</td>
                <td style={st.td}><button style={st.sm} onClick={() => openFund(f.id)}>Open</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {error && <p style={st.err}>{error}</p>}

      {selectedFund && (
        <section style={{ marginTop: 28 }}>
          <h2 style={st.h2}>{selectedFund.name} — statement (balance {selectedFund.balance.toLocaleString()} AED)</h2>
          <div style={st.form}>
            <label style={st.label}>Type
              <select style={st.input} value={type} onChange={(e) => setType(e.target.value as 'topup' | 'expense')}>
                <option value="expense">expense</option>
                <option value="topup">topup</option>
              </select>
            </label>
            {type === 'expense' && (
              <label style={st.label}>Category
                <select style={st.input} value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            )}
            <label style={st.label}>Amount<input style={st.input} type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="120" /></label>
            <label style={st.label}>Date<input style={st.input} type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} /></label>
            <label style={st.label}>Description<input style={st.input} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Diesel" /></label>
            <button style={st.btn} onClick={recordTx}>Record</button>
          </div>

          {txns.length === 0 ? (
            <p style={st.muted}>No movements yet.</p>
          ) : (
            <table style={st.table}>
              <thead><tr><th style={st.th}>Date</th><th style={st.th}>Type</th><th style={st.th}>Category</th><th style={st.th}>Amount</th><th style={st.th}>Balance</th><th style={st.th}>Description</th></tr></thead>
              <tbody>
                {txns.map((t) => (
                  <tr key={t.id}>
                    <td style={st.td}>{t.transactionDate}</td>
                    <td style={{ ...st.td, color: t.type === 'topup' ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{t.type}</td>
                    <td style={st.td}>{t.type === 'expense' ? t.category : '—'}</td>
                    <td style={st.td}>{t.type === 'topup' ? '+' : '−'}{t.amount.toLocaleString()}</td>
                    <td style={st.td}>{t.balanceAfter.toLocaleString()}</td>
                    <td style={st.td}>{t.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </>
  );
}

const st = {
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 20 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 130 } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  sm: { padding: '4px 10px', borderRadius: 4, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  err: { color: '#dc2626', margin: '6px 0 0', fontSize: 13 } as CSSProperties,
  h2: { fontSize: 20, margin: '18px 0 10px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
};
