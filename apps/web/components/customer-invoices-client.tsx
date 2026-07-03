'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ExportButton from './export-button';
import SaveViewButton from './save-view-button';
import CreateDrawer from './ui/create-drawer';

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

const badgeKind: Record<string, string> = { draft: 'badge', issued: 'badge badge-accent', partially_paid: 'badge badge-warn', paid: 'badge badge-good', cancelled: 'badge badge-bad' };
const today = () => new Date().toISOString().slice(0, 10);

export default function CustomerInvoicesClient({ initialInvoices }: { initialInvoices: CustomerInvoice[] }) {
  const router = useRouter();
  const invoices = initialInvoices;
  const [error, setError] = useState('');

  const totals = useMemo(() => {
    const issued = invoices.filter((i) => i.status !== 'draft' && i.status !== 'cancelled').reduce((s, i) => s + i.total, 0);
    const outstanding = invoices.filter((i) => i.status === 'issued' || i.status === 'partially_paid').reduce((s, i) => s + (i.total - i.amountPaid), 0);
    return { issued, outstanding };
  }, [invoices]);

  const act = async (id: string, action: 'issue' | 'receipts' | 'cancel', body?: object) => {
    setError('');
    try {
      const res = await fetch(`/api/finance/customer-invoices/${id}/${action}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      router.refresh();
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

      <div style={st.toolbar}>
        <CreateDrawer
          entity="Customer Invoice"
          subtitle="A client tax invoice (AR) with VAT line items. Issue it, then record receipts against it."
          endpoint="/api/finance/customer-invoices"
          fields={[
            { name: 'invoiceNumber', label: 'Invoice #', kind: 'text', required: true, placeholder: 'INV-001' },
            { name: 'issueDate', label: 'Issue date', kind: 'date', required: true, defaultValue: today() },
            { name: 'customerName', label: 'Customer', kind: 'text', required: true, placeholder: 'e.g. Emaar Properties' },
            { name: 'projectName', label: 'Project', kind: 'text', placeholder: '(optional)' },
            { name: 'lines', label: 'Line items', kind: 'lines', required: true },
          ]}
        />
        {error && <span style={st.err}>{error}</span>}
      </div>

      {invoices.length === 0 ? (
        <p style={st.muted}>No customer invoices yet — create the first one.</p>
      ) : (
        <section className="panel">
          <table className="data-table">
            <thead><tr><th>Date</th><th>Invoice #</th><th>Customer</th><th>Total</th><th>Paid</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td style={{ color: 'var(--muted)' }}>{inv.issueDate}</td>
                  <td style={{ fontWeight: 600 }}>{inv.invoiceNumber}</td>
                  <td>{inv.customerName}</td>
                  <td>{inv.total.toLocaleString()}</td>
                  <td style={{ color: 'var(--muted)' }}>{inv.amountPaid.toLocaleString()}</td>
                  <td><span className={badgeKind[inv.status] ?? 'badge'}>{inv.status.replace('_', ' ')}</span></td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    {inv.status === 'draft' && <button type="button" className="btn btn-primary" style={st.smBtn} onClick={() => act(inv.id, 'issue')}>Issue</button>}
                    {(inv.status === 'issued' || inv.status === 'partially_paid') && <button type="button" className="btn" style={{ ...st.smBtn, color: 'var(--good)' }} onClick={() => receipt(inv)}>Receipt</button>}
                    {inv.status === 'draft' && <button type="button" className="btn btn-ghost" style={{ ...st.smBtn, color: 'var(--bad)' }} onClick={() => act(inv.id, 'cancel')}>Cancel</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

const st = {
  cards: { display: 'flex', gap: 14, marginBottom: 18 } as CSSProperties,
  card: { padding: '14px 18px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--panel)', minWidth: 200 } as CSSProperties,
  cardLabel: { fontSize: 11.5, color: 'var(--muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5 } as CSSProperties,
  cardVal: { fontSize: 22, fontWeight: 700, marginTop: 4 } as CSSProperties,
  toolbar: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 } as CSSProperties,
  smBtn: { padding: '5px 12px', fontSize: 12.5 } as CSSProperties,
  err: { color: 'var(--bad)', fontSize: 13 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0' } as CSSProperties,
};
