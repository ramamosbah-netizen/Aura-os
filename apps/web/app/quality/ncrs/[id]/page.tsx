import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { getJson } from '@/lib/api';
import NcrWorkflowActions from '@/components/ncr-workflow-actions';

export const dynamic = 'force-dynamic';

interface Ncr {
  id: string;
  projectId: string;
  projectName: string | null;
  ncrNumber: string;
  description: string;
  rootCause: string | null;
  correctiveAction: string | null;
  severity: 'minor' | 'major';
  status: string;
  raisedBy: string | null;
  assignedTo: string | null;
  sourceIrId: string | null;
  sourceIrNumber: string | null;
  actionPlannedAt: string | null;
  correctedBy: string | null;
  correctedAt: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  closedAt: string | null;
  createdAt: string;
}

interface Verification {
  id: string;
  verifiedBy: string | null;
  verifiedAt: string;
  outcome: 'accepted' | 'rejected';
  note: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  raised: 'Raised', action_planned: 'Action Planned', corrected: 'Corrected', closed: 'Closed',
};
const LIFECYCLE = ['raised', 'action_planned', 'corrected', 'closed'];
const fmt = (iso: string | null): string => (iso ? new Date(iso).toLocaleString() : '—');

export default async function Ncr360Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ncr = await getJson<Ncr>(`/api/quality/ncrs/${id}`);
  if (!ncr) notFound();
  const verifications = (await getJson<Verification[]>(`/api/quality/ncrs/${id}/verifications`)) ?? [];
  const stepIndex = LIFECYCLE.indexOf(ncr.status);

  return (
    <div style={st.page}>
      <div style={st.crumbs}>
        <a href="/quality/ncrs" style={st.crumbLink}>NCRs</a>
        <span style={st.crumbSep}>/</span>
        <span>{ncr.ncrNumber}</span>
      </div>

      <div style={st.headRow}>
        <div>
          <h1 style={st.h1}>{ncr.ncrNumber} <span style={st.sev(ncr.severity)}>{ncr.severity}</span></h1>
          <p style={st.title}>{ncr.description}</p>
          <p style={st.meta}>
            {ncr.projectName ?? ncr.projectId}
            {ncr.sourceIrNumber ? ` · from inspection ${ncr.sourceIrNumber}` : ''}
            {ncr.assignedTo ? ` · owner ${ncr.assignedTo}` : ''}
          </p>
        </div>
        <span style={st.statusBadge} data-testid="ncr-status">{STATUS_LABEL[ncr.status] ?? ncr.status}</span>
      </div>

      <div style={st.steps}>
        {LIFECYCLE.map((s, i) => (
          <div key={s} style={st.step}>
            <span style={{ ...st.dot, ...(i <= stepIndex && stepIndex >= 0 ? st.dotOn : {}) }} />
            <span style={{ ...st.stepLabel, ...(i === stepIndex ? st.stepCurrent : {}) }}>{STATUS_LABEL[s]}</span>
            {i < LIFECYCLE.length - 1 && <span style={st.stepBar} />}
          </div>
        ))}
      </div>

      <NcrWorkflowActions id={ncr.id} status={ncr.status} />

      <section style={st.section} data-testid="tab-details">
        <h2 style={st.h2}>Corrective action</h2>
        <dl style={st.dl}>
          <dt style={st.dt}>Root cause</dt><dd style={st.dd}>{ncr.rootCause ?? '—'}</dd>
          <dt style={st.dt}>Corrective action</dt><dd style={st.dd}>{ncr.correctiveAction ?? '—'}</dd>
          <dt style={st.dt}>Assigned to</dt><dd style={st.dd}>{ncr.assignedTo ?? '—'}</dd>
          {ncr.sourceIrNumber && (<><dt style={st.dt}>Source inspection</dt><dd style={st.dd}>{ncr.sourceIrNumber}</dd></>)}
        </dl>
      </section>

      <section style={st.section} data-testid="tab-verifications">
        <h2 style={st.h2}>Verifications</h2>
        <div style={st.tableWrap}>
          <table style={st.table}>
            <thead><tr>{['Outcome', 'Note', 'Verified by', 'When'].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr></thead>
            <tbody>
              {verifications.length === 0 ? (
                <tr><td style={st.tdMuted} colSpan={4}>No verification yet — QA verifies once the correction is done.</td></tr>
              ) : verifications.map((v) => (
                <tr key={v.id}>
                  <td style={{ ...st.td, color: v.outcome === 'accepted' ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{v.outcome}</td>
                  <td style={st.tdMuted}>{v.note ?? '—'}</td>
                  <td style={st.tdMuted}>{v.verifiedBy ?? '—'}</td>
                  <td style={st.tdMuted}>{fmt(v.verifiedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={st.section} data-testid="tab-activity">
        <h2 style={st.h2}>Activity</h2>
        <ul style={st.activity}>
          <li>Raised {fmt(ncr.createdAt)}{ncr.raisedBy ? ` by ${ncr.raisedBy}` : ''}</li>
          {ncr.actionPlannedAt && <li>Corrective action planned {fmt(ncr.actionPlannedAt)}</li>}
          {ncr.correctedAt && <li>Marked corrected {fmt(ncr.correctedAt)}{ncr.correctedBy ? ` by ${ncr.correctedBy}` : ''}</li>}
          {ncr.verifiedAt && <li>Last verified {fmt(ncr.verifiedAt)}{ncr.verifiedBy ? ` by ${ncr.verifiedBy}` : ''}</li>}
          {ncr.closedAt && <li>Closed {fmt(ncr.closedAt)}</li>}
        </ul>
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  crumbs: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--muted)', marginBottom: 14 } as CSSProperties,
  crumbLink: { color: 'var(--accent, #2563eb)', textDecoration: 'none' } as CSSProperties,
  crumbSep: { opacity: 0.5 } as CSSProperties,
  headRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' } as CSSProperties,
  h1: { fontSize: 26, margin: '0 0 4px', letterSpacing: -0.5 } as CSSProperties,
  sev: (s: string): CSSProperties => ({ fontSize: 13, fontWeight: 700, color: s === 'major' ? '#dc2626' : '#d97706' }),
  title: { margin: '0 0 4px', fontSize: 16 } as CSSProperties,
  meta: { margin: 0, color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  statusBadge: { padding: '5px 12px', borderRadius: 999, background: 'rgba(59,130,246,.14)', color: '#2563eb', fontWeight: 700, fontSize: 13 } as CSSProperties,
  steps: { display: 'flex', alignItems: 'center', gap: 4, margin: '18px 0', flexWrap: 'wrap' } as CSSProperties,
  step: { display: 'flex', alignItems: 'center', gap: 6 } as CSSProperties,
  dot: { width: 10, height: 10, borderRadius: 999, background: 'var(--border, #cbd5e1)', display: 'inline-block' } as CSSProperties,
  dotOn: { background: '#2563eb' } as CSSProperties,
  stepLabel: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  stepCurrent: { color: '#2563eb', fontWeight: 700 } as CSSProperties,
  stepBar: { width: 26, height: 2, background: 'var(--border, #e5e7eb)', margin: '0 2px' } as CSSProperties,
  section: { marginTop: 26 } as CSSProperties,
  h2: { fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', margin: '0 0 10px' } as CSSProperties,
  dl: { display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '6px 18px', margin: 0 } as CSSProperties,
  dt: { color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  dd: { margin: 0, fontSize: 14 } as CSSProperties,
  tableWrap: { overflowX: 'auto', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left', padding: '9px 13px', borderBottom: '1px solid var(--border, #e5e7eb)', color: 'var(--muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 } as CSSProperties,
  td: { padding: '9px 13px', borderBottom: '1px solid var(--border, #f1f5f9)' } as CSSProperties,
  tdMuted: { padding: '9px 13px', borderBottom: '1px solid var(--border, #f1f5f9)', color: 'var(--muted)' } as CSSProperties,
  activity: { margin: 0, paddingLeft: 18, lineHeight: 1.8, fontSize: 14, color: 'var(--muted)' } as CSSProperties,
};
