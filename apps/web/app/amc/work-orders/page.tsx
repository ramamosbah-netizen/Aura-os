import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface WorkOrder {
  id: string;
  orderNumber: string;
  contractId: string | null;
  description: string;
  priority: string;
  type: string;
  status: string;
  assignedTo: string | null;
  cost: number | null;
  slaResolutionHours: number | null;
  resolutionHours: number | null;
  slaMet: boolean | null;
  createdAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function statusStyle(status: string): CSSProperties {
  const base: CSSProperties = { padding: '2px 9px', borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' };
  const map: Record<string, CSSProperties> = {
    completed: { background: 'rgba(34,197,94,.15)', color: '#16a34a' },
    cancelled: { background: 'rgba(100,116,139,.18)', color: 'var(--muted)' },
    in_progress: { background: 'rgba(59,130,246,.15)', color: '#2563eb' },
    assigned: { background: 'rgba(59,130,246,.12)', color: '#2563eb' },
    open: { background: 'rgba(245,158,11,.16)', color: '#d97706' },
  };
  return { ...base, ...(map[status] ?? map.open) };
}

export default async function WorkOrderRegisterPage() {
  const orders = (await getJson<WorkOrder[]>('/api/amc/work-orders')) ?? [];
  const rank = (s: string): number => (s === 'completed' || s === 'cancelled' ? 1 : 0);
  const rows = [...orders].sort((a, b) => rank(a.status) - rank(b.status) || b.createdAt.localeCompare(a.createdAt));

  const measured = rows.filter((o) => o.slaMet !== null && o.slaMet !== undefined);
  const breached = measured.filter((o) => o.slaMet === false).length;

  return (
    <div style={st.page}>
      <div style={st.crumbs}>
        <a href="/amc" style={st.crumbLink}>AMC</a>
        <span style={st.crumbSep}>/</span>
        <span>Work Orders</span>
      </div>
      <h1 style={st.h1}>Work Order Register</h1>
      <p style={st.sub}>
        Every maintenance visit and its SLA outcome. A work order walks a guarded lifecycle — Open →
        Assigned → In Progress → Completed — and can only be raised against an <strong>active</strong>{' '}
        service contract. The SLA that applied at the time is stamped on the order at completion, so
        the outcome cannot be re-judged later by changing the contract.
      </p>

      {measured.length > 0 ? (
        <div style={breached > 0 ? st.warn : st.ok} data-testid="sla-summary">
          {breached > 0
            ? `⚠ ${breached} of ${measured.length} measured visit${measured.length === 1 ? '' : 's'} breached its contract SLA.`
            : `✓ All ${measured.length} measured visit${measured.length === 1 ? '' : 's'} met the contract SLA.`}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div style={st.empty} data-testid="work-order-register-empty">
          No work orders yet. Raise one from the <a href="/amc" style={st.crumbLink}>AMC</a> workspace.
        </div>
      ) : (
        <div style={st.tableWrap}>
          <table style={st.table} data-testid="work-order-register">
            <thead>
              <tr>
                {['Order', 'Description', 'Type', 'Assigned', 'SLA', 'Status', ''].map((h) => (
                  <th key={h} style={st.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} style={o.status === 'cancelled' ? st.rowMuted : undefined}>
                  <td style={st.tdCode}>{o.orderNumber}</td>
                  <td style={st.td}>{o.description}</td>
                  <td style={st.tdMuted}>{o.type}</td>
                  <td style={st.tdMuted}>{o.assignedTo ?? '—'}</td>
                  <td style={st.td}>
                    {o.slaMet === null || o.slaMet === undefined ? (
                      <span style={st.slaNone} data-testid={`sla-none-${o.id}`}>Not measured</span>
                    ) : o.slaMet ? (
                      <span style={st.slaOk} data-testid={`sla-met-${o.id}`}>
                        Met · {o.resolutionHours}h / {o.slaResolutionHours}h
                      </span>
                    ) : (
                      <span style={st.slaBad} data-testid={`sla-breached-${o.id}`}>
                        Breached · {o.resolutionHours}h / {o.slaResolutionHours}h
                      </span>
                    )}
                  </td>
                  <td style={st.td}>
                    <span style={statusStyle(o.status)} data-testid={`wo-status-${o.id}`}>
                      {STATUS_LABEL[o.status] ?? o.status}
                    </span>
                  </td>
                  <td style={st.td}>
                    <a href={`/amc/work-orders/${o.id}`} style={st.open} data-testid={`open-wo-${o.id}`}>
                      Open →
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const st = {
  page: { maxWidth: 1180, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  crumbs: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--muted)', marginBottom: 10 } as CSSProperties,
  crumbLink: { color: 'var(--accent, #2563eb)', textDecoration: 'none' } as CSSProperties,
  crumbSep: { opacity: 0.5 } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 780, lineHeight: 1.5 } as CSSProperties,
  warn: { border: '1px solid rgba(239,68,68,.4)', background: 'rgba(239,68,68,.07)', borderRadius: 10, padding: '11px 14px', marginBottom: 16, fontSize: 13.5 } as CSSProperties,
  ok: { border: '1px solid rgba(34,197,94,.35)', background: 'rgba(34,197,94,.07)', borderRadius: 10, padding: '11px 14px', marginBottom: 16, fontSize: 13.5 } as CSSProperties,
  empty: { border: '1px dashed var(--border, #d1d5db)', borderRadius: 12, padding: 28, color: 'var(--muted)', textAlign: 'center' } as CSSProperties,
  tableWrap: { overflowX: 'auto', border: '1px solid var(--border, #e5e7eb)', borderRadius: 12 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left', padding: '11px 14px', borderBottom: '1px solid var(--border, #e5e7eb)', color: 'var(--muted)', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 } as CSSProperties,
  td: { padding: '11px 14px', borderBottom: '1px solid var(--border, #f1f5f9)' } as CSSProperties,
  tdCode: { padding: '11px 14px', borderBottom: '1px solid var(--border, #f1f5f9)', fontWeight: 600, fontFamily: 'var(--mono, ui-monospace, monospace)' } as CSSProperties,
  tdMuted: { padding: '11px 14px', borderBottom: '1px solid var(--border, #f1f5f9)', color: 'var(--muted)' } as CSSProperties,
  rowMuted: { opacity: 0.55 } as CSSProperties,
  slaOk: { color: '#16a34a', fontWeight: 600, fontSize: 12.5 } as CSSProperties,
  slaBad: { color: '#dc2626', fontWeight: 700, fontSize: 12.5 } as CSSProperties,
  slaNone: { color: 'var(--muted)', fontSize: 12.5 } as CSSProperties,
  open: { color: 'var(--accent, #2563eb)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
};
