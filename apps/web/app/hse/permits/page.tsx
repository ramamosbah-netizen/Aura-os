import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

interface Permit {
  id: string;
  projectId: string;
  projectName: string | null;
  permitType: string;
  validFrom: string;
  validTo: string;
  description: string;
  status: string;
  riskAssessmentId: string | null;
  requestedBy: string | null;
  approvedBy: string | null;
  updatedAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  requested: 'Requested',
  approved: 'Approved',
  rejected: 'Rejected',
  closed: 'Closed',
  expired: 'Expired',
};

const TYPE_LABEL: Record<string, string> = {
  hot_work: 'Hot work',
  confined_space: 'Confined space',
  height_work: 'Work at height',
  electrical: 'Electrical',
  excavation: 'Excavation',
};

function statusStyle(status: string): CSSProperties {
  const base: CSSProperties = { padding: '2px 9px', borderRadius: 999, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' };
  const map: Record<string, CSSProperties> = {
    approved: { background: 'rgba(34,197,94,.15)', color: '#16a34a' },
    closed: { background: 'rgba(100,116,139,.18)', color: 'var(--muted)' },
    expired: { background: 'rgba(239,68,68,.15)', color: '#dc2626' },
    rejected: { background: 'rgba(239,68,68,.15)', color: '#dc2626' },
    requested: { background: 'rgba(59,130,246,.15)', color: '#2563eb' },
    draft: { background: 'rgba(100,116,139,.14)', color: 'var(--muted)' },
  };
  return { ...base, ...(map[status] ?? map.draft) };
}

const fmt = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

/** A live permit whose window has already passed is the liability the register must surface. */
function isOverdue(p: Permit): boolean {
  const to = Date.parse(p.validTo);
  return !Number.isNaN(to) && to < Date.now() && (p.status === 'approved' || p.status === 'requested');
}

export default async function PermitRegisterPage() {
  const permits = (await getJson<Permit[]>('/api/hse/ptws')) ?? [];
  // Live permits first; closed and expired sink.
  const rank = (s: string): number => (s === 'closed' || s === 'expired' ? 1 : 0);
  const rows = [...permits].sort(
    (a, b) => rank(a.status) - rank(b.status) || a.validFrom.localeCompare(b.validFrom),
  );
  const overdue = rows.filter(isOverdue).length;

  return (
    <div style={st.page}>
      <div style={st.crumbs}>
        <a href="/hse/control" style={st.crumbLink}>HSE</a>
        <span style={st.crumbSep}>/</span>
        <span>Permit Register</span>
      </div>
      <h1 style={st.h1}>Permit to Work Register</h1>
      <p style={st.sub}>
        The controlled register of every permit authorising high-risk work. A permit walks a governed
        lifecycle — Draft → Requested → Approved → Closed — and approval is refused unless an
        approved risk assessment covers the work, the approver is not the requester, and the permit
        is inside its validity window. Open a permit to drive its workflow.
      </p>

      {overdue > 0 ? (
        <div style={st.warn} data-testid="permits-overdue">
          ⚠ {overdue} live permit{overdue === 1 ? '' : 's'} past the end of its validity window. An open
          permit outside its window no longer authorises the work — close or expire it.
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div style={st.empty} data-testid="permit-register-empty">
          No permits yet. Raise one from the <a href="/hse/control" style={st.crumbLink}>HSE Control</a> workspace.
        </div>
      ) : (
        <div style={st.tableWrap}>
          <table style={st.table} data-testid="permit-register">
            <thead>
              <tr>
                {['Type', 'Description', 'Valid from', 'Valid to', 'Risk assessment', 'Status', ''].map((h) => (
                  <th key={h} style={st.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} style={p.status === 'closed' || p.status === 'expired' ? st.rowMuted : undefined}>
                  <td style={st.tdCode}>{TYPE_LABEL[p.permitType] ?? p.permitType}</td>
                  <td style={st.td}>{p.description}</td>
                  <td style={st.tdMuted}>{fmt(p.validFrom)}</td>
                  <td style={{ ...st.tdMuted, ...(isOverdue(p) ? st.overdueCell : {}) }}>{fmt(p.validTo)}</td>
                  <td style={st.tdMuted}>
                    {p.riskAssessmentId ? (
                      <span style={st.raOk} data-testid={`ra-linked-${p.id}`}>Linked</span>
                    ) : (
                      <span style={st.raMissing} data-testid={`ra-missing-${p.id}`}>Not assessed</span>
                    )}
                  </td>
                  <td style={st.td}>
                    <span style={statusStyle(p.status)} data-testid={`permit-status-${p.id}`}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </td>
                  <td style={st.td}>
                    <a href={`/hse/permits/${p.id}`} style={st.open} data-testid={`open-permit-${p.id}`}>
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
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 760, lineHeight: 1.5 } as CSSProperties,
  warn: { border: '1px solid rgba(239,68,68,.4)', background: 'rgba(239,68,68,.07)', borderRadius: 10, padding: '11px 14px', marginBottom: 16, fontSize: 13.5 } as CSSProperties,
  empty: { border: '1px dashed var(--border, #d1d5db)', borderRadius: 12, padding: 28, color: 'var(--muted)', textAlign: 'center' } as CSSProperties,
  tableWrap: { overflowX: 'auto', border: '1px solid var(--border, #e5e7eb)', borderRadius: 12 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left', padding: '11px 14px', borderBottom: '1px solid var(--border, #e5e7eb)', color: 'var(--muted)', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4 } as CSSProperties,
  td: { padding: '11px 14px', borderBottom: '1px solid var(--border, #f1f5f9)' } as CSSProperties,
  tdCode: { padding: '11px 14px', borderBottom: '1px solid var(--border, #f1f5f9)', fontWeight: 600 } as CSSProperties,
  tdMuted: { padding: '11px 14px', borderBottom: '1px solid var(--border, #f1f5f9)', color: 'var(--muted)' } as CSSProperties,
  overdueCell: { color: '#dc2626', fontWeight: 600 } as CSSProperties,
  rowMuted: { opacity: 0.55 } as CSSProperties,
  raOk: { color: '#16a34a', fontWeight: 600 } as CSSProperties,
  raMissing: { color: '#d97706', fontWeight: 600 } as CSSProperties,
  open: { color: 'var(--accent, #2563eb)', textDecoration: 'none', fontWeight: 600 } as CSSProperties,
};
