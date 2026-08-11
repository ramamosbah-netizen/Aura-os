import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { getJson } from '@/lib/api';
import DocumentWorkflowActions from '@/components/document-workflow-actions';

export const dynamic = 'force-dynamic';

interface RegisterEntry {
  id: string;
  documentNumber: string;
  title: string;
  discipline: string;
  currentRevision: string;
  status: string;
  custodian: string | null;
}
interface Revision {
  id: string;
  revision: string;
  status: string;
  previousRevision: string | null;
  reasonForRevision: string | null;
  submittedBy: string | null; submittedAt: string | null;
  reviewedBy: string | null; reviewedAt: string | null;
  decidedBy: string | null; decidedAt: string | null; decisionComments: string | null;
  issuedBy: string | null; issuedAt: string | null;
  createdAt: string;
}
interface HistoryRow {
  revision: string; purpose: string; transmittalCode: string; recipient: string | null; transmittalStatus: string; sentAt: string;
}

const REV_LABEL: Record<string, string> = {
  draft: 'Draft', submitted: 'Submitted', under_review: 'Under Review', approved: 'Approved', rejected: 'Rejected', issued: 'Issued', superseded: 'Superseded',
};
const LIFECYCLE = ['draft', 'submitted', 'under_review', 'approved', 'issued', 'superseded'];
const fmt = (iso: string | null): string => (iso ? new Date(iso).toLocaleString() : '—');

export default async function Document360Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [revisions, hist] = await Promise.all([
    getJson<Revision[]>(`/api/doccontrol/register/${id}/revisions`),
    getJson<{ entry: RegisterEntry; history: HistoryRow[] }>(`/api/doccontrol/register/${id}/history`),
  ]);
  if (!hist?.entry || !revisions) notFound();
  const entry = hist.entry;
  const active = revisions[0]; // newest revision drives the workflow
  const stepIndex = LIFECYCLE.indexOf(active.status);

  return (
    <div style={st.page}>
      <div style={st.crumbs}>
        <a href="/doccontrol/register" style={st.crumbLink}>Document Register</a>
        <span style={st.crumbSep}>/</span>
        <span>{entry.documentNumber}</span>
      </div>

      <div style={st.headRow}>
        <div>
          <h1 style={st.h1}>{entry.documentNumber} <span style={st.rev}>Rev {active.revision}</span></h1>
          <p style={st.title}>{entry.title}</p>
          <p style={st.meta}>{entry.discipline} · custodian {entry.custodian ?? '—'} · register at Rev {entry.currentRevision}</p>
        </div>
        <span style={st.statusBadge} data-testid="active-status">{REV_LABEL[active.status] ?? active.status}</span>
      </div>

      <div style={st.steps}>
        {LIFECYCLE.map((s, i) => (
          <div key={s} style={st.step}>
            <span style={{ ...st.dot, ...(i <= stepIndex && stepIndex >= 0 ? st.dotOn : {}) }} />
            <span style={{ ...st.stepLabel, ...(i === stepIndex ? st.stepCurrent : {}) }}>{REV_LABEL[s]}</span>
            {i < LIFECYCLE.length - 1 && <span style={st.stepBar} />}
          </div>
        ))}
      </div>

      <DocumentWorkflowActions revisionId={active.id} status={active.status} />

      {/* Revision history — chronological lifecycle/timeline */}
      <section style={st.section} data-testid="tab-revisions">
        <h2 style={st.h2}>Revision History</h2>
        <div style={st.tableWrap}>
          <table style={st.table}>
            <thead><tr>{['Rev', 'Status', 'Reason', 'Approval journey', 'Raised'].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr></thead>
            <tbody>
              {revisions.map((r) => (
                <tr key={r.id} style={r.id === active.id ? st.rowActive : undefined}>
                  <td style={st.tdCode}>{r.revision}{r.id === active.id ? ' (active)' : ''}</td>
                  <td style={st.td}>{REV_LABEL[r.status] ?? r.status}</td>
                  <td style={st.tdMuted}>{r.reasonForRevision ?? '—'}</td>
                  <td style={st.tdMuted}>
                    {[
                      r.submittedAt && 'submitted',
                      r.reviewedAt && 'reviewed',
                      r.status === 'rejected' && r.decisionComments ? `rejected: ${r.decisionComments}` : r.decidedAt && r.status !== 'rejected' && 'approved',
                      r.issuedAt && 'issued',
                    ].filter(Boolean).join(' → ') || '—'}
                  </td>
                  <td style={st.tdMuted}>{fmt(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Transmittals conveying this document */}
      <section style={st.section} data-testid="tab-transmittals">
        <h2 style={st.h2}>Transmittals</h2>
        {hist.history.length === 0 ? (
          <p style={st.paraMuted}>Not yet transmitted.</p>
        ) : (
          <div style={st.tableWrap}>
            <table style={st.table}>
              <thead><tr>{['Transmittal', 'Rev', 'Purpose', 'To', 'Status', 'Sent'].map((h) => <th key={h} style={st.th}>{h}</th>)}</tr></thead>
              <tbody>
                {hist.history.map((h, i) => (
                  <tr key={`${h.transmittalCode}-${i}`}>
                    <td style={st.tdCode}>{h.transmittalCode}</td>
                    <td style={st.tdMuted}>{h.revision}</td>
                    <td style={st.tdMuted}>{h.purpose}</td>
                    <td style={st.tdMuted}>{h.recipient ?? '—'}</td>
                    <td style={st.td}>{h.transmittalStatus}</td>
                    <td style={st.tdMuted}>{fmt(h.sentAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Audit trail for the active revision */}
      <section style={st.section} data-testid="tab-audit">
        <h2 style={st.h2}>Audit Trail — Rev {active.revision}</h2>
        <ul style={st.activity}>
          <li>Raised {fmt(active.createdAt)}{active.previousRevision ? ` (supersedes Rev ${active.previousRevision})` : ''}</li>
          {active.submittedAt && <li>Submitted {fmt(active.submittedAt)}{active.submittedBy ? ` by ${active.submittedBy}` : ''}</li>}
          {active.reviewedAt && <li>Review started {fmt(active.reviewedAt)}{active.reviewedBy ? ` by ${active.reviewedBy}` : ''}</li>}
          {active.decidedAt && <li>Decided {fmt(active.decidedAt)}{active.decidedBy ? ` by ${active.decidedBy}` : ''} → {REV_LABEL[active.status] ?? active.status}{active.decisionComments ? ` (${active.decisionComments})` : ''}</li>}
          {active.issuedAt && <li>Issued {fmt(active.issuedAt)}{active.issuedBy ? ` by ${active.issuedBy}` : ''}</li>}
        </ul>
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1080, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  crumbs: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--muted)', marginBottom: 14, flexWrap: 'wrap' } as CSSProperties,
  crumbLink: { color: 'var(--accent, #2563eb)', textDecoration: 'none' } as CSSProperties,
  crumbSep: { opacity: 0.5 } as CSSProperties,
  headRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' } as CSSProperties,
  h1: { fontSize: 26, margin: '0 0 4px', letterSpacing: -0.5 } as CSSProperties,
  rev: { fontSize: 16, color: 'var(--muted)', fontWeight: 500 } as CSSProperties,
  title: { margin: '0 0 4px', fontSize: 16 } as CSSProperties,
  meta: { margin: 0, color: 'var(--muted)', fontSize: 13 } as CSSProperties,
  statusBadge: { padding: '5px 12px', borderRadius: 999, background: 'rgba(59,130,246,.14)', color: '#2563eb', fontWeight: 700, fontSize: 13 } as CSSProperties,
  steps: { display: 'flex', alignItems: 'center', gap: 4, margin: '18px 0', flexWrap: 'wrap' } as CSSProperties,
  step: { display: 'flex', alignItems: 'center', gap: 6 } as CSSProperties,
  dot: { width: 10, height: 10, borderRadius: 999, background: 'var(--border, #cbd5e1)', display: 'inline-block' } as CSSProperties,
  dotOn: { background: '#2563eb' } as CSSProperties,
  stepLabel: { fontSize: 12, color: 'var(--muted)' } as CSSProperties,
  stepCurrent: { color: '#2563eb', fontWeight: 700 } as CSSProperties,
  stepBar: { width: 20, height: 2, background: 'var(--border, #e5e7eb)', margin: '0 2px' } as CSSProperties,
  section: { marginTop: 26 } as CSSProperties,
  h2: { fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', margin: '0 0 10px' } as CSSProperties,
  paraMuted: { margin: 0, fontSize: 14, color: 'var(--muted)' } as CSSProperties,
  tableWrap: { overflowX: 'auto', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 } as CSSProperties,
  th: { textAlign: 'left', padding: '9px 13px', borderBottom: '1px solid var(--border, #e5e7eb)', color: 'var(--muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 } as CSSProperties,
  td: { padding: '9px 13px', borderBottom: '1px solid var(--border, #f1f5f9)' } as CSSProperties,
  tdCode: { padding: '9px 13px', borderBottom: '1px solid var(--border, #f1f5f9)', fontWeight: 600, fontFamily: 'var(--mono, ui-monospace, monospace)' } as CSSProperties,
  tdMuted: { padding: '9px 13px', borderBottom: '1px solid var(--border, #f1f5f9)', color: 'var(--muted)' } as CSSProperties,
  rowActive: { background: 'rgba(37,99,235,.06)' } as CSSProperties,
  activity: { margin: 0, paddingLeft: 18, lineHeight: 1.8, fontSize: 14, color: 'var(--muted)' } as CSSProperties,
};
