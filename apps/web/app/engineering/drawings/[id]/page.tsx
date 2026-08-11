import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { getJson } from '@/lib/api';
import DrawingWorkflowActions from '@/components/drawing-workflow-actions';

export const dynamic = 'force-dynamic';

interface Drawing {
  id: string;
  projectId: string;
  projectName: string | null;
  code: string;
  title: string;
  revision: string;
  status: string;
  discipline: string;
  previousRevision: string | null;
  reasonForRevision: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  transmittalRef: string | null;
  transmittedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Submission {
  id: string;
  revision: string;
  submittedBy: string | null;
  submittedAt: string;
  recipient: string | null;
  purpose: string | null;
  dueDate: string | null;
  comments: string | null;
}

interface Review {
  id: string;
  revision: string;
  reviewedBy: string | null;
  reviewedAt: string;
  outcome: string;
  comments: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', submitted: 'Submitted', under_review: 'Under Review', approved: 'Approved',
  rejected: 'Rejected', revision_required: 'Revision Required', transmitted: 'Transmitted',
  closed: 'Closed', superseded: 'Superseded',
};

const LIFECYCLE = ['draft', 'submitted', 'under_review', 'approved', 'transmitted', 'closed'];

const fmt = (iso: string | null): string => (iso ? new Date(iso).toLocaleString() : '—');
const outcomeLabel: Record<string, string> = {
  approved: 'Approved', approved_with_comments: 'Approved with comments',
  rejected: 'Rejected', returned_for_revision: 'Returned for revision',
};

export default async function Drawing360Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const drawing = await getJson<Drawing>(`/api/engineering/drawings/${id}`);
  if (!drawing) notFound();

  const [revisions, submissions, reviews] = await Promise.all([
    getJson<Drawing[]>(`/api/engineering/drawings/revisions?projectId=${encodeURIComponent(drawing.projectId)}&code=${encodeURIComponent(drawing.code)}`),
    getJson<Submission[]>(`/api/engineering/drawings/${id}/submissions`),
    getJson<Review[]>(`/api/engineering/drawings/${id}/reviews`),
  ]);

  const stepIndex = LIFECYCLE.indexOf(drawing.status);

  return (
    <div style={st.page}>
      <div style={st.crumbs}>
        <a href="/engineering" style={st.crumbLink}>Engineering</a>
        <span style={st.crumbSep}>/</span>
        <a href="/engineering/drawings" style={st.crumbLink}>Drawing Register</a>
        <span style={st.crumbSep}>/</span>
        <span>{drawing.code}</span>
      </div>

      <div style={st.headRow}>
        <div>
          <h1 style={st.h1}>{drawing.code} <span style={st.rev}>Rev {drawing.revision}</span></h1>
          <p style={st.title}>{drawing.title}</p>
          <p style={st.meta}>
            {drawing.discipline} · {drawing.projectName ?? drawing.projectId}
            {drawing.previousRevision ? ` · supersedes Rev ${drawing.previousRevision}` : ''}
          </p>
        </div>
        <span style={st.statusBadge} data-testid="drawing-status">{STATUS_LABEL[drawing.status] ?? drawing.status}</span>
      </div>

      {/* Lifecycle progress */}
      <div style={st.steps}>
        {LIFECYCLE.map((s, i) => (
          <div key={s} style={st.step}>
            <span style={{ ...st.dot, ...(i <= stepIndex && stepIndex >= 0 ? st.dotOn : {}) }} />
            <span style={{ ...st.stepLabel, ...(i === stepIndex ? st.stepCurrent : {}) }}>{STATUS_LABEL[s]}</span>
            {i < LIFECYCLE.length - 1 && <span style={st.stepBar} />}
          </div>
        ))}
      </div>

      {/* Workflow actions (client) */}
      <DrawingWorkflowActions id={drawing.id} status={drawing.status} />

      {/* Revisions */}
      <Section title="Revisions" testid="tab-revisions">
        <Table head={['Rev', 'Status', 'Reason', 'Updated']}>
          {(revisions ?? []).map((r) => (
            <tr key={r.id} style={r.id === drawing.id ? st.rowActive : undefined}>
              <td style={st.tdCode}>{r.revision}{r.id === drawing.id ? ' (this)' : ''}</td>
              <td style={st.td}>{STATUS_LABEL[r.status] ?? r.status}</td>
              <td style={st.tdMuted}>{r.reasonForRevision ?? '—'}</td>
              <td style={st.tdMuted}>{fmt(r.updatedAt)}</td>
            </tr>
          ))}
        </Table>
      </Section>

      {/* Submissions */}
      <Section title="Submissions" testid="tab-submissions">
        <Table head={['Rev', 'To', 'Purpose', 'Submitted', 'Due']}>
          {(submissions ?? []).map((s) => (
            <tr key={s.id}>
              <td style={st.tdCode}>{s.revision}</td>
              <td style={st.td}>{s.recipient ?? '—'}</td>
              <td style={st.tdMuted}>{s.purpose ?? '—'}</td>
              <td style={st.tdMuted}>{fmt(s.submittedAt)}</td>
              <td style={st.tdMuted}>{s.dueDate ?? '—'}</td>
            </tr>
          ))}
        </Table>
      </Section>

      {/* Reviews */}
      <Section title="Reviews" testid="tab-reviews">
        <Table head={['Rev', 'Outcome', 'Comments', 'Reviewed']}>
          {(reviews ?? []).map((r) => (
            <tr key={r.id}>
              <td style={st.tdCode}>{r.revision}</td>
              <td style={st.td}>{outcomeLabel[r.outcome] ?? r.outcome}</td>
              <td style={st.tdMuted}>{r.comments ?? '—'}</td>
              <td style={st.tdMuted}>{fmt(r.reviewedAt)}</td>
            </tr>
          ))}
        </Table>
      </Section>

      {/* Transmittals */}
      <Section title="Transmittals" testid="tab-transmittals">
        {drawing.transmittalRef ? (
          <p style={st.para} data-testid="transmittal-ref">
            Conveyed by transmittal <strong>{drawing.transmittalRef}</strong> on {fmt(drawing.transmittedAt)}.
          </p>
        ) : (
          <p style={st.paraMuted}>Not transmitted yet. Transmittal is created automatically on transmit.</p>
        )}
      </Section>

      {/* Activity */}
      <Section title="Activity" testid="tab-activity">
        <ul style={st.activity}>
          <li>Created {fmt(drawing.createdAt)}</li>
          {drawing.submittedAt && <li>Submitted {fmt(drawing.submittedAt)}{drawing.submittedBy ? ` by ${drawing.submittedBy}` : ''}</li>}
          {drawing.reviewedAt && <li>Review started {fmt(drawing.reviewedAt)}{drawing.reviewedBy ? ` by ${drawing.reviewedBy}` : ''}</li>}
          {drawing.decidedAt && <li>Decided {fmt(drawing.decidedAt)}{drawing.decidedBy ? ` by ${drawing.decidedBy}` : ''} → {STATUS_LABEL[drawing.status] ?? drawing.status}</li>}
          {drawing.transmittedAt && <li>Transmitted {fmt(drawing.transmittedAt)}</li>}
          {drawing.closedAt && <li>Closed {fmt(drawing.closedAt)}</li>}
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, testid, children }: { title: string; testid: string; children: React.ReactNode }) {
  return (
    <section style={st.section} data-testid={testid}>
      <h2 style={st.h2}>{title}</h2>
      {children}
    </section>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div style={st.tableWrap}>
      <table style={st.table}>
        <thead><tr>{head.map((h) => <th key={h} style={st.th}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
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
  stepBar: { width: 22, height: 2, background: 'var(--border, #e5e7eb)', margin: '0 2px' } as CSSProperties,
  section: { marginTop: 26 } as CSSProperties,
  h2: { fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', margin: '0 0 10px' } as CSSProperties,
  para: { margin: 0, fontSize: 14 } as CSSProperties,
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
