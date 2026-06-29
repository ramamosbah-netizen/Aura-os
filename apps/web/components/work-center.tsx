'use client';

import { type CSSProperties, useState } from 'react';
import { useRouter } from 'next/navigation';

interface PurchaseRequest {
  id: string;
  title: string;
  reference: string | null;
  projectName: string | null;
  status: 'draft' | 'approved' | 'rejected';
  value: number;
}

interface Invoice {
  id: string;
  title: string;
  poTitle: string | null;
  projectName: string | null;
  status: string;
  value: number;
}

interface Subcontract {
  id: string;
  title: string;
  subcontractorName: string;
  projectName: string | null;
  status: string;
  value: number;
}

interface Claim {
  id: string;
  subcontractId: string;
  subcontractTitle?: string;
  workCompletedValue: number;
  certifiedValue: number | null;
  status: string;
  createdAt: string;
}

interface BankAccount {
  id: string;
  code: string;
  name: string;
}

interface ActionableItem {
  id: string;
  module: 'Procurement' | 'Finance' | 'Subcontract' | 'Subcontract Claim';
  title: string;
  detail: string;
  value: number;
  status: string;
  actionType: 'approve_pr' | 'approve_inv' | 'pay_inv' | 'activate_sub' | 'certify_claim' | 'pay_claim';
  rawObject: any;
}

function money(n: number): string {
  return typeof n === 'number' ? '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—';
}

export default function WorkCenter({
  purchaseRequests,
  invoices,
  subcontracts,
  claims,
  bankAccounts,
}: {
  purchaseRequests: PurchaseRequest[];
  invoices: Invoice[];
  subcontracts: Subcontract[];
  claims: Claim[];
  bankAccounts: BankAccount[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'procurement' | 'finance' | 'subcontracts'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Compile actionable items
  const items: ActionableItem[] = [];

  // 1. Draft PRs
  (purchaseRequests ?? []).forEach((pr) => {
    if (pr.status === 'draft') {
      items.push({
        id: pr.id,
        module: 'Procurement',
        title: pr.title,
        detail: `Project: ${pr.projectName ?? '—'} | Ref: ${pr.reference ?? '—'}`,
        value: pr.value,
        status: pr.status,
        actionType: 'approve_pr',
        rawObject: pr,
      });
    }
  });

  // 2. Invoices
  (invoices ?? []).forEach((inv) => {
    if (inv.status === 'draft') {
      items.push({
        id: inv.id,
        module: 'Finance',
        title: `Invoice: ${inv.title}`,
        detail: `Project: ${inv.projectName ?? '—'} | Against PO: ${inv.poTitle ?? '—'}`,
        value: inv.value,
        status: inv.status,
        actionType: 'approve_inv',
        rawObject: inv,
      });
    } else if (inv.status === 'approved') {
      items.push({
        id: inv.id,
        module: 'Finance',
        title: `Invoice: ${inv.title}`,
        detail: `Project: ${inv.projectName ?? '—'} | Ready for general ledger pay`,
        value: inv.value,
        status: inv.status,
        actionType: 'pay_inv',
        rawObject: inv,
      });
    }
  });

  // 3. Draft Subcontracts
  (subcontracts ?? []).forEach((sub) => {
    if (sub.status === 'draft') {
      items.push({
        id: sub.id,
        module: 'Subcontract',
        title: sub.title,
        detail: `Subcontractor: ${sub.subcontractorName} | Project: ${sub.projectName ?? '—'}`,
        value: sub.value,
        status: sub.status,
        actionType: 'activate_sub',
        rawObject: sub,
      });
    }
  });

  // 4. Claims (IPC)
  (claims ?? []).forEach((cl) => {
    // Find subcontract
    const sub = subcontracts?.find((s) => s.id === cl.subcontractId);
    const subTitle = sub ? sub.title : `Subcontract ID: ${cl.subcontractId.slice(0, 8)}`;

    if (cl.status === 'draft') {
      items.push({
        id: cl.id,
        module: 'Subcontract Claim',
        title: `Progressive Claim: ${subTitle}`,
        detail: `Work Completed: ${money(cl.workCompletedValue)} | Pending Certification`,
        value: cl.workCompletedValue,
        status: cl.status,
        actionType: 'certify_claim',
        rawObject: { ...cl, subTitle },
      });
    } else if (cl.status === 'certified') {
      items.push({
        id: cl.id,
        module: 'Subcontract Claim',
        title: `Progressive Claim: ${subTitle}`,
        detail: `Certified Amount: ${money(cl.certifiedValue ?? cl.workCompletedValue)} | Ready to Pay`,
        value: cl.certifiedValue ?? cl.workCompletedValue,
        status: cl.status,
        actionType: 'pay_claim',
        rawObject: { ...cl, subTitle },
      });
    }
  });

  // Apply filters
  const filteredItems = items.filter((item) => {
    if (filter === 'procurement') return item.module === 'Procurement';
    if (filter === 'finance') return item.module === 'Finance';
    if (filter === 'subcontracts') return item.module === 'Subcontract' || item.module === 'Subcontract Claim';
    return true;
  });

  // Action Executers
  async function runAction(itemId: string, actionType: ActionableItem['actionType'], extra: any = {}) {
    setBusyId(itemId);
    setErr(null);
    try {
      let url = '';
      let method = 'POST';
      let payload: any = {};

      if (actionType === 'approve_pr') {
        url = `/api/procurement/purchase-requests/${itemId}/status`;
        method = 'PATCH';
        payload = { status: extra.status ?? 'approved' };
      } else if (actionType === 'approve_inv') {
        url = `/api/finance/invoices/${itemId}/status`;
        method = 'PATCH';
        payload = { status: 'approved' };
      } else if (actionType === 'pay_inv') {
        url = `/api/finance/payments`;
        method = 'POST';
        const defaultBank = bankAccounts && bankAccounts[0]?.id ? bankAccounts[0].id : '1010';
        payload = {
          invoiceId: itemId,
          bankAccountId: defaultBank,
          amount: extra.value,
          reference: 'WORK-CENTER-PAY',
        };
      } else if (actionType === 'activate_sub') {
        url = `/api/subcontracts/${itemId}/status`;
        method = 'PATCH';
        payload = { status: 'active' };
      } else if (actionType === 'certify_claim') {
        url = `/api/subcontracts/claims/${itemId}/certify`;
        method = 'POST';
        payload = { certifiedValue: extra.value };
      } else if (actionType === 'pay_claim') {
        url = `/api/subcontracts/claims/${itemId}/pay`;
        method = 'POST';
        payload = {};
      }

      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? 'Failed to execute work action.');
      } else {
        router.refresh();
      }
    } catch {
      setErr('Connection error executing workflow action.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={s.container}>
      {err && <div style={s.error}>{err}</div>}

      <div style={s.filterHeader}>
        <div style={s.tabs}>
          <button style={filter === 'all' ? s.tabActive : s.tab} onClick={() => setFilter('all')}>
            All Actions ({items.length})
          </button>
          <button style={filter === 'procurement' ? s.tabActive : s.tab} onClick={() => setFilter('procurement')}>
            Procurement ({items.filter((i) => i.module === 'Procurement').length})
          </button>
          <button style={filter === 'finance' ? s.tabActive : s.tab} onClick={() => setFilter('finance')}>
            Finance Invoices ({items.filter((i) => i.module === 'Finance').length})
          </button>
          <button style={filter === 'subcontracts' ? s.tabActive : s.tab} onClick={() => setFilter('subcontracts')}>
            Subcontracts & Claims ({items.filter((i) => i.module === 'Subcontract' || i.module === 'Subcontract Claim').length})
          </button>
        </div>
      </div>

      <div style={s.panel}>
        {filteredItems.length === 0 ? (
          <div style={s.empty}>All caught up! No approvals or pending tasks in this category.</div>
        ) : (
          <div style={s.list}>
            {filteredItems.map((item) => {
              const isBusy = busyId === item.id;
              return (
                <div key={item.id} style={s.itemCard}>
                  <div style={s.itemHeader}>
                    <span style={s.moduleTag(item.module)}>{item.module}</span>
                    <span style={s.value}>{money(item.value)}</span>
                  </div>

                  <div style={s.content}>
                    <h3 style={s.title}>{item.title}</h3>
                    <p style={s.detail}>{item.detail}</p>
                  </div>

                  <div style={s.actions}>
                    {item.actionType === 'approve_pr' && (
                      <>
                        <button
                          disabled={isBusy}
                          onClick={() => runAction(item.id, 'approve_pr', { status: 'approved' })}
                          style={s.btnAccent}
                        >
                          Approve
                        </button>
                        <button
                          disabled={isBusy}
                          onClick={() => runAction(item.id, 'approve_pr', { status: 'rejected' })}
                          style={s.btnSecondary}
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {item.actionType === 'approve_inv' && (
                      <button
                        disabled={isBusy}
                        onClick={() => runAction(item.id, 'approve_inv')}
                        style={s.btnAccent}
                      >
                        Approve Invoice
                      </button>
                    )}
                    {item.actionType === 'pay_inv' && (
                      <button
                        disabled={isBusy}
                        onClick={() => runAction(item.id, 'pay_inv', { value: item.value })}
                        style={s.btnPay}
                      >
                        Record Pay (GL)
                      </button>
                    )}
                    {item.actionType === 'activate_sub' && (
                      <button
                        disabled={isBusy}
                        onClick={() => runAction(item.id, 'activate_sub')}
                        style={s.btnAccent}
                      >
                        Activate Subcontract
                      </button>
                    )}
                    {item.actionType === 'certify_claim' && (
                      <button
                        disabled={isBusy}
                        onClick={() => runAction(item.id, 'certify_claim', { value: item.value })}
                        style={s.btnAccent}
                      >
                        Certify IPC Claim
                      </button>
                    )}
                    {item.actionType === 'pay_claim' && (
                      <button
                        disabled={isBusy}
                        onClick={() => runAction(item.id, 'pay_claim')}
                        style={s.btnPay}
                      >
                        Disburse Pay
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  container: { display: 'flex', flexDirection: 'column', gap: 12 } as CSSProperties,
  filterHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as CSSProperties,
  tabs: { display: 'flex', gap: 8 } as CSSProperties,
  tab: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    color: 'var(--muted)',
    fontSize: 13,
    fontWeight: 500,
    padding: '6px 12px',
    borderRadius: 8,
    cursor: 'pointer',
  } as CSSProperties,
  tabActive: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    color: 'var(--accent)',
    fontSize: 13,
    fontWeight: 600,
    padding: '6px 12px',
    borderRadius: 8,
    cursor: 'pointer',
  } as CSSProperties,
  panel: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '16px',
  } as CSSProperties,
  empty: {
    padding: '24px',
    textAlign: 'center',
    color: 'var(--muted)',
    fontSize: 14,
  } as CSSProperties,
  list: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 } as CSSProperties,
  itemCard: {
    background: 'var(--panel-2)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    minHeight: 150,
  } as CSSProperties,
  itemHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } as CSSProperties,
  moduleTag: (mod: string): CSSProperties => {
    let background = 'rgba(255,255,255,0.05)';
    let color = 'var(--text)';
    if (mod === 'Procurement') {
      background = 'rgba(0,123,255,0.1)';
      color = '#007bff';
    } else if (mod === 'Finance') {
      background = 'rgba(40,167,69,0.1)';
      color = 'var(--good)';
    } else if (mod === 'Subcontract') {
      background = 'rgba(23,162,184,0.1)';
      color = '#17a2b8';
    } else if (mod === 'Subcontract Claim') {
      background = 'rgba(255,193,7,0.1)';
      color = 'var(--accent)';
    }
    return {
      fontSize: 11,
      fontWeight: 600,
      background,
      color,
      borderRadius: 6,
      padding: '2.5px 6.5px',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    };
  },
  value: { fontSize: 15, fontWeight: 700, color: 'var(--text)' } as CSSProperties,
  content: { marginBottom: 12 } as CSSProperties,
  title: { fontSize: 14, margin: '0 0 4px', fontWeight: 600 } as CSSProperties,
  detail: { fontSize: 12, color: 'var(--muted)', margin: 0, lineHeight: 1.4 } as CSSProperties,
  actions: { display: 'flex', gap: 8, marginTop: 'auto' } as CSSProperties,
  btnAccent: {
    background: 'var(--accent)',
    color: '#0b0e14',
    fontWeight: 600,
    border: 'none',
    borderRadius: 6,
    padding: '5px 11px',
    fontSize: 12,
    cursor: 'pointer',
    flex: 1,
    textAlign: 'center',
  } as CSSProperties,
  btnSecondary: {
    background: 'var(--panel)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: 6,
    padding: '5px 11px',
    fontSize: 12,
    cursor: 'pointer',
    flex: 1,
    textAlign: 'center',
  } as CSSProperties,
  btnPay: {
    background: 'var(--good)',
    color: '#0b0e14',
    fontWeight: 600,
    border: 'none',
    borderRadius: 6,
    padding: '5px 11px',
    fontSize: 12,
    cursor: 'pointer',
    flex: 1,
    textAlign: 'center',
  } as CSSProperties,
  error: {
    background: 'rgba(220,53,69,0.1)',
    border: '1px solid rgba(220,53,69,0.2)',
    color: '#dc3545',
    padding: '10px 14px',
    borderRadius: 10,
    fontSize: 13,
  } as CSSProperties,
};
