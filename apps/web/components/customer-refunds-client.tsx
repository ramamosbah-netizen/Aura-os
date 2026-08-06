'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import EmptyState from './ui/empty-state';

export interface CustomerRefund {
  id: string;
  refundNumber: string;
  customerName: string;
  reference: string | null;
  reason: string;
  amount: number;
  currency: string;
  refundDate: string;
  status: string;
}

const statusColor: Record<string, string> = { draft: 'var(--muted)', paid: 'var(--good)', cancelled: 'var(--bad)' };
const today = () => new Date().toISOString().slice(0, 10);

export default function CustomerRefundsClient({ initialRefunds }: { initialRefunds: CustomerRefund[] }) {
  const [refunds, setRefunds] = useState(initialRefunds);
  const [refundNumber, setNumber] = useState('');
  const [customerName, setCustomer] = useState('');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const totals = useMemo(() => {
    const paid = refunds.filter((r) => r.status === 'paid');
    return { count: refunds.length, paidValue: paid.reduce((s, r) => s + r.amount, 0) };
  }, [refunds]);

  const create = async () => {
    setError(''); setMsg('');
    if (!refundNumber.trim()) return setError('Refund number is required');
    if (!customerName.trim()) return setError('Customer is required');
    if (!(Number(amount) > 0)) return setError('Amount must be positive');
    try {
      const res = await fetch('/api/finance/customer-refunds', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refundNumber, customerName, reason, amount: Number(amount), refundDate: today() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setRefunds((prev) => [data, ...prev]);
      setNumber(''); setCustomer(''); setReason(''); setAmount('');
      setMsg(`Refund ${data.refundNumber} drafted — pay it to post to the ledger.`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const act = async (id: string, action: 'pay' | 'cancel') => {
    setError(''); setMsg('');
    try {
      const res = await fetch(`/api/finance/customer-refunds/${id}/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setRefunds((prev) => prev.map((r) => (r.id === id ? data : r)));
      if (action === 'pay') setMsg(`Refund ${data.refundNumber} paid — Dr AR / Cr Bank posted.`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <div style={st.cards}>
        <div style={st.card}><div style={st.cardLabel}>Refunds</div><div style={st.cardVal}>{totals.count}</div></div>
        <div style={st.card}><div style={st.cardLabel}>Paid out</div><div style={st.cardVal}>{totals.paidValue.toLocaleString()} AED</div></div>
      </div>

      <h2 style={st.h2}>New refund</h2>
      <div style={st.form}>
        <label style={st.label}>Number<input style={st.input} value={refundNumber} onChange={(e) => setNumber(e.target.value)} placeholder="RF-2026-001" /></label>
        <label style={st.label}>Customer<input style={{ ...st.input, minWidth: 180 }} value={customerName} onChange={(e) => setCustomer(e.target.value)} placeholder="Emaar" /></label>
        <label style={st.label}>Reason<input style={st.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Over-payment" /></label>
        <label style={st.label}>Amount<input style={st.input} type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></label>
        <button style={st.btn} onClick={create}>Draft</button>
      </div>
      {error && <p style={st.err}>{error}</p>}
      {msg && <p style={st.ok}>{msg}</p>}

      <h2 style={st.h2}>Refunds</h2>
      {refunds.length === 0 ? (
        <EmptyState compact title="No refunds yet" description="Draft a refund to return cash to a customer; paying it posts Dr AR / Cr Bank." />
      ) : (
        <table style={st.table}>
          <thead><tr><th style={st.th}>Number</th><th style={st.th}>Customer</th><th style={st.th}>Reason</th><th style={st.thR}>Amount</th><th style={st.th}>Date</th><th style={st.th}>Status</th><th style={st.th}>Actions</th></tr></thead>
          <tbody>
            {refunds.map((r) => (
              <tr key={r.id}>
                <td style={st.td}><code>{r.refundNumber}</code></td>
                <td style={st.td}>{r.customerName}</td>
                <td style={st.td}>{r.reason || '—'}</td>
                <td style={st.tdR}>{r.amount.toLocaleString()} {r.currency}</td>
                <td style={st.td}>{r.refundDate}</td>
                <td style={{ ...st.td, color: statusColor[r.status] || 'inherit', fontWeight: 600 }}>{r.status}</td>
                <td style={st.td}>
                  {r.status === 'draft' && <button style={st.smGreen} onClick={() => act(r.id, 'pay')}>Pay</button>}
                  {r.status === 'draft' && <button style={st.smGray} onClick={() => act(r.id, 'cancel')}>Cancel</button>}
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
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 10 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 120 } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  smGreen: { padding: '4px 10px', borderRadius: 4, background: 'var(--good)', color: 'var(--accent-ink)', border: 'none', fontSize: 12, cursor: 'pointer', marginRight: 4 } as CSSProperties,
  smGray: { padding: '4px 10px', borderRadius: 4, background: 'var(--panel-2)', color: 'inherit', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  err: { color: 'var(--bad)', margin: '6px 0 0', fontSize: 13 } as CSSProperties,
  ok: { color: 'var(--good)', margin: '6px 0 0', fontSize: 13 } as CSSProperties,
  h2: { fontSize: 20, margin: '18px 0 10px' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  thR: { textAlign: 'right' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
  tdR: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)', textAlign: 'right' as const } as CSSProperties,
};
