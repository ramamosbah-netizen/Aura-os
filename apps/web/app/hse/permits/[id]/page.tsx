import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { getJson } from '@/lib/api';
import PermitWorkflowActions from '@/components/permit-workflow-actions';

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
  requestedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  closedBy: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RiskAssessment {
  id: string;
  reference: string;
  activity: string;
  assessor: string | null;
  residualScore: number;
  residualBand: string;
  status: string;
  hazards: Array<{ hazard: string; likelihood: number; severity: number; controls: string }>;
}

interface Detail {
  permit: Permit;
  riskAssessment: RiskAssessment | null;
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
  const base: CSSProperties = { padding: '3px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700 };
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

const fmt = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

export default async function Permit360Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getJson<Detail>(`/api/hse/ptws/${id}/detail`);
  if (!detail?.permit) notFound();

  const { permit, riskAssessment } = detail;
  const withinWindow = Date.now() >= Date.parse(permit.validFrom) && Date.now() <= Date.parse(permit.validTo);

  // The three approval gates, surfaced BEFORE the user clicks approve. A permit system that only
  // reports a refusal after the fact teaches people to click and hope.
  const gates = [
    {
      id: 'risk-assessment',
      label: 'Risk assessment approved',
      ok: riskAssessment?.status === 'approved',
      detail: !permit.riskAssessmentId
        ? 'No risk assessment is cited on this permit.'
        : !riskAssessment
          ? 'The cited risk assessment could not be found.'
          : riskAssessment.status === 'approved'
            ? `${riskAssessment.reference} — ${riskAssessment.activity}`
            : `${riskAssessment.reference} is '${riskAssessment.status}' and must be approved first.`,
    },
    {
      id: 'validity',
      label: 'Inside the validity window',
      ok: withinWindow,
      detail: withinWindow
        ? `Authorised ${fmt(permit.validFrom)} → ${fmt(permit.validTo)}`
        : `The window ${fmt(permit.validFrom)} → ${fmt(permit.validTo)} does not include now.`,
    },
    {
      id: 'segregation',
      label: 'Segregation of duties',
      ok: true,
      detail: permit.requestedBy
        ? `Requested by ${permit.requestedBy} — approval by that same person is refused.`
        : 'No requester recorded; any approver is accepted.',
    },
  ];
  const blocking = gates.filter((g) => !g.ok);

  return (
    <div style={st.page}>
      <div style={st.crumbs}>
        <a href="/hse/control" style={st.crumbLink}>HSE</a>
        <span style={st.crumbSep}>/</span>
        <a href="/hse/permits" style={st.crumbLink}>Permit Register</a>
        <span style={st.crumbSep}>/</span>
        <span>{TYPE_LABEL[permit.permitType] ?? permit.permitType}</span>
      </div>

      <div style={st.headRow}>
        <div>
          <h1 style={st.h1}>{TYPE_LABEL[permit.permitType] ?? permit.permitType}</h1>
          <p style={st.sub}>{permit.description}</p>
        </div>
        <span style={statusStyle(permit.status)} data-testid="permit-status">
          {STATUS_LABEL[permit.status] ?? permit.status}
        </span>
      </div>

      {permit.status === 'rejected' && permit.rejectionReason ? (
        <div style={st.reject} data-testid="permit-rejection">
          <strong>Rejected:</strong> {permit.rejectionReason}
        </div>
      ) : null}

      {/* ── Approval gates ── */}
      <section style={st.panel}>
        <h2 style={st.h2}>Authorisation gates</h2>
        <p style={st.panelSub}>
          All must pass before this permit can be approved. The API enforces them regardless of what
          this page shows.
        </p>
        <ul style={st.gateList} data-testid="permit-gates">
          {gates.map((g) => (
            <li key={g.id} style={st.gateRow} data-testid={`gate-${g.id}`}>
              <span style={g.ok ? st.gateOk : st.gateBad}>{g.ok ? '✓' : '✕'}</span>
              <div>
                <div style={st.gateLabel}>{g.label}</div>
                <div style={st.gateDetail}>{g.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <PermitWorkflowActions
        permitId={permit.id}
        status={permit.status}
        blockingGates={blocking.map((g) => g.label)}
      />

      {/* ── Risk assessment ── */}
      <section style={st.panel}>
        <h2 style={st.h2}>Risk assessment</h2>
        {riskAssessment ? (
          <div data-testid="permit-risk-assessment">
            <div style={st.raHead}>
              <strong>{riskAssessment.reference}</strong> — {riskAssessment.activity}
              <span style={{ ...statusStyle(riskAssessment.status), marginLeft: 10 }}>{riskAssessment.status}</span>
            </div>
            <div style={st.raMeta}>
              Assessor: {riskAssessment.assessor ?? '—'} · Residual score {riskAssessment.residualScore} (
              {riskAssessment.residualBand})
            </div>
            {riskAssessment.hazards?.length > 0 ? (
              <table style={st.table}>
                <thead>
                  <tr>{['Hazard', 'L', 'S', 'Controls'].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {riskAssessment.hazards.map((h, i) => (
                    <tr key={i}>
                      <td style={st.td}>{h.hazard}</td>
                      <td style={st.tdMuted}>{h.likelihood}</td>
                      <td style={st.tdMuted}>{h.severity}</td>
                      <td style={st.tdMuted}>{h.controls}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        ) : (
          <p style={st.muted} data-testid="permit-no-risk-assessment">
            No risk assessment is linked. This permit cannot be approved until one is cited and approved.
          </p>
        )}
      </section>

      {/* ── Audit trail ── */}
      <section style={st.panel}>
        <h2 style={st.h2}>Audit trail</h2>
        <dl style={st.dl}>
          <div style={st.dRow}><dt style={st.dt}>Project</dt><dd style={st.dd}>{permit.projectName ?? permit.projectId}</dd></div>
          <div style={st.dRow}><dt style={st.dt}>Valid from</dt><dd style={st.dd}>{fmt(permit.validFrom)}</dd></div>
          <div style={st.dRow}><dt style={st.dt}>Valid to</dt><dd style={st.dd}>{fmt(permit.validTo)}</dd></div>
          <div style={st.dRow}><dt style={st.dt}>Requested by</dt><dd style={st.dd}>{permit.requestedBy ?? '—'} · {fmt(permit.requestedAt)}</dd></div>
          <div style={st.dRow}><dt style={st.dt}>Approved by</dt><dd style={st.dd}>{permit.approvedBy ?? '—'} · {fmt(permit.approvedAt)}</dd></div>
          <div style={st.dRow}><dt style={st.dt}>Closed by</dt><dd style={st.dd}>{permit.closedBy ?? '—'} · {fmt(permit.closedAt)}</dd></div>
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
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: 0, maxWidth: 640, lineHeight: 1.5 } as CSSProperties,
  reject: { border: '1px solid rgba(239,68,68,.4)', background: 'rgba(239,68,68,.07)', borderRadius: 10, padding: '11px 14px', marginBottom: 18, fontSize: 13.5 } as CSSProperties,
  panel: { border: '1px solid var(--border, #e5e7eb)', borderRadius: 12, padding: '18px 20px', marginBottom: 18 } as CSSProperties,
  h2: { fontSize: 16, margin: '0 0 4px' } as CSSProperties,
  panelSub: { color: 'var(--muted)', fontSize: 13, margin: '0 0 14px' } as CSSProperties,
  gateList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 12 } as CSSProperties,
  gateRow: { display: 'flex', gap: 12, alignItems: 'flex-start' } as CSSProperties,
  gateOk: { color: '#16a34a', fontWeight: 800, fontSize: 16, lineHeight: 1.3 } as CSSProperties,
  gateBad: { color: '#dc2626', fontWeight: 800, fontSize: 16, lineHeight: 1.3 } as CSSProperties,
  gateLabel: { fontWeight: 600, fontSize: 14 } as CSSProperties,
  gateDetail: { color: 'var(--muted)', fontSize: 13, marginTop: 2 } as CSSProperties,
  raHead: { fontSize: 14, marginBottom: 4 } as CSSProperties,
  raMeta: { color: 'var(--muted)', fontSize: 13, marginBottom: 12 } as CSSProperties,
  muted: { color: 'var(--muted)', fontSize: 13.5, margin: 0 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 } as CSSProperties,
  th: { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border, #e5e7eb)', color: 'var(--muted)', fontWeight: 600, fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.4 } as CSSProperties,
  td: { padding: '8px 10px', borderBottom: '1px solid var(--border, #f1f5f9)' } as CSSProperties,
  tdMuted: { padding: '8px 10px', borderBottom: '1px solid var(--border, #f1f5f9)', color: 'var(--muted)' } as CSSProperties,
  dl: { margin: 0, display: 'flex', flexDirection: 'column', gap: 8 } as CSSProperties,
  dRow: { display: 'flex', gap: 12 } as CSSProperties,
  dt: { width: 130, color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  dd: { margin: 0, fontSize: 13.5 } as CSSProperties,
};
