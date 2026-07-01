'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import ExportButton from './export-button';
import SaveViewButton from './save-view-button';

interface Line {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  lineNet: number;
  lineVat: number;
}

interface CustomerInvoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  projectName: string | null;
  issueDate: string;
  subtotal: number;
  vatTotal: number;
  total: number;
  amountPaid: number;
  status: string;
  lines: Line[];
}

interface DraftLine {
  description: string;
  quantity: string;
  unitPrice: string;
  vatRate: string;
}

const statusColor: Record<string, string> = { draft: '#6b7280', issued: '#2563eb', partially_paid: '#d97706', paid: '#16a34a', cancelled: '#dc2626' };
const today = () => new Date().toISOString().slice(0, 10);
const emptyLine = (): DraftLine => ({ description: '', quantity: '1', unitPrice: '', vatRate: '5' });

export default function CustomerInvoicesClient({ initialInvoices }: { initialInvoices: CustomerInvoice[] }) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [issueDate, setIssueDate] = useState(today());
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [error, setError] = useState('');

  const totals = useMemo(() => {
    const issued = invoices.filter((i) => i.status !== 'draft' && i.status !== 'cancelled').reduce((s, i) => s + i.total, 0);
    const outstanding = invoices.filter((i) => i.status === 'issued' || i.status === 'partially_paid').reduce((s, i) => s + (i.total - i.amountPaid), 0);
    return { issued, outstanding };
  }, [invoices]);

  const preview = useMemo(() => {
    let net = 0, vat = 0;
    for (const l of lines) {
      const q = Number(l.quantity), p = Number(l.unitPrice), r = Number(l.vatRate);
      if (q > 0 && p >= 0) { const ln = q * p; net += ln; vat += ln * (r / 100); }
    }
    return { net: Math.round(net * 100) / 100, vat: Math.round(vat * 100) / 100, total: Math.round((net + vat) * 100) / 100 };
  }, [lines]);

  const setLine = (i: number, key: keyof DraftLine, val: string) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [key]: val } : l)));

  const create = async () => {
    setError('');
    if (!invoiceNumber.trim() || !customerName.trim()) return setError('Invoice number and customer are required');
    const payloadLines = lines
      .filter((l) => l.description.trim() && Number(l.quantity) > 0)
      .map((l) => ({ description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), vatRate: Number(l.vatRate) }));
    if (payloadLines.length === 0) return setError('Add at least one valid line item');
    try {
      const res = await fetch('/api/finance/customer-invoices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ invoiceNumber, customerName, projectName: projectName || undefined, issueDate, lines: payloadLines }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setInvoices((prev) => [data, ...prev]);
      setInvoiceNumber(''); setCustomerName(''); setProjectName(''); setLines([emptyLine()]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const act = async (id: string, action: 'issue' | 'receipts' | 'cancel', body?: object) => {
    setError('');
    try {
      const res = await fetch(`/api/finance/customer-invoices/${id}/${action}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setInvoices((prev) => prev.map((i) => (i.id === id ? data : i)));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const receipt = (inv: CustomerInvoice) => {
    const remaining = (inv.total - inv.amountPaid).toFixed(2);
    const amt = prompt(`Receipt amount (outstanding ${remaining} AED):`, remaining);
    if (amt && Number(amt) > 0) act(inv.id, 'receipts', { amount: Number(amt) });
  };

  return (
    <>
      <div style={st.cards}>
        <div style={st.card}><div style={st.cardLabel}>Issued (total)</div><div style={st.cardVal}>{totals.issued.toLocaleString()} AED</div></div>
        <div style={st.card}><div style={st.cardLabel}>Outstanding receivable</div><div style={st.cardVal}>{totals.outstanding.toLocaleString()} AED</div></div>
        <div style={{ marginLeft: 'auto', alignSelf: 'center', display: 'flex', gap: 8 }}>
          <SaveViewButton />
          <ExportButton filename="customer-invoices" rows={invoices as unknown as Array<Record<string, unknown>>}
            columns={[{ key: 'invoiceNumber' }, { key: 'customerName' }, { key: 'issueDate' }, { key: 'currency' }, { key: 'total' }, { key: 'amountPaid' }, { key: 'status' }]} />
        </div>
      </div>

      <h2 style={st.h2}>New invoice</h2>
      <div style={st.form}>
        <label style={st.label}>Invoice #<input style={st.input} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-001" /></label>
        <label style={st.label}>Customer<input style={st.input} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Acme LLC" /></label>
        <label style={st.label}>Project<input style={st.input} value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="(optional)" /></label>
        <label style={st.label}>Issue date<input style={st.input} type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></label>
      </div>

      <table style={st.table}>
        <thead><tr><th style={st.th}>Description</th><th style={st.th}>Qty</th><th style={st.th}>Unit price</th><th style={st.th}>VAT %</th><th style={st.th}>Net</th><th style={st.th}></th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td style={st.td}><input style={{ ...st.input, minWidth: 220 }} value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} placeholder="Supply & install…" /></td>
              <td style={st.td}><input style={{ ...st.input, width: 70 }} type="number" min="0" value={l.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} /></td>
              <td style={st.td}><input style={{ ...st.input, width: 100 }} type="number" min="0" value={l.unitPrice} onChange={(e) => setLine(i, 'unitPrice', e.target.value)} /></td>
              <td style={st.td}><input style={{ ...st.input, width: 70 }} type="number" min="0" value={l.vatRate} onChange={(e) => setLine(i, 'vatRate', e.target.value)} /></td>
              <td style={st.td}>{(Number(l.quantity) * Number(l.unitPrice) || 0).toLocaleString()}</td>
              <td style={st.td}>{lines.length > 1 && <button style={st.smRed} onClick={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}>✕</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <button style={st.smGray} onClick={() => setLines((prev) => [...prev, emptyLine()])}>+ Add line</button>
        <div style={{ fontSize: 14 }}>Net <b>{preview.net.toLocaleString()}</b> · VAT <b>{preview.vat.toLocaleString()}</b> · Total <b>{preview.total.toLocaleString()} AED</b></div>
      </div>
      <div style={{ marginTop: 12 }}>
        <button style={st.btn} onClick={create}>Create draft</button>
        {error && <span style={st.err}>{error}</span>}
      </div>

      <h2 style={st.h2}>Invoices</h2>
      {invoices.length === 0 ? (
        <p style={st.muted}>No customer invoices yet.</p>
      ) : (
        <table style={st.table}>
          <thead><tr><th style={st.th}>Date</th><th style={st.th}>Invoice #</th><th style={st.th}>Customer</th><th style={st.th}>Total</th><th style={st.th}>Paid</th><th style={st.th}>Status</th><th style={st.th}>Actions</th></tr></thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td style={st.td}>{inv.issueDate}</td>
                <td style={st.td}>{inv.invoiceNumber}</td>
                <td style={st.td}>{inv.customerName}</td>
                <td style={st.td}>{inv.total.toLocaleString()}</td>
                <td style={st.td}>{inv.amountPaid.toLocaleString()}</td>
                <td style={{ ...st.td, color: statusColor[inv.status] || '#000', fontWeight: 600 }}>{inv.status.replace('_', ' ')}</td>
                <td style={st.td}>
                  {inv.status === 'draft' && <button style={st.sm} onClick={() => act(inv.id, 'issue')}>Issue</button>}
                  {(inv.status === 'issued' || inv.status === 'partially_paid') && <button style={st.smGreen} onClick={() => receipt(inv)}>Receipt</button>}
                  {(inv.status === 'draft') && <button style={st.smRed} onClick={() => act(inv.id, 'cancel')}>Cancel</button>}
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
  card: { padding: '12px 18px', borderRadius: 8, border: '1px solid var(--border, #e5e7eb)', minWidth: 180 } as CSSProperties,
  cardLabel: { fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5 } as CSSProperties,
  cardVal: { fontSize: 22, fontWeight: 700, marginTop: 4 } as CSSProperties,
  form: { display: 'flex', flexWrap: 'wrap' as const, gap: 12, alignItems: 'flex-end', marginBottom: 14 } as CSSProperties,
  label: { display: 'flex', flexDirection: 'column' as const, fontSize: 13, fontWeight: 600, gap: 4 } as CSSProperties,
  input: { padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border, #ccc)', fontSize: 14, minWidth: 130 } as CSSProperties,
  btn: { padding: '8px 18px', borderRadius: 6, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 } as CSSProperties,
  sm: { padding: '4px 10px', borderRadius: 4, background: 'var(--accent, #2563eb)', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', marginRight: 4 } as CSSProperties,
  smGray: { padding: '5px 12px', borderRadius: 4, background: 'var(--surface-2, #e5e7eb)', color: 'inherit', border: 'none', fontSize: 13, cursor: 'pointer' } as CSSProperties,
  smGreen: { padding: '4px 10px', borderRadius: 4, background: '#16a34a', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer', marginRight: 4 } as CSSProperties,
  smRed: { padding: '4px 10px', borderRadius: 4, background: '#dc2626', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer' } as CSSProperties,
  err: { color: '#dc2626', marginLeft: 12, fontSize: 13 } as CSSProperties,
  h2: { fontSize: 20, margin: '18px 0 10px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left' as const, padding: '8px 12px', borderBottom: '2px solid var(--border, #e5e7eb)', fontWeight: 600 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)' } as CSSProperties,
};
