'use client';

import { type CSSProperties, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PoEdit } from './po-create';

interface PurchaseOrder {
  id: string;
  title: string;
  supplierName: string | null;
  projectName: string | null;
  status: string;
  value: number;
  createdAt: string;
}

function money(n: number): string {
  return typeof n === 'number' ? '$' + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '—';
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export default function PoList({ initialPos }: { initialPos: PurchaseOrder[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function updateStatus(id: string, status: string) {
    setBusyId(id);
    setErr(null);
    try {
      const res = await fetch(`/api/procurement/purchase-orders/${id}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? d.message ?? 'Failed to update PO status');
      } else {
        router.refresh();
      }
    } catch {
      setErr('Failed to connect to the API.');
    } finally {
      setBusyId(null);
    }
  }

  // Approval matrix actions: draft → submit (auto-approves small POs) → approve → issue.
  async function act(id: string, action: 'submit' | 'approve', body?: Record<string, unknown>) {
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
        setErr(d.error ?? d.message ?? `Failed to ${action} PO`);
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

      <section style={s.panel}>
        {initialPos.length === 0 ? (
          <p style={s.muted}>No purchase orders yet — raise one above.</p>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                {['Title', 'Supplier', 'Project', 'Status', 'Value', 'Created', 'Actions'].map((h) => (
                  <th key={h} style={s.th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {initialPos.map((po) => {
                const isBusy = busyId === po.id;
                return (
                  <tr key={po.id} style={s.row}>
                    <td style={s.td}>
                      <a
                        href={`/procurement/purchase-orders/${po.id}`}
                        style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}
                      >
                        {po.title}
                      </a>
                    </td>
                    <td style={s.tdMuted}>{po.supplierName ?? '—'}</td>
                    <td style={s.tdMuted}>{po.projectName ?? '—'}</td>
                    <td style={s.td}>
                      <span style={s.tag(po.status)}>{po.status}</span>
                    </td>
                    <td style={s.td}>{money(po.value)}</td>
                    <td style={s.tdMuted}>{fmt(po.createdAt)}</td>
                    <td style={s.td}>
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
                        <button type="button" disabled={isBusy} onClick={() => updateStatus(po.id, 'issued')} style={s.btnAccent}>
                          {isBusy ? 'Issuing…' : 'Issue PO'}
                        </button>
                      )}
                      {po.status === 'issued' && (
                        <span style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 500 }}>
                          Ready to Receive
                        </span>
                      )}
                      {po.status === 'received' && (
                        <span style={{ color: 'var(--good)', fontSize: 13, fontWeight: 500 }}>
                          Received ✓
                        </span>
                      )}
                      <PoEdit po={po} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

const s = {
  container: { display: 'flex', flexDirection: 'column', gap: 12 } as CSSProperties,
  panel: { background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 14, padding: '8px 8px' } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
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
  btnAccent: {
    background: 'var(--accent)',
    color: '#0b0e14',
    fontWeight: 600,
    border: 'none',
    borderRadius: 8,
    padding: '6px 12px',
    fontSize: 12.5,
    cursor: 'pointer',
    transition: 'all 0.2s',
  } as CSSProperties,
  errorBar: {
    background: 'rgba(220,53,69,0.1)',
    border: '1px solid rgba(220,53,69,0.2)',
    color: '#dc3545',
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
      color = '#f59e0b';
      border = '1px solid rgba(245,158,11,0.25)';
      background = 'rgba(245,158,11,0.06)';
    } else if (status === 'approved') {
      color = 'var(--good)';
      border = '1px solid rgba(40,167,69,0.2)';
      background = 'rgba(40,167,69,0.05)';
    } else if (status === 'issued') {
      color = 'var(--accent)';
      border = '1px solid rgba(255,193,7,0.2)';
      background = 'rgba(255,193,7,0.05)';
    } else if (status === 'received') {
      color = 'var(--good)';
      border = '1px solid rgba(40,167,69,0.2)';
      background = 'rgba(40,167,69,0.05)';
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
};
