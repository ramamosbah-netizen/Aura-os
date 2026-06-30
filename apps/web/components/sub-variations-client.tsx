'use client';

import { type CSSProperties, useMemo, useState } from 'react';

interface Subcontract { id: string; title: string; subcontractorName: string; value: number }
interface Variation {
  id: string;
  subcontractId: string;
  reference: string;
  type: string;
  amount: number;
  description: string;
  status: string;
}

const statusColor: Record<string, string> = { pending: '#d97706', approved: '#16a34a', rejected: '#dc2626' };

export default function SubVariationsClient({ initialVariations, subcontracts }: { initialVariations: Variation[]; subcontracts: Subcontract[] }) {
  const [variations, setVariations] = useState(initialVariations);
  const [subcontractId, setSubcontractId] = useState('');
  const [reference, setReference] = useState('');
  const [type, setType] = useState('addition');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const subLabel = (id: string) => {
    const s = subcontracts.find((x) => x.id === id);
    return s ? `${s.title} — ${s.subcontractorName}` : id.slice(0, 8) + '…';
  };

  const totalApproved = useMemo(
    () => variations.filter((v) => v.status === 'approved').reduce((sum, v) => sum + (v.type === 'omission' ? -v.amount : v.amount), 0),
    [variations],
  );

  const create = async () => {
    setError('');
    if (!subcontractId) return setError('Select a subcontract');
    if (!reference.trim()) return setError('Reference is required');
    if (!(Number(amount) > 0)) return setError('Amount must be positive');
    try {
      const res = await fetch('/api/subcontracts/variations', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subcontractId, reference, type, amount: Number(amount), description: description || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setVariations((p) => [data, ...p]);
      setReference(''); setAmount(''); setDescription('');
    } catch (e) { setError((e as Error).message); }
  };

  const act = async (id: string, action: 'approve' | 'reject') => {
    setError('');
    try {
      const res = await fetch(`/api/subcontracts/variations/${id}/${action}`, { method: 'PATCH' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setVariations((p) => p.map((v) => (v.id === id ? data : v)));
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <>
      <div style={st.cards}>
        <div style={st.card}><div style={st.cardLabel}>Approved net</div><div style={{ ...st.cardVal, color: totalApproved >= 0 ? '#16a34a' : '#dc2626' }}>{totalApproved.toLocaleString()} AED</div></div>
      </div>

      <div style={st.form}>
        <label style={st.label}>Subcontract
          <select style={st.input} value={subcontractId} onChange={(e) => setSubcontractId(e.target.value)}>
            <option value="">— select —</option>
            {subcontracts.map((s) => <option key={s.id} value={s.id}>{subLabel(s.id)}</option>)}
          </select>
        </label>
        <label style={st.label}>Reference<input style={st.input} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="SCVO-001" /></label>
        <label style={st.label}>Type
          <select style={st.input} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="addition">addition</option>
            <option value="omission">omission</option>
          </select>
        </label>
        <label style={st.label}>Amount<input style={st.input} type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50000" /></label>
        <label style={st.label}>Description<input style={st.input} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Extra cabling" /></label>
        <button style={st.btn} onClick={create}>Raise variation</button>
        {error && <p style={st.err}>{error}</p>}
      </div>

      <h2 style={st.h2}>Variations</h2>
      {variations.length === 0 ? (
        <p style={st.muted}>No variations yet.</p>
      ) : (
        <table style={st.table}>
          <thead><tr><th style={st.th}>Reference</th><th style={st.th}>Subcontract</th><th style={st.th}>Type</th><th style={st.th}>Amount</th><th style={st.th}>Status</th><th style={st.th}>Actions</th></tr></thead>
          <tbody>
            {variations.map((v) => (
              <tr key={v.id}>
                <td style={st.td}>{v.reference}</td>
                <td style={st.td}>{subLabel(v.subcontractId)}</td>
                <td style={st.td}>{v.type}</td>
                <td style={{ ...st.td, color: v.type === 'omission' ? '#dc2626' : '#16a34a' }}>{v.type === 'omission' ? '−' : '+'}{v.amount.toLocaleString()}</td>
                <td style={{ ...st.td, color: statusColor[v.status] || '#000', fontWeight: 600 }}>{v.status}</td>
                <td style={st.td}>
                  {v.status === 'pending' && <button style={st.smGreen} onClick={() => act(v.id, 'approve')}>Approve</button>}
                  {v.status === 'pending' && <button style={st.smRed} onClick={() => act(v.id, 'reject')}>Reject</button>}
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
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 22 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 130 } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  smGreen: { padding: '4px 10px', borderRadius: 4, background: '#16a34a', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', marginRight: 4 } as CSSProperties,
  smRed: { padding: '4px 10px', borderRadius: 4, background: '#dc2626', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  err: { color: '#dc2626', margin: '6px 0 0', fontSize: 13, width: '100%' } as CSSProperties,
  h2: { fontSize: 20, margin: '18px 0 10px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
};
