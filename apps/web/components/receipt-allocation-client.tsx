'use client';

import { type CSSProperties, useState } from 'react';
import EmptyState from './ui/empty-state';

export interface CustomerBalance {
  customerName: string;
  outstanding: number;
}

interface Allocation {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
}
interface AllocationResult {
  allocations: Allocation[];
  totalAllocated: number;
  unapplied: number;
}

export default function ReceiptAllocationClient({ customers }: { customers: CustomerBalance[] }) {
  const [customerName, setCustomerName] = useState('');
  const [amount, setAmount] = useState('');
  const [preview, setPreview] = useState<AllocationResult | null>(null);
  const [applied, setApplied] = useState<AllocationResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const selected = customers.find((c) => c.customerName === customerName) ?? null;

  const doPreview = async () => {
    setError(''); setApplied(null); setPreview(null);
    if (!customerName) return setError('Choose a customer');
    if (!(Number(amount) > 0)) return setError('Amount must be positive');
    setBusy(true);
    try {
      const res = await fetch(`/api/finance/receipt-allocation?customerName=${encodeURIComponent(customerName)}&amount=${Number(amount)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setPreview(data);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  const apply = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/finance/receipt-allocation', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ customerName, amount: Number(amount) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setApplied(data); setPreview(null); setAmount('');
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  };

  if (customers.length === 0) {
    return <EmptyState compact title="No open receivables" description="Issue a customer invoice first — receipts are allocated against open invoices." />;
  }

  const result = applied ?? preview;

  return (
    <>
      <div style={st.form}>
        <label style={st.label}>Customer
          <select style={{ ...st.input, minWidth: 240 }} value={customerName} onChange={(e) => { setCustomerName(e.target.value); setPreview(null); setApplied(null); }}>
            <option value="">Select customer…</option>
            {customers.map((c) => <option key={c.customerName} value={c.customerName}>{c.customerName} (outstanding {c.outstanding.toLocaleString()})</option>)}
          </select>
        </label>
        <label style={st.label}>Amount received{selected ? <span style={st.hint}> — {selected.outstanding.toLocaleString()} open</span> : null}
          <input style={st.input} type="number" min="0" value={amount} onChange={(e) => { setAmount(e.target.value); setPreview(null); setApplied(null); }} placeholder="0.00" />
        </label>
        <button style={st.btnGhost} onClick={doPreview} disabled={busy}>Preview</button>
        <button style={st.btn} onClick={apply} disabled={busy || !customerName || !(Number(amount) > 0)}>Apply receipt</button>
      </div>
      {error && <p style={st.err}>{error}</p>}
      {applied && <p style={st.ok}>Receipt of {Number(amount || applied.totalAllocated + applied.unapplied).toLocaleString()} applied across {applied.allocations.length} invoice(s){applied.unapplied > 0 ? ` — ${applied.unapplied.toLocaleString()} unapplied (over-payment)` : ''}.</p>}

      {result && (
        <>
          <h2 style={st.h2}>{applied ? 'Applied' : 'Preview'} — oldest first</h2>
          {result.allocations.length === 0 ? (
            <p style={st.muted}>Nothing to allocate.</p>
          ) : (
            <table style={st.table}>
              <thead><tr><th style={st.th}>Invoice</th><th style={st.thR}>Applied</th></tr></thead>
              <tbody>
                {result.allocations.map((a) => (
                  <tr key={a.invoiceId}>
                    <td style={st.td}><code>{a.invoiceNumber}</code></td>
                    <td style={st.tdR}>{a.amount.toLocaleString()}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ ...st.td, fontWeight: 700 }}>Total allocated</td>
                  <td style={{ ...st.tdR, fontWeight: 700 }}>{result.totalAllocated.toLocaleString()}</td>
                </tr>
                {result.unapplied > 0 && (
                  <tr>
                    <td style={{ ...st.td, color: 'var(--warn)' }}>Unapplied (over-payment)</td>
                    <td style={{ ...st.tdR, color: 'var(--warn)' }}>{result.unapplied.toLocaleString()}</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}

const st = {
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 10 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  hint: { color: 'var(--muted)', fontWeight: 400 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 140 } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  btnGhost: { padding: '8px 16px', borderRadius: 6, background: 'var(--panel-2)', color: 'inherit', border: '1px solid var(--border, #ccc)', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  err: { color: 'var(--bad)', margin: '6px 0 0', fontSize: 13 } as CSSProperties,
  ok: { color: 'var(--good)', margin: '6px 0 0', fontSize: 13 } as CSSProperties,
  h2: { fontSize: 18, margin: '18px 0 10px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '8px 0', fontSize: 14 } as CSSProperties,
  table: { width: '100%', maxWidth: 460, borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  thR: { textAlign: 'right' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
  tdR: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)', textAlign: 'right' as const } as CSSProperties,
};
