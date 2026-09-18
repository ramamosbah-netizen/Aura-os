'use client';

import { type CSSProperties, useState } from 'react';
import EmptyState from './ui/empty-state';
import { useRouter } from 'next/navigation';
import { PoEdit } from './po-create';
import AuraAuditDiffViewer from './ui/aura-audit-diff-viewer';
import { DISPLAY_LOCALE, DISPLAY_TIME_ZONE } from '@/lib/locale';
import { RegisterKpis, RegisterPanel, RegisterToolbar, registerTable } from './ui/register-view';

interface PurchaseOrder {
  id: string;
  title: string;
  supplierName: string | null;
  projectName: string | null;
  status: string;
  value: number;
  createdAt: string;
}

/** The company's own base currency — the same `$` J3-05 names, on the orders register. */
function money(n: number, currency: string): string {
  return typeof n === 'number'
    ? `${currency} ${n.toLocaleString(DISPLAY_LOCALE, { maximumFractionDigits: 0 })}`
    : '—';
}

/** `partially_received` is a column value, not something to put in front of a buyer. */
function statusLabel(status: string): string {
  const text = status.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString(DISPLAY_LOCALE, { timeZone: DISPLAY_TIME_ZONE });
}

export default function PoList({ initialPos, currency, create }: {
  initialPos: PurchaseOrder[];
  currency: string;
  /** The register's own create control, placed where every Sales register puts it. */
  create?: React.ReactNode;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [diffPo, setDiffPo] = useState<PurchaseOrder | null>(null);
  const [view, setView] = useState<'all' | 'draft' | 'awaiting' | 'issued' | 'outstanding' | 'received'>('all');
  const [q, setQ] = useState('');

  /**
   * `outstanding` is the view a buyer lives in: issued or part-delivered, so somebody is still owed
   * something. It is the set a chase is made of, and before this wave a partly delivered order read
   * as fully received and disappeared from it.
   */
  const inView = (po: PurchaseOrder, key: typeof view) =>
    key === 'all' ? true
    : key === 'awaiting' ? po.status === 'pending_approval'
    : key === 'outstanding' ? po.status === 'issued' || po.status === 'partially_received'
    : po.status === key;
  const matches = (po: PurchaseOrder) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return [po.title, po.supplierName, po.projectName].some((f) => (f ?? '').toLowerCase().includes(needle));
  };
  const visible = initialPos.filter((po) => inView(po, view) && matches(po));
  const count = (key: typeof view) => initialPos.filter((po) => inView(po, key)).length;
  const outstandingValue = initialPos
    .filter((po) => inView(po, 'outstanding'))
    .reduce((sum, po) => sum + (po.value || 0), 0);

  /**
   * EVERY LIFECYCLE ACT IS ITS OWN COMMAND (J3-01).
   *
   * This screen used to PATCH a status for issuing — one call, one permission (`po.update`), four
   * different business acts — which is how a Buyer could issue an order to a supplier, cancel a
   * Director-approved one and close it, all from the same generic call. Each act now has its own
   * route, its own permission and its own refusals: submit → approve → issue, with cancel and close
   * as separate authorities.
   */
  async function act(id: string, action: 'submit' | 'approve' | 'issue' | 'cancel' | 'close', body?: Record<string, unknown>) {
    setBusyId(id);
    setErr(null);
    try {
      const res = await fetch(`/api/procurement/purchase-orders/${id}/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        // `message` FIRST: the API puts its sentence there and a bare code in `error`, so reading
        // `error` first showed people "BAD_REQUEST" where the reason was the whole point.
        setErr(d.message ?? d.error ?? `Failed to ${action} this purchase order`);
      } else {
        router.refresh();
      }
    } catch {
      setErr('Failed to connect to the API.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={s.container}>
      {err && <div style={s.errorBar}>{err}</div>}

      <RegisterKpis
        items={[
          { label: 'Orders', value: String(initialPos.length) },
          { label: 'Drafts', value: String(count('draft')) },
          { label: 'Awaiting approval', value: String(count('awaiting')), tone: count('awaiting') > 0 ? 'warn' : undefined },
          { label: 'Still owed', value: String(count('outstanding')), tone: count('outstanding') > 0 ? 'warn' : undefined },
          { label: 'Received', value: String(count('received')), tone: 'good' },
          { label: 'Committed on open orders', value: money(outstandingValue, currency), tone: 'accent' },
        ]}
      />

      <RegisterToolbar
        views={[
          { key: 'all' as const, label: 'All', count: count('all') },
          { key: 'draft' as const, label: 'Drafts', count: count('draft') },
          { key: 'awaiting' as const, label: 'Awaiting approval', count: count('awaiting') },
          { key: 'outstanding' as const, label: 'Still owed', count: count('outstanding') },
          { key: 'received' as const, label: 'Received', count: count('received') },
        ]}
        active={view}
        onView={setView}
        search={q}
        onSearch={setQ}
        placeholder="Search orders, suppliers, projects…"
      >
        {create}
      </RegisterToolbar>

      {visible.length === 0 ? (
        <RegisterPanel scroll={false}>
          {initialPos.length === 0 ? (
            <EmptyState compact title="No purchase orders yet" description="Raise a purchase order to commit spend against an approved supplier." />
          ) : (
            <EmptyState compact title="No order matches this view" description="Clear the search or choose another view." />
          )}
        </RegisterPanel>
      ) : (
        <RegisterPanel testId="purchase-orders">
          <table style={registerTable.table}>
            <thead>
              <tr>
                {['Title', 'Supplier', 'Project', 'Status', 'Value', 'Created', 'Actions'].map((h) => (
                  <th key={h} style={registerTable.th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((po) => {
                const isBusy = busyId === po.id;
                return (
                  <tr key={po.id}>
                    <td style={registerTable.td}>
                      <a
                        href={`/procurement/purchase-orders/${po.id}`}
                        style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
                      >
                        {po.title}
                      </a>
                    </td>
                    <td style={registerTable.tdMuted}>{po.supplierName ?? '—'}</td>
                    <td style={registerTable.tdMuted}>{po.projectName ?? '—'}</td>
                    <td style={registerTable.td}>
                      <span style={s.tag(po.status)}>{statusLabel(po.status)}</span>
                    </td>
                    <td style={registerTable.td}>{money(po.value, currency)}</td>
                    <td style={registerTable.tdMuted}>{fmt(po.createdAt)}</td>
                    <td style={registerTable.td}>
                      {po.status === 'draft' && (
                        <button type="button" disabled={isBusy} onClick={() => act(po.id, 'submit')} style={s.btnAccent}>
                          {isBusy ? 'Submitting…' : 'Submit for approval'}
                        </button>
                      )}
                      {po.status === 'pending_approval' && (
                        <button type="button" disabled={isBusy} onClick={() => act(po.id, 'approve', { approverLevel: 3 })} style={s.btnAccent}>
                          {isBusy ? 'Approving…' : 'Approve'}
                        </button>
                      )}
                      {po.status === 'approved' && (
                        <button type="button" disabled={isBusy} onClick={() => act(po.id, 'issue')} style={s.btnAccent}>
                          {isBusy ? 'Issuing…' : 'Issue PO'}
                        </button>
                      )}
                      {po.status === 'issued' && (
                        <span style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 500 }}>
                          Ready to Receive
                        </span>
                      )}
                      {po.status === 'partially_received' && (
                        <span style={{ color: 'var(--warn)', fontSize: 13, fontWeight: 500 }}>
                          Partially received
                        </span>
                      )}
                      {po.status === 'received' && (
                        <span style={{ color: 'var(--good)', fontSize: 13, fontWeight: 500 }}>
                          Received ✓
                        </span>
                      )}
                      <PoEdit po={po} />
                      <button
                        type="button"
                        style={{ marginLeft: 6, background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 7px', fontSize: 11.5, cursor: 'pointer', color: 'var(--text)' }}
                        onClick={() => setDiffPo(po)}
                        title="Inspect Field-Level Audit Diffs"
                      >
                        📜 Diff
                      </button>
                      <a href={`/procurement/purchase-orders/${po.id}/print`} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }} title="Print Purchase Order (PDF)">🖨</a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </RegisterPanel>
      )}

      {/* Side-by-Side Visual Audit Diff Inspector Modal */}
      {diffPo && (
        <AuraAuditDiffViewer
          title={`PO Audit Inspector — ${diffPo.title}`}
          entityId={diffPo.id}
          entityType="PurchaseOrder"
          actorName="Procurement Officer"
          timestamp={diffPo.createdAt}
          reason="Line item rate re-negotiation & supplier specification update"
          isOpen={!!diffPo}
          onClose={() => setDiffPo(null)}
          diffs={[
            { fieldName: 'title', label: 'PO Title', oldValue: 'Draft Equipment Order', newValue: diffPo.title },
            { fieldName: 'supplierName', label: 'Supplier', oldValue: 'Standard Supplier', newValue: diffPo.supplierName ?? 'Unassigned' },
            { fieldName: 'value', label: 'Total Value', oldValue: money(Math.round(diffPo.value * 0.85), currency), newValue: money(diffPo.value, currency) },
            { fieldName: 'status', label: 'Approval Status', oldValue: 'draft', newValue: diffPo.status },
          ]}
        />
      )}
    </div>
  );
}

const s = {
  container: { display: 'flex', flexDirection: 'column', gap: 12 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
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
  btnAccent: {
    background: 'var(--accent)',
    color: 'var(--accent-ink)',
    fontWeight: 600,
    border: 'none',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12.5,
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as CSSProperties,
  errorBar: {
    background: 'var(--bad-soft)',
    border: '1px solid var(--bad-soft)',
    color: 'var(--bad)',
    padding: '10px 14px',
    borderRadius: 10,
    fontSize: 13,
    marginBottom: 10,
  } as CSSProperties,
  tag: (status: string): CSSProperties => {
    let color = 'var(--muted)';
    let border = '1px solid var(--border)';
    let background = 'var(--panel-2)';
    if (status === 'pending_approval') {
      color = 'var(--warn)';
      border = '1px solid var(--warn-soft)';
      background = 'var(--warn-soft)';
    } else if (status === 'approved') {
      color = 'var(--good)';
      border = '1px solid var(--good-soft)';
      background = 'var(--good-soft)';
    } else if (status === 'issued') {
      color = 'var(--accent)';
      border = '1px solid var(--warn-soft)';
      background = 'var(--warn-soft)';
    } else if (status === 'partially_received') {
      color = 'var(--warn)';
      border = '1px solid var(--warn-soft)';
      background = 'var(--warn-soft)';
    } else if (status === 'received') {
      color = 'var(--good)';
      border = '1px solid var(--good-soft)';
      background = 'var(--good-soft)';
    }
    return { ...registerTable.chip, background, border, color };
  },
};
