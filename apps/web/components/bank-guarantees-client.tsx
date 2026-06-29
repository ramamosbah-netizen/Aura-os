'use client';

import { type CSSProperties, useMemo, useState } from 'react';

interface BankGuarantee {
  id: string;
  reference: string;
  type: string;
  beneficiary: string;
  bankName: string;
  projectName: string | null;
  amount: number;
  currency: string;
  issueDate: string;
  expiryDate: string;
  status: string;
}

const TYPES = ['tender', 'performance', 'advance_payment', 'retention', 'other'];
const statusColor: Record<string, string> = { active: '#2563eb', released: '#16a34a', claimed: '#dc2626', expired: '#6b7280' };
const today = () => new Date().toISOString().slice(0, 10);

function daysTo(expiry: string): number {
  return Math.round((Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86_400_000);
}

export default function BankGuaranteesClient({ initialGuarantees }: { initialGuarantees: BankGuarantee[] }) {
  const [guarantees, setGuarantees] = useState(initialGuarantees);
  const [reference, setReference] = useState('');
  const [type, setType] = useState('performance');
  const [beneficiary, setBeneficiary] = useState('');
  const [bankName, setBankName] = useState('');
  const [amount, setAmount] = useState('');
  const [issueDate, setIssueDate] = useState(today());
  const [expiryDate, setExpiryDate] = useState('');
  const [error, setError] = useState('');

  const totals = useMemo(() => {
    const active = guarantees.filter((g) => g.status === 'active');
    const exposure = active.reduce((s, g) => s + g.amount, 0);
    const expiringSoon = active.filter((g) => { const d = daysTo(g.expiryDate); return d >= 0 && d <= 30; }).length;
    return { exposure, expiringSoon, activeCount: active.length };
  }, [guarantees]);

  const create = async () => {
    setError('');
    if (!reference.trim() || !beneficiary.trim() || !bankName.trim()) return setError('Reference, beneficiary, and bank are required');
    if (!(Number(amount) > 0)) return setError('Amount must be positive');
    if (!expiryDate) return setError('Expiry date is required');
    try {
      const res = await fetch('/api/finance/bank-guarantees', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reference, type, beneficiary, bankName, amount: Number(amount), issueDate, expiryDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setGuarantees((prev) => [...prev, data].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)));
      setReference(''); setBeneficiary(''); setBankName(''); setAmount(''); setExpiryDate('');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const act = async (id: string, action: 'release' | 'claim' | 'expire') => {
    setError('');
    try {
      const res = await fetch(`/api/finance/bank-guarantees/${id}/status`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setGuarantees((prev) => prev.map((g) => (g.id === id ? data : g)));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <div style={st.cards}>
        <div style={st.card}><div style={st.cardLabel}>Active exposure</div><div style={st.cardVal}>{totals.exposure.toLocaleString()} AED</div></div>
        <div style={st.card}><div style={st.cardLabel}>Active count</div><div style={st.cardVal}>{totals.activeCount}</div></div>
        <div style={st.card}><div style={st.cardLabel}>Expiring ≤30d</div><div style={{ ...st.cardVal, color: totals.expiringSoon > 0 ? '#d97706' : undefined }}>{totals.expiringSoon}</div></div>
      </div>

      <h2 style={st.h2}>New guarantee</h2>
      <div style={st.form}>
        <label style={st.label}>Reference<input style={st.input} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="PB-2026-001" /></label>
        <label style={st.label}>Type
          <select style={st.input} value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
        </label>
        <label style={st.label}>Beneficiary<input style={st.input} value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} placeholder="Emaar" /></label>
        <label style={st.label}>Bank<input style={st.input} value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Emirates NBD" /></label>
        <label style={st.label}>Amount<input style={st.input} type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500000" /></label>
        <label style={st.label}>Issue<input style={st.input} type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></label>
        <label style={st.label}>Expiry<input style={st.input} type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></label>
        <button style={st.btn} onClick={create}>Add</button>
      </div>
      {error && <p style={st.err}>{error}</p>}

      <h2 style={st.h2}>Guarantees</h2>
      {guarantees.length === 0 ? (
        <p style={st.muted}>No bank guarantees recorded.</p>
      ) : (
        <table style={st.table}>
          <thead><tr><th style={st.th}>Reference</th><th style={st.th}>Type</th><th style={st.th}>Beneficiary</th><th style={st.th}>Amount</th><th style={st.th}>Expiry</th><th style={st.th}>Status</th><th style={st.th}>Actions</th></tr></thead>
          <tbody>
            {guarantees.map((g) => {
              const d = daysTo(g.expiryDate);
              const soon = g.status === 'active' && d >= 0 && d <= 30;
              return (
                <tr key={g.id}>
                  <td style={st.td}>{g.reference}</td>
                  <td style={st.td}>{g.type.replace('_', ' ')}</td>
                  <td style={st.td}>{g.beneficiary}</td>
                  <td style={st.td}>{g.amount.toLocaleString()} {g.currency}</td>
                  <td style={{ ...st.td, color: soon ? '#d97706' : undefined, fontWeight: soon ? 600 : 400 }}>
                    {g.expiryDate}{g.status === 'active' && ` (${d}d)`}
                  </td>
                  <td style={{ ...st.td, color: statusColor[g.status] || '#000', fontWeight: 600 }}>{g.status}</td>
                  <td style={st.td}>
                    {g.status === 'active' && <button style={st.smGreen} onClick={() => act(g.id, 'release')}>Release</button>}
                    {g.status === 'active' && <button style={st.smRed} onClick={() => act(g.id, 'claim')}>Claim</button>}
                    {g.status === 'active' && <button style={st.smGray} onClick={() => act(g.id, 'expire')}>Expire</button>}
                  </td>
                </tr>
              );
            })}
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
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 10 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 120 } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  smGreen: { padding: '4px 10px', borderRadius: 4, background: '#16a34a', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', marginRight: 4 } as CSSProperties,
  smRed: { padding: '4px 10px', borderRadius: 4, background: '#dc2626', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', marginRight: 4 } as CSSProperties,
  smGray: { padding: '4px 10px', borderRadius: 4, background: 'var(--surface-2, #e5e7eb)', color: 'inherit', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  err: { color: '#dc2626', margin: '6px 0 0', fontSize: 13 } as CSSProperties,
  h2: { fontSize: 20, margin: '18px 0 10px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
};
