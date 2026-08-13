import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { getJson } from '@/lib/api';
import WorkOrderActions from '@/components/work-order-actions';

export const dynamic = 'force-dynamic';

interface WorkOrder {
  id: string;
  orderNumber: string;
  contractId: string | null;
  assetId: string | null;
  description: string;
  priority: string;
  type: string;
  status: string;
  assignedTo: string | null;
  cost: number | null;
  scheduledDate: string | null;
  startedDate: string | null;
  completedDate: string | null;
  slaResolutionHours: number | null;
  resolutionHours: number | null;
  slaMet: boolean | null;
  createdAt: string;
}

interface ServiceContract {
  id: string;
  contractNumber: string;
  clientName: string;
  serviceScope: string;
  status: string;
  endDate: string;
  slaResponseHours: number;
  slaResolutionHours: number;
}

interface Detail {
  order: WorkOrder;
  contract: ServiceContract | null;
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function statusStyle(status: string): CSSProperties {
  const base: CSSProperties = { padding: '3px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700 };
  const map: Record<string, CSSProperties> = {
    completed: { background: 'rgba(34,197,94,.15)', color: '#16a34a' },
    cancelled: { background: 'rgba(100,116,139,.18)', color: 'var(--muted)' },
    in_progress: { background: 'rgba(59,130,246,.15)', color: '#2563eb' },
    assigned: { background: 'rgba(59,130,246,.12)', color: '#2563eb' },
    open: { background: 'rgba(245,158,11,.16)', color: '#d97706' },
  };
  return { ...base, ...(map[status] ?? map.open) };
}

const fmt = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

export default async function WorkOrder360Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getJson<Detail>(`/api/amc/work-orders/${id}/detail`);
  if (!detail?.order) notFound();

  const { order, contract } = detail;
  const measured = order.slaMet !== null && order.slaMet !== undefined;

  return (
    <div style={st.page}>
      <div style={st.crumbs}>
        <a href="/amc" style={st.crumbLink}>AMC</a>
        <span style={st.crumbSep}>/</span>
        <a href="/amc/work-orders" style={st.crumbLink}>Work Orders</a>
        <span style={st.crumbSep}>/</span>
        <span>{order.orderNumber}</span>
      </div>

      <div style={st.headRow}>
        <div>
          <h1 style={st.h1}>{order.orderNumber}</h1>
          <p style={st.sub}>{order.description}</p>
        </div>
        <span style={statusStyle(order.status)} data-testid="wo-status">
          {STATUS_LABEL[order.status] ?? order.status}
        </span>
      </div>

      <WorkOrderActions id={order.id} status={order.status} />

      {/* ── SLA outcome ── */}
      <section style={st.panel}>
        <h2 style={st.h2}>SLA outcome</h2>
        {measured ? (
          <div data-testid="wo-sla-outcome">
            <p style={order.slaMet ? st.slaOk : st.slaBad}>
              {order.slaMet ? '✓ Met' : '✕ Breached'} — resolved in {order.resolutionHours}h against a{' '}
              {order.slaResolutionHours}h contract window.
            </p>
            <p style={st.note}>
              The window shown is the one that applied when this visit completed. Changing the
              contract later does not re-judge it.
            </p>
          </div>
        ) : (
          <p style={st.muted} data-testid="wo-sla-unmeasured">
            Not measured. {order.contractId
              ? 'The outcome is stamped when the visit is completed.'
              : 'This is an ad-hoc order with no governing contract, so there is no SLA to measure against.'}
          </p>
        )}
      </section>

      {/* ── Governing contract ── */}
      <section style={st.panel}>
        <h2 style={st.h2}>Governing contract</h2>
        {contract ? (
          <div data-testid="wo-contract">
            <div style={st.raHead}>
              <strong>{contract.contractNumber}</strong> — {contract.clientName}
              <span style={{ ...statusStyle(contract.status === 'active' ? 'completed' : 'cancelled'), marginLeft: 10 }}>
                {contract.status}
              </span>
            </div>
            <div style={st.raMeta}>
              {contract.serviceScope} · runs to {fmt(contract.endDate)} · SLA{' '}
              {contract.slaResponseHours}h response / {contract.slaResolutionHours}h resolution
            </div>
          </div>
        ) : (
          <p style={st.muted} data-testid="wo-no-contract">
            Ad-hoc order — no service contract governs this visit.
          </p>
        )}
      </section>

      {/* ── Audit trail ── */}
      <section style={st.panel}>
        <h2 style={st.h2}>Audit trail</h2>
        <dl style={st.dl}>
          <div style={st.dRow}><dt style={st.dt}>Type / priority</dt><dd style={st.dd}>{order.type} · {order.priority}</dd></div>
          <div style={st.dRow}><dt style={st.dt}>Raised</dt><dd style={st.dd}>{fmt(order.createdAt)}</dd></div>
          <div style={st.dRow}><dt style={st.dt}>Scheduled</dt><dd style={st.dd}>{fmt(order.scheduledDate)}</dd></div>
          <div style={st.dRow}><dt style={st.dt}>Assigned to</dt><dd style={st.dd}>{order.assignedTo ?? '—'}</dd></div>
          <div style={st.dRow}><dt style={st.dt}>Started</dt><dd style={st.dd}>{fmt(order.startedDate)}</dd></div>
          <div style={st.dRow}><dt style={st.dt}>Completed</dt><dd style={st.dd}>{fmt(order.completedDate)}</dd></div>
          <div style={st.dRow}><dt style={st.dt}>Billable cost</dt><dd style={st.dd}>{order.cost ?? '—'}</dd></div>
        </dl>
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 980, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  crumbs: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--muted)', marginBottom: 10, flexWrap: 'wrap' } as CSSProperties,
  crumbLink: { color: 'var(--accent, #2563eb)', textDecoration: 'none' } as CSSProperties,
  crumbSep: { opacity: 0.5 } as CSSProperties,
  headRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18 } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5, fontFamily: 'var(--mono, ui-monospace, monospace)' } as CSSProperties,
  sub: { color: 'var(--muted)', margin: 0, maxWidth: 640, lineHeight: 1.5 } as CSSProperties,
  panel: { border: '1px solid var(--border, #e5e7eb)', borderRadius: 12, padding: '18px 20px', marginBottom: 18 } as CSSProperties,
  h2: { fontSize: 16, margin: '0 0 10px' } as CSSProperties,
  slaOk: { color: '#16a34a', fontWeight: 700, fontSize: 14, margin: '0 0 6px' } as CSSProperties,
  slaBad: { color: '#dc2626', fontWeight: 700, fontSize: 14, margin: '0 0 6px' } as CSSProperties,
  note: { color: 'var(--muted)', fontSize: 12.5, margin: 0 } as CSSProperties,
  raHead: { fontSize: 14, marginBottom: 4 } as CSSProperties,
  raMeta: { color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 13.5, margin: 0 } as CSSProperties,
  dl: { margin: 0, display: 'flex', flexDirection: 'column', gap: 8 } as CSSProperties,
  dRow: { display: 'flex', gap: 12 } as CSSProperties,
  dt: { width: 130, color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  dd: { margin: 0, fontSize: 13.5 } as CSSProperties,
};
