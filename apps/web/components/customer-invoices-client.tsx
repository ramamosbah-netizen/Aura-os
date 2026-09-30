'use client';

import { type CSSProperties, Fragment, useMemo, useState } from 'react';
import EmptyState from './ui/empty-state';
import { useRouter, useSearchParams } from 'next/navigation';
import ExportButton from './export-button';
import SaveViewButton from './save-view-button';
import { CURRENCIES } from '@aura/shared';
import CreateDrawer from './ui/create-drawer';
import NextBestActionBanner from './ui/next-best-action-banner';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE, businessDateInputValue } from '@/lib/locale';

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

/** A customer receipt as its own record (AR-INV-02) — the invoice's Paid column is the sum of these. */
interface Receipt {
  id: string;
  amount: number;
  receivedOn: string | null;
  bankReference: string | null;
  recordedBy: string | null;
  recordedAt: string | null;
  legacy: boolean;
}

const badgeKind: Record<string, string> = { draft: 'badge', issued: 'badge badge-accent', partially_paid: 'badge badge-warn', paid: 'badge badge-good', cancelled: 'badge badge-bad' };
const today = () => businessDateInputValue();

export default function CustomerInvoicesClient({ initialInvoices }: { initialInvoices: CustomerInvoice[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = searchParams?.get('id');
  const invoices = initialInvoices;
  const [error, setError] = useState('');
  // A receipt is a record: amount, the date the money arrived, and the bank reference it reconciles to.
  const [receiptFor, setReceiptFor] = useState<string | null>(null);
  const [receiptForm, setReceiptForm] = useState({ amount: '', receivedOn: today(), bankReference: '' });
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, Receipt[] | { error: string }>>({});

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

  const loadReceipts = async (id: string) => {
    try {
      const res = await fetch(`/api/finance/customer-invoices/${id}/receipts`, { cache: 'no-store' });
      const data = await res.json();
      setHistory((h) => ({ ...h, [id]: res.ok && Array.isArray(data) ? (data as Receipt[]) : { error: data.message || data.error || 'Could not load receipts' } }));
    } catch (e) {
      setHistory((h) => ({ ...h, [id]: { error: (e as Error).message } }));
    }
  };

  const toggleHistory = (id: string) => {
    if (historyFor === id) { setHistoryFor(null); return; }
    setHistoryFor(id);
    void loadReceipts(id);
  };

  const openReceipt = (inv: CustomerInvoice) => {
    setError('');
    setReceiptFor(receiptFor === inv.id ? null : inv.id);
    setReceiptForm({ amount: (inv.total - inv.amountPaid).toFixed(2), receivedOn: today(), bankReference: '' });
  };

  const saveReceipt = async (inv: CustomerInvoice) => {
    setError('');
    setReceiptBusy(true);
    try {
      const res = await fetch(`/api/finance/customer-invoices/${inv.id}/receipts`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount: Number(receiptForm.amount), receivedOn: receiptForm.receivedOn, bankReference: receiptForm.bankReference }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed');
      setReceiptFor(null);
      setHistoryFor(inv.id);
      await loadReceipts(inv.id);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReceiptBusy(false);
    }
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
              // Not "posts double-entry GL journals": nothing posts an AR invoice or receipt to the ledger (AR-GL-01).
              ? 'Issuing a client tax invoice makes it a claim on the customer and opens AR collections.'
              : 'Record each receipt against an issued invoice with the date it arrived and its bank reference.'
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
            /**
             * A client invoice can be raised in a foreign currency (FX-01). Without this field the
             * screen could only ever produce AED, so the governed-rate refusal had nowhere to
             * appear — and the AR half of the remediation was unreachable by a real user.
             */
            {
              name: 'currency',
              label: 'Currency',
              kind: 'select',
              defaultValue: 'AED',
              hint: 'A non-AED invoice needs a governed rate for its issue date.',
              options: CURRENCIES.map((code) => ({ value: code, label: code })),
            },
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
                const receipts = history[inv.id];
                return (
                  <Fragment key={inv.id}>
                  <tr style={isTarget ? { background: 'var(--accent-soft, rgba(247,178,59,.12))', borderLeft: '3px solid var(--accent)' } : undefined}>
                    <td style={{ color: 'var(--muted)' }}>{inv.issueDate}</td>
                  <td style={{ fontWeight: 600 }}>{inv.invoiceNumber}</td>
                  <td>{inv.customerName}</td>
                  <td>{inv.total.toLocaleString()}</td>
                  <td style={{ color: 'var(--muted)' }}>{inv.amountPaid.toLocaleString()}</td>
                  <td><span className={badgeKind[inv.status] ?? 'badge'}>{inv.status.replace('_', ' ')}</span></td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    {inv.status === 'draft' && <button type="button" className="btn btn-primary" style={st.smBtn} onClick={() => act(inv.id, 'issue')}>Issue</button>}
                    {(inv.status === 'issued' || inv.status === 'partially_paid') && <button type="button" className="btn" style={{ ...st.smBtn, color: 'var(--good)' }} onClick={() => openReceipt(inv)}>Receipt</button>}
                    {inv.amountPaid > 0 && <button type="button" className="btn btn-ghost" style={st.smBtn} aria-expanded={historyFor === inv.id} onClick={() => toggleHistory(inv.id)}>Receipts</button>}
                    {inv.status === 'draft' && <button type="button" className="btn btn-ghost" style={{ ...st.smBtn, color: 'var(--bad)' }} onClick={() => act(inv.id, 'cancel')}>Cancel</button>}
                    {/* There was an "Email PDF" button here whose modal announced "Tax Invoice PDF sent to …
                        Recorded in audit log." after checking only that a recipient was typed: nothing was
                        sent and nothing was logged. AURA cannot email a client yet — its mail reaches AURA
                        users only and carries no attachment — so the honest act is the one that exists. */}
                    <a
                      className="btn btn-ghost"
                      style={st.smBtn}
                      href={`/finance/customer-invoices/${inv.id}/print`}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid={`print-invoice-${inv.id}`}
                      title="Open the tax invoice to print or save as PDF. AURA does not email invoices to clients yet — send the PDF from your own mail."
                    >
                      🖨 Print / PDF
                    </a>
                  </td>
                </tr>
                  {receiptFor === inv.id && (
                    <tr>
                      <td colSpan={7}>
                        <form data-testid={`receipt-form-${inv.id}`} style={st.receiptForm} onSubmit={(e) => { e.preventDefault(); void saveReceipt(inv); }}>
                          <strong style={{ fontSize: 13 }}>Record a receipt against {inv.invoiceNumber}</strong>
                          <label style={st.field}>Amount
                            <input style={st.input} type="number" step="0.01" min="0.01" required value={receiptForm.amount}
                              onChange={(e) => setReceiptForm((f) => ({ ...f, amount: e.target.value }))} />
                          </label>
                          <label style={st.field}>Received on
                            <input style={st.input} type="date" required value={receiptForm.receivedOn}
                              onChange={(e) => setReceiptForm((f) => ({ ...f, receivedOn: e.target.value }))} />
                          </label>
                          <label style={st.field}>Bank reference
                            <input style={st.input} required placeholder="Transfer id or cheque number" value={receiptForm.bankReference}
                              onChange={(e) => setReceiptForm((f) => ({ ...f, bankReference: e.target.value }))} />
                          </label>
                          <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
                            <button type="button" className="btn btn-ghost" style={st.smBtn} onClick={() => setReceiptFor(null)}>Cancel</button>
                            <button type="submit" className="btn btn-primary" style={st.smBtn} disabled={receiptBusy} aria-busy={receiptBusy}>{receiptBusy ? 'Saving…' : 'Record receipt'}</button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  )}
                  {historyFor === inv.id && (
                    <tr>
                      <td colSpan={7}>
                        <div data-testid={`receipts-${inv.id}`} style={st.history}>
                          {!receipts ? <p style={st.muted}>Loading receipts…</p>
                            : 'error' in receipts ? <p style={st.err}>{receipts.error}</p>
                              : receipts.length === 0 ? <p style={st.muted}>No receipts recorded.</p> : (
                                <table className="data-table">
                                  <thead><tr><th>Received on</th><th>Amount</th><th>Bank reference</th><th>Recorded by</th><th>Recorded at</th></tr></thead>
                                  <tbody>
                                    {receipts.map((r) => (
                                      <tr key={r.id} data-testid={`receipt-row-${r.id}`}>
                                        {r.legacy ? (
                                          <>
                                            <td style={{ color: 'var(--muted)' }}>—</td>
                                            <td>{r.amount.toLocaleString()}</td>
                                            <td colSpan={3} style={{ color: 'var(--muted)' }}>Recorded before receipts were kept one by one — the amount is all that was kept.</td>
                                          </>
                                        ) : (
                                          <>
                                            <td>{r.receivedOn}</td>
                                            <td>{r.amount.toLocaleString()}</td>
                                            <td>{r.bankReference}</td>
                                            <td>{r.recordedBy ?? '—'}</td>
                                            <td style={{ color: 'var(--muted)' }}>{r.recordedAt ? new Date(r.recordedAt).toLocaleString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE }) : '—'}</td>
                                          </>
                                        )}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
              );
            })}
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
  receiptForm: { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', padding: '10px 4px' } as CSSProperties,
  field: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 600, minWidth: 160 } as CSSProperties,
  history: { padding: '6px 4px 10px' } as CSSProperties,
  input: { width: '100%', padding: '8px 12px', background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', boxSizing: 'border-box' } as CSSProperties,
};
