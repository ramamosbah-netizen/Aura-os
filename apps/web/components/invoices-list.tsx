'use client';

import { type CSSProperties, useState } from 'react';
import { useRouter } from 'next/navigation';
import { InvoiceEdit } from './invoice-create';

interface Invoice {
  id: string;
  title: string;
  poId: string | null;
  poTitle: string | null;
  supplierName: string | null;
  projectName: string | null;
  status: string;
  value: number;
  createdAt: string;
}

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface PurchaseOrder {
  id: string;
  title: string;
  status: string;
  value: number;
}

interface GoodsReceipt {
  id: string;
  poId: string | null;
  status: string;
  value: number;
}

function money(n: number): string {
  return typeof n === 'number' ? '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export default function InvoicesList({
  invoices,
  bankAccounts,
  pos,
  grns,
}: {
  invoices: Invoice[];
  bankAccounts: Account[];
  pos: PurchaseOrder[];
  grns: GoodsReceipt[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Payment Form State
  const [payingInvoiceId, setPayingInvoiceId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [selectedBankId, setSelectedBankId] = useState('');
  const [payRef, setPayRef] = useState('');

  // Default to first bank account if available
  const activeBankId = selectedBankId || (bankAccounts && bankAccounts[0]?.id) || 'default-cash';
  const activeBank = bankAccounts?.find((b) => b.id === activeBankId) || {
    id: 'default-cash',
    code: '1010',
    name: 'Main Bank Account (Auto)',
  };

  async function updateStatus(id: string, status: string) {
    setBusyId(id);
    setErr(null);
    try {
      const res = await fetch(`/api/finance/invoices/${id}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? 'Error updating status');
      } else {
        router.refresh();
      }
    } catch {
      setErr('Failed to update invoice status.');
    } finally {
      setBusyId(null);
    }
  }

  async function submitPayment(invoiceId: string) {
    const amt = Number(payAmount);
    if (isNaN(amt) || amt <= 0) {
      setErr('Please enter a valid positive payment amount.');
      return;
    }

    setBusyId(`pay-${invoiceId}`);
    setErr(null);
    try {
      const res = await fetch('/api/finance/payments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          invoiceId,
          bankAccountId: activeBank.id === 'default-cash' ? '1010' : activeBank.id,
          amount: amt,
          reference: payRef.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? 'Error posting payment');
      } else {
        setPayingInvoiceId(null);
        setPayAmount('');
        setPayRef('');
        router.refresh();
      }
    } catch {
      setErr('Failed to record payment.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={s.container}>
      {err && <div style={s.errorBar}>{err}</div>}

      <div style={s.panel}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Invoice</th>
              <th style={s.th}>Against PO</th>
              <th style={s.th}>Supplier</th>
              <th style={s.th}>Project</th>
              <th style={s.th}>3-Way Match</th>
              <th style={s.th}>Status</th>
              <th style={s.th}>Value</th>
              <th style={s.th}>Created</th>
              <th style={s.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const isPaying = payingInvoiceId === inv.id;
              const isBusy = busyId === inv.id || busyId === `pay-${inv.id}`;

              // 3-Way Match Calculations
              const linkedPo = inv.poId ? pos.find((p) => p.id === inv.poId) : null;
              const linkedGrns = inv.poId ? grns.filter((g) => g.poId === inv.poId && g.status === 'received') : [];
              const totalGrnValue = linkedGrns.reduce((sum, g) => sum + g.value, 0);

              const hasPo = !!linkedPo;
              const poMatch = hasPo && inv.value === linkedPo.value;
              const grnMatch = hasPo && inv.value === totalGrnValue;
              const matchOk = poMatch && grnMatch;

              return (
                <>
                  <tr key={inv.id} style={isPaying ? s.rowSelected : s.row}>
                    <td style={s.td}>
                      <a
                        href={`/finance/invoices/${inv.id}`}
                        style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
                      >
                        {inv.title}
                      </a>
                    </td>
                    <td style={s.tdMuted}>{inv.poTitle ?? '—'}</td>
                    <td style={s.tdMuted}>{inv.supplierName ?? '—'}</td>
                    <td style={s.tdMuted}>{inv.projectName ?? '—'}</td>
                    <td style={s.td}>
                      {hasPo ? (
                        <span style={s.matchTag(matchOk)}>
                          {matchOk ? 'PASSED ✓' : 'MISMATCH ⚠'}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={s.td}>
                      <span style={s.tag(inv.status)}>{inv.status}</span>
                    </td>
                    <td style={s.td}>{money(inv.value)}</td>
                    <td style={s.tdMuted}>{fmt(inv.createdAt)}</td>
                    <td style={s.td}>
                      <div style={s.actions}>
                        {inv.status === 'draft' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => updateStatus(inv.id, 'approved')}
                            style={s.btnAccent}
                          >
                            Approve
                          </button>
                        )}
                        {inv.status === 'approved' && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => {
                              setPayingInvoiceId(isPaying ? null : inv.id);
                              setPayAmount(String(inv.value));
                              setPayRef('');
                            }}
                            style={s.btnSecondary}
                          >
                            Record Payment
                          </button>
                        )}
                        {inv.status === 'paid' && (
                          <span style={{ color: 'var(--good)', fontSize: 13 }}>✓ Paid</span>
                        )}
                        <InvoiceEdit invoice={inv} />
                      </div>
                    </td>
                  </tr>

                  {/* Expanded 3-Way Match Verification Card */}
                  {hasPo && (
                    <tr key={`match-audit-${inv.id}`} style={s.auditBg}>
                      <td colSpan={9} style={s.auditCell}>
                        <div style={s.auditContainer}>
                          <h4 style={s.auditTitle}>3-Way Matching Auditor</h4>
                          <div style={s.auditGrid}>
                            <div style={s.auditCard(poMatch)}>
                              <span style={s.auditLabel}>1. Purchase Order commitment</span>
                              <span style={s.auditVal}>{linkedPo ? money(linkedPo.value) : '—'}</span>
                              <span style={s.auditStatus(poMatch)}>{poMatch ? 'Matches Invoice ✓' : 'Discrepancy ⚠'}</span>
                            </div>
                            <div style={s.auditCard(grnMatch)}>
                              <span style={s.auditLabel}>2. Inventory goods received (GRN)</span>
                              <span style={s.auditVal}>{money(totalGrnValue)}</span>
                              <span style={s.auditStatus(grnMatch)}>{grnMatch ? 'Matches Invoice ✓' : 'Discrepancy ⚠'}</span>
                            </div>
                            <div style={s.auditCard(true)}>
                              <span style={s.auditLabel}>3. Supplier invoice billed</span>
                              <span style={s.auditVal}>{money(inv.value)}</span>
                              <span style={s.auditStatus(true)}>Reference Invoice ✓</span>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}

                  {/* Inline Payment Form & Double-Entry Preview */}
                  {isPaying && (
                    <tr key={`pay-form-${inv.id}`} style={s.expandedBg}>
                      <td colSpan={9} style={s.expandedCell}>
                        <div style={s.payFormContainer}>
                          <h4 style={{ margin: '0 0 10px 0', fontSize: 13.5, color: 'var(--accent)' }}>
                            Register Cash / Bank Payment
                          </h4>

                          <div style={s.fieldsGrid}>
                            <div style={s.fieldGroup}>
                              <label style={s.label}>Payment Amount ($)</label>
                              <input
                                style={s.input}
                                value={payAmount}
                                onChange={(e) => setPayAmount(e.target.value)}
                                placeholder="Amount"
                                inputMode="numeric"
                              />
                            </div>

                            <div style={s.fieldGroup}>
                              <label style={s.label}>Bank / Cash Account</label>
                              <select
                                style={s.select}
                                value={activeBankId}
                                onChange={(e) => setSelectedBankId(e.target.value)}
                              >
                                {bankAccounts.length === 0 ? (
                                  <option value="default-cash">Main Cash Account (Auto-Created)</option>
                                ) : (
                                  bankAccounts.map((b) => (
                                    <option key={b.id} value={b.id}>
                                      {b.code} — {b.name}
                                    </option>
                                  ))
                                )}
                              </select>
                            </div>

                            <div style={s.fieldGroup}>
                              <label style={s.label}>Payment Reference (Optional)</label>
                              <input
                                style={s.input}
                                value={payRef}
                                onChange={(e) => setPayRef(e.target.value)}
                                placeholder="e.g. EFT-98124, CHK-102"
                              />
                            </div>
                          </div>

                          {/* BALANCED DOUBLE-ENTRY PREVIEW */}
                          <div style={s.previewPanel}>
                            <div style={s.previewHeader}>
                              <span>Balanced Double-Entry Preview</span>
                              <span style={s.balancedTag}>Balanced ✓</span>
                            </div>
                            <table style={s.previewTable}>
                              <thead>
                                <tr>
                                  <th style={s.previewTh}>GL Account</th>
                                  <th style={s.previewThAlignRight}>Debit</th>
                                  <th style={s.previewThAlignRight}>Credit</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td style={s.previewTd}>2010 — Accounts Payable (Liability)</td>
                                  <td style={s.previewTdAlignRight}>{money(Number(payAmount) || 0)}</td>
                                  <td style={s.previewTdAlignRight}>$0.00</td>
                                </tr>
                                <tr>
                                  <td style={s.previewTd}>
                                    {activeBank.code} — {activeBank.name} (Asset)
                                  </td>
                                  <td style={s.previewTdAlignRight}>$0.00</td>
                                  <td style={s.previewTdAlignRight}>{money(Number(payAmount) || 0)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                            <button
                              type="button"
                              onClick={() => submitPayment(inv.id)}
                              disabled={isBusy || !payAmount}
                              style={s.btnAccent}
                            >
                              Confirm Payment
                            </button>
                            <button
                              type="button"
                              onClick={() => setPayingInvoiceId(null)}
                              style={s.btnSecondary}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const s = {
  container: { display: 'flex', flexDirection: 'column', gap: 12 } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '8px 8px' } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 } as CSSProperties,
  th: {
    textAlign: 'left',
    color: 'var(--muted)',
    fontWeight: 500,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,
  td: { padding: '11px 12px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' } as CSSProperties,
  tdMuted: { padding: '11px 12px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', verticalAlign: 'middle' } as CSSProperties,
  row: { borderBottom: '1px solid var(--border)' } as CSSProperties,
  rowSelected: { background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border)' } as CSSProperties,
  actions: { display: 'flex', gap: 8, alignItems: 'center' } as CSSProperties,
  btnAccent: {
    background: 'var(--accent)',
    color: '#0b0e14',
    fontWeight: 600,
    border: 'none',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12.5,
    cursor: 'pointer',
  } as CSSProperties,
  btnSecondary: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12.5,
    cursor: 'pointer',
  } as CSSProperties,
  tag: (status: string): CSSProperties => {
    let color = 'var(--muted)';
    let border = '1px solid var(--border)';
    let background = 'var(--panel-2)';
    if (status === 'approved') {
      color = 'var(--good)';
      border = '1px solid rgba(40,167,69,0.2)';
      background = 'rgba(40,167,69,0.05)';
    } else if (status === 'paid') {
      color = 'var(--accent)';
      border = '1px solid rgba(255,193,7,0.2)';
      background = 'rgba(255,193,7,0.05)';
    }
    return {
      fontSize: 11.5,
      fontWeight: 500,
      background,
      border,
      color,
      borderRadius: 6,
      padding: '2px 6px',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    };
  },
  matchTag: (ok: boolean): CSSProperties => ({
    fontSize: 11,
    fontWeight: 600,
    background: ok ? 'rgba(40,167,69,0.05)' : 'rgba(220,53,69,0.05)',
    border: ok ? '1px solid rgba(40,167,69,0.2)' : '1px solid rgba(220,53,69,0.2)',
    color: ok ? 'var(--good)' : 'red',
    borderRadius: 6,
    padding: '2px 6px',
  }),
  errorBar: {
    background: 'rgba(220,53,69,0.1)',
    border: '1px solid rgba(220,53,69,0.2)',
    color: '#dc3545',
    padding: '10px 14px',
    borderRadius: 10,
    fontSize: 13,
    marginBottom: 10,
  } as CSSProperties,
  expandedBg: { background: 'rgba(0,0,0,0.12)' } as CSSProperties,
  expandedCell: { padding: '14px 20px', borderBottom: '1px solid var(--border)' } as CSSProperties,
  payFormContainer: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '14px 16px',
    maxWidth: 650,
  } as CSSProperties,
  fieldsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 } as CSSProperties,
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 4 } as CSSProperties,
  label: { fontSize: 11, color: 'var(--muted)', fontWeight: 500 } as CSSProperties,
  input: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    padding: '7px 10px',
    fontSize: 13,
    outline: 'none',
  } as CSSProperties,
  select: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    padding: '6px 10px',
    fontSize: 13,
    outline: 'none',
  } as CSSProperties,
  previewPanel: {
    background: 'rgba(0,0,0,0.15)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '10px 12px',
  } as CSSProperties,
  previewHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, color: 'var(--muted)', marginBottom: 8 } as CSSProperties,
  balancedTag: { color: 'var(--good)', fontWeight: 600, background: 'rgba(40,167,69,0.08)', borderRadius: 4, padding: '1px 5px', fontSize: 10.5 } as CSSProperties,
  previewTable: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 } as CSSProperties,
  previewTh: { textAlign: 'left', color: 'var(--muted)', paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.05)' } as CSSProperties,
  previewThAlignRight: { textAlign: 'right', color: 'var(--muted)', paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.05)' } as CSSProperties,
  previewTd: { padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' } as CSSProperties,
  previewTdAlignRight: { textAlign: 'right', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' } as CSSProperties,

  // Audit styles
  auditBg: { background: 'rgba(0,0,0,0.06)', borderBottom: '1px solid rgba(255,255,255,0.02)' } as CSSProperties,
  auditCell: { padding: '10px 12px 14px' } as CSSProperties,
  auditContainer: {
    background: 'rgba(0,0,0,0.1)',
    border: '1px solid rgba(255,255,255,0.04)',
    borderRadius: 10,
    padding: '10px 12px',
  } as CSSProperties,
  auditTitle: { margin: '0 0 8px 0', fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 } as CSSProperties,
  auditGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 } as CSSProperties,
  auditCard: (ok: boolean): CSSProperties => ({
    background: 'var(--panel)',
    border: ok ? '1px solid rgba(40,167,69,0.1)' : '1px solid rgba(220,53,69,0.15)',
    borderRadius: 8,
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  }),
  auditLabel: { fontSize: 10.5, color: 'var(--muted)' } as CSSProperties,
  auditVal: { fontSize: 14, fontWeight: 700 } as CSSProperties,
  auditStatus: (ok: boolean): CSSProperties => ({
    fontSize: 10,
    fontWeight: 500,
    color: ok ? 'var(--good)' : 'red',
  }),
};
