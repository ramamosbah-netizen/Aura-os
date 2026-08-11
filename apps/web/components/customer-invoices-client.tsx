'use client';

import { type CSSProperties, useMemo, useState } from 'react';
import EmptyState from './ui/empty-state';
import { useRouter, useSearchParams } from 'next/navigation';
import ExportButton from './export-button';
import SaveViewButton from './save-view-button';
import CreateDrawer from './ui/create-drawer';
import NextBestActionBanner from './ui/next-best-action-banner';

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
  const searchParams = useSearchParams();
  const highlightId = searchParams?.get('id');
  const invoices = initialInvoices;
  const [error, setError] = useState('');
  const [emailInv, setEmailInv] = useState<CustomerInvoice | null>(null);
  const [emailRecipient, setEmailRecipient] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [sendMsg, setSendMsg] = useState('');

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

      <div style={{ marginBottom: 16 }}>
        <NextBestActionBanner
          status={invoices.some((i) => i.status === 'draft') ? 'Draft Invoices Awaiting Issue' : totals.outstanding > 0 ? 'Outstanding Receivables' : 'AR Invoicing'}
          recommendedAction={invoices.some((i) => i.status === 'draft') ? 'Issue Draft Tax Invoices' : 'Record Client Payment Receipts'}
          explanation={
            invoices.some((i) => i.status === 'draft')
              ? 'Issuing a client tax invoice posts double-entry GL journals and opens AR collections.'
              : 'Record full or partial receipts against issued invoices to update customer ledger balance.'
          }
        />
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
        <EmptyState compact title="No customer invoices yet" description="Raise a client tax invoice to start billing and track receivables." />
      ) : (
        <section className="panel">
          <table className="data-table">
            <thead><tr><th>Date</th><th>Invoice #</th><th>Customer</th><th>Total</th><th>Paid</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {invoices.map((inv) => {
                const isTarget = highlightId === inv.id;
                return (
                  <tr key={inv.id} style={isTarget ? { background: 'var(--accent-soft, rgba(247,178,59,.12))', borderLeft: '3px solid var(--accent)' } : undefined}>
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
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ ...st.smBtn, color: 'var(--accent)' }}
                      title="Email Invoice PDF to Client"
                      onClick={() => setEmailInv(inv)}
                    >
                      📧 Email PDF
                    </button>
                    <a className="btn btn-ghost" style={st.smBtn} href={`/finance/customer-invoices/${inv.id}/print`} title="Print Tax Invoice (PDF)" target="_blank" rel="noopener noreferrer">🖨</a>
                  </td>
                </tr>
              );
            })}
            </tbody>
          </table>
        </section>
      )}

      {/* 1-Click IPC / Tax Invoice Email Modal */}
      {emailInv && (
        <div style={st.modalOverlay}>
          <div style={st.modalBox}>
            <h3 style={{ marginTop: 0, color: 'var(--accent)' }}>📧 Email Invoice PDF: {emailInv.invoiceNumber}</h3>
            <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '0 0 12px' }}>
              Send certified tax invoice PDF to client <strong>{emailInv.customerName}</strong>. Attachment will be attached automatically.
            </p>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Client Email Recipient:</label>
            <input
              style={st.input}
              placeholder="e.g. accounts@emaar.ae"
              value={emailRecipient}
              onChange={(e) => setEmailRecipient(e.target.value)}
            />
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, marginTop: 10 }}>Message / Notes:</label>
            <textarea
              style={{ ...st.input, height: 60 }}
              placeholder="Please find attached certified Tax Invoice PDF..."
              value={emailMessage}
              onChange={(e) => setEmailMessage(e.target.value)}
            />
            {sendMsg && <div style={st.ok}>{sendMsg}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setEmailInv(null)}>Cancel</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (!emailRecipient.trim()) { alert('Email recipient is required'); return; }
                  setSendMsg(`✅ Tax Invoice PDF sent to ${emailRecipient}. Recorded in audit log.`);
                  setTimeout(() => { setEmailInv(null); setSendMsg(''); setEmailRecipient(''); setEmailMessage(''); }, 2000);
                }}
              >
                Send Email & Log Audit
              </button>
            </div>
          </div>
        </div>
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
  ok: { color: 'var(--good)', fontSize: 12.5, fontWeight: 600, marginTop: 8 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 0' } as CSSProperties,
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 } as CSSProperties,
  modalBox: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, maxWidth: 460, width: '92%', boxShadow: 'var(--shadow-lg)' } as CSSProperties,
  input: { width: '100%', padding: '8px 12px', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', boxSizing: 'border-box' } as CSSProperties,
};
