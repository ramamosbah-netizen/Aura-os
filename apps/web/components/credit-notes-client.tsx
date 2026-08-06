'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import EmptyState from './ui/empty-state';

export interface CreditNote {
  id: string;
  creditNoteNumber: string;
  invoiceNumber: string | null;
  customerInvoiceId: string;
  customerName: string;
  reason: string;
  issueDate: string;
  subtotal: number;
  vatTotal: number;
  total: number;
  status: string;
}

export interface CreditableInvoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  subtotal: number;
  remainingNet: number;
}

const statusColor: Record<string, string> = { draft: 'var(--muted)', issued: 'var(--good)', cancelled: 'var(--bad)' };
const today = () => new Date().toISOString().slice(0, 10);

export default function CreditNotesClient({ initialNotes, invoices }: { initialNotes: CreditNote[]; invoices: CreditableInvoice[] }) {
  const [notes, setNotes] = useState(initialNotes);
  const [creditNoteNumber, setNumber] = useState('');
  const [customerInvoiceId, setInvoiceId] = useState('');
  const [reason, setReason] = useState('');
  const [net, setNet] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const selected = useMemo(() => invoices.find((i) => i.id === customerInvoiceId) ?? null, [invoices, customerInvoiceId]);

  const totals = useMemo(() => {
    const issued = notes.filter((n) => n.status === 'issued');
    return { count: notes.length, issuedValue: issued.reduce((s, n) => s + n.total, 0) };
  }, [notes]);

  const create = async () => {
    setError(''); setMsg('');
    if (!creditNoteNumber.trim()) return setError('Credit note number is required');
    if (!customerInvoiceId) return setError('Choose the invoice to credit');
    if (!(Number(net) > 0)) return setError('Credit amount (net) must be positive');
    try {
      const res = await fetch('/api/finance/credit-notes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          creditNoteNumber, customerInvoiceId, reason, issueDate: today(),
          lines: [{ description: reason || 'Credit', quantity: 1, unitPrice: Number(net), vatRate: 5 }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setNotes((prev) => [data, ...prev]);
      setNumber(''); setInvoiceId(''); setReason(''); setNet('');
      setMsg(`Credit note ${data.creditNoteNumber} drafted — issue it to post to the ledger.`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const act = async (id: string, action: 'issue' | 'cancel') => {
    setError(''); setMsg('');
    try {
      const res = await fetch(`/api/finance/credit-notes/${id}/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setNotes((prev) => prev.map((n) => (n.id === id ? data : n)));
      if (action === 'issue') setMsg(`Credit note ${data.creditNoteNumber} issued — revenue and the receivable reduced.`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <div style={st.cards}>
        <div style={st.card}><div style={st.cardLabel}>Credit notes</div><div style={st.cardVal}>{totals.count}</div></div>
        <div style={st.card}><div style={st.cardLabel}>Issued value</div><div style={st.cardVal}>{totals.issuedValue.toLocaleString()} AED</div></div>
      </div>

      <h2 style={st.h2}>New credit note</h2>
      {invoices.length === 0 ? (
        <p style={st.muted}>No issued invoices to credit yet. Raise and issue a customer invoice first.</p>
      ) : (
        <div style={st.form}>
          <label style={st.label}>Number<input style={st.input} value={creditNoteNumber} onChange={(e) => setNumber(e.target.value)} placeholder="CN-2026-001" /></label>
          <label style={st.label}>Invoice
            <select style={{ ...st.input, minWidth: 240 }} value={customerInvoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
              <option value="">Select invoice…</option>
              {invoices.map((i) => <option key={i.id} value={i.id}>{i.invoiceNumber} — {i.customerName} (net {i.subtotal.toLocaleString()})</option>)}
            </select>
          </label>
          <label style={st.label}>Reason<input style={st.input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Over-billing" /></label>
          <label style={st.label}>Amount (net){selected ? <span style={st.hint}> ≤ {selected.subtotal.toLocaleString()}</span> : null}
            <input style={st.input} type="number" min="0" value={net} onChange={(e) => setNet(e.target.value)} placeholder="0.00" />
          </label>
          <button style={st.btn} onClick={create}>Draft</button>
        </div>
      )}
      {error && <p style={st.err}>{error}</p>}
      {msg && <p style={st.ok}>{msg}</p>}

      <h2 style={st.h2}>Credit notes</h2>
      {notes.length === 0 ? (
        <EmptyState compact title="No credit notes yet" description="Credit an issued invoice to reverse revenue and reduce the receivable." />
      ) : (
        <table style={st.table}>
          <thead><tr><th style={st.th}>Number</th><th style={st.th}>Invoice</th><th style={st.th}>Customer</th><th style={st.th}>Reason</th><th style={st.thR}>Net</th><th style={st.thR}>Total</th><th style={st.th}>Status</th><th style={st.th}>Actions</th></tr></thead>
          <tbody>
            {notes.map((n) => (
              <tr key={n.id}>
                <td style={st.td}><code>{n.creditNoteNumber}</code></td>
                <td style={st.td}>{n.invoiceNumber ?? '—'}</td>
                <td style={st.td}>{n.customerName}</td>
                <td style={st.td}>{n.reason || '—'}</td>
                <td style={st.tdR}>{n.subtotal.toLocaleString()}</td>
                <td style={st.tdR}>{n.total.toLocaleString()}</td>
                <td style={{ ...st.td, color: statusColor[n.status] || 'inherit', fontWeight: 600 }}>{n.status}</td>
                <td style={st.td}>
                  {n.status === 'draft' && <button style={st.smGreen} onClick={() => act(n.id, 'issue')}>Issue</button>}
                  {n.status === 'draft' && <button style={st.smGray} onClick={() => act(n.id, 'cancel')}>Cancel</button>}
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
  hint: { color: 'var(--muted)', fontWeight: 400 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 120 } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  smGreen: { padding: '4px 10px', borderRadius: 4, background: 'var(--good)', color: 'var(--accent-ink)', border: 'none', fontSize: 12, cursor: 'pointer', marginRight: 4 } as CSSProperties,
  smGray: { padding: '4px 10px', borderRadius: 4, background: 'var(--panel-2)', color: 'inherit', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  err: { color: 'var(--bad)', margin: '6px 0 0', fontSize: 13 } as CSSProperties,
  ok: { color: 'var(--good)', margin: '6px 0 0', fontSize: 13 } as CSSProperties,
  h2: { fontSize: 20, margin: '18px 0 10px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '8px 0', fontSize: 14 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  thR: { textAlign: 'right' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
  tdR: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)', textAlign: 'right' as const } as CSSProperties,
};
