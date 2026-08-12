import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { getJson } from '@/lib/api';
import SiteReportActions from '@/components/site-report-actions';

export const dynamic = 'force-dynamic';

interface DailyReport {
  id: string; reportNumber: string; projectName: string | null; projectId: string; date: string; status: string;
  workDescription: string; siteConditions: string | null; safetyNotes: string | null;
  preparedBy: string | null; submittedBy: string | null; submittedAt: string | null;
  reviewedBy: string | null; reviewedAt: string | null; approvedBy: string | null; approvedAt: string | null;
  rejectionReason: string | null; createdAt: string;
}
interface Labour { id: string; trade: string; contractor: string | null; headcount: number; hours: number; manHours: number; notes: string | null }
interface Plant { id: string; equipmentType: string; equipmentId: string | null; quantity: number; operatingHours: number; status: string; notes: string | null }
interface Progress { id: string; description: string; boqItemId: string | null; plannedQty: number; installedQty: number; unit: string | null; progressPct: number; location: string | null }
interface Delay { id: string; category: string; description: string; durationHours: number; responsibleParty: string | null; mitigation: string | null }
interface Evidence { id: string; fileId: string; category: string; description: string | null; location: string | null; hash: string | null }
interface Detail { report: DailyReport; labour: Labour[]; plant: Plant[]; progress: Progress[]; delays: Delay[]; evidence: Evidence[] }

const STATUS_LABEL: Record<string, string> = { draft: 'Draft', submitted: 'Submitted', under_review: 'Under Review', approved: 'Approved', rejected: 'Rejected' };
const LIFECYCLE = ['draft', 'submitted', 'under_review', 'approved'];
const fmt = (iso: string | null): string => (iso ? new Date(iso).toLocaleString() : '—');

export default async function SiteReport360({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getJson<Detail>(`/api/site/daily-reports/${id}`);
  if (!d?.report) notFound();
  const { report, labour, plant, progress, delays, evidence } = d;
  const stepIndex = LIFECYCLE.indexOf(report.status);
  const totalManHours = labour.reduce((s, l) => s + l.manHours, 0);

  return (
    <div style={st.page}>
      <div style={st.crumbs}>
        <a href="/site/execution" style={st.crumbLink}>Site Execution</a>
        <span style={st.crumbSep}>/</span>
        <span>{report.reportNumber}</span>
      </div>

      <div style={st.headRow}>
        <div>
          <h1 style={st.h1}>{report.reportNumber}</h1>
          <p style={st.title}>{report.workDescription}</p>
          <p style={st.meta}>{report.projectName ?? report.projectId} · {report.date}{report.siteConditions ? ` · ${report.siteConditions}` : ''}</p>
        </div>
        <span style={st.statusBadge} data-testid="report-status">{STATUS_LABEL[report.status] ?? report.status}</span>
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

      {report.status !== 'approved' && report.rejectionReason && (
        <p style={st.rejected} data-testid="rejection-note">Returned for correction: {report.rejectionReason}</p>
      )}

      <SiteReportActions id={report.id} status={report.status} />

      <div style={st.grid}>
        <Section title={`Progress`} testid="tab-progress">
          <Table head={['Item', 'BOQ', 'Installed / Planned', '%']}>
            {progress.map((p) => (
              <tr key={p.id}><td style={st.td}>{p.description}</td><td style={st.tdMuted}>{p.boqItemId ?? '—'}</td><td style={st.tdMuted}>{p.installedQty} / {p.plannedQty} {p.unit ?? ''}</td><td style={st.tdCode}>{p.progressPct}%</td></tr>
            ))}
            {progress.length === 0 && <tr><td style={st.tdMuted} colSpan={4}>—</td></tr>}
          </Table>
        </Section>

        <Section title={`Labour (${totalManHours} man-hours)`} testid="tab-labour">
          <Table head={['Trade', 'Contractor', 'Head', 'Hrs', 'MH']}>
            {labour.map((l) => (
              <tr key={l.id}><td style={st.td}>{l.trade}</td><td style={st.tdMuted}>{l.contractor ?? '—'}</td><td style={st.tdMuted}>{l.headcount}</td><td style={st.tdMuted}>{l.hours}</td><td style={st.tdCode}>{l.manHours}</td></tr>
            ))}
            {labour.length === 0 && <tr><td style={st.tdMuted} colSpan={5}>—</td></tr>}
          </Table>
        </Section>

        <Section title="Plant" testid="tab-plant">
          <Table head={['Equipment', 'ID', 'Qty', 'Hrs', 'Status']}>
            {plant.map((p) => (
              <tr key={p.id}><td style={st.td}>{p.equipmentType}</td><td style={st.tdMuted}>{p.equipmentId ?? '—'}</td><td style={st.tdMuted}>{p.quantity}</td><td style={st.tdMuted}>{p.operatingHours}</td><td style={st.tdMuted}>{p.status}</td></tr>
            ))}
            {plant.length === 0 && <tr><td style={st.tdMuted} colSpan={5}>—</td></tr>}
          </Table>
        </Section>

        <Section title="Delays" testid="tab-delays">
          <Table head={['Category', 'Description', 'Hrs', 'Responsible']}>
            {delays.map((x) => (
              <tr key={x.id}><td style={st.td}>{x.category}</td><td style={st.tdMuted}>{x.description}</td><td style={st.tdMuted}>{x.durationHours}</td><td style={st.tdMuted}>{x.responsibleParty ?? '—'}</td></tr>
            ))}
            {delays.length === 0 && <tr><td style={st.tdMuted} colSpan={4}>—</td></tr>}
          </Table>
        </Section>
      </div>

      <Section title={`Evidence (${evidence.length})`} testid="tab-evidence">
        {evidence.length === 0 ? <p style={st.paraMuted}>No photos attached.</p> : (
          <ul style={st.evidence}>
            {evidence.map((e) => <li key={e.id}>📷 {e.description ?? e.fileId} <span style={st.evCat}>[{e.category}]</span>{e.location ? ` · ${e.location}` : ''}</li>)}
          </ul>
        )}
      </Section>

      <Section title="Timeline" testid="tab-timeline">
        <ul style={st.activity}>
          <li>Created {fmt(report.createdAt)}{report.preparedBy ? ` by ${report.preparedBy}` : ''}</li>
          {report.submittedAt && <li>Submitted {fmt(report.submittedAt)}{report.submittedBy ? ` by ${report.submittedBy}` : ''}</li>}
          {report.reviewedAt && <li>Review started {fmt(report.reviewedAt)}{report.reviewedBy ? ` by ${report.reviewedBy}` : ''}</li>}
          {report.rejectionReason && <li>Rejected → returned for correction ({report.rejectionReason})</li>}
          {report.approvedAt && <li>Approved {fmt(report.approvedAt)}{report.approvedBy ? ` by ${report.approvedBy}` : ''}</li>}
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, testid, children }: { title: string; testid: string; children: React.ReactNode }) {
  return (<section style={st.section} data-testid={testid}><h2 style={st.h2}>{title}</h2>{children}</section>);
}
function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div style={st.tableWrap}><table style={st.table}>
      <thead><tr>{head.map((h) => <th key={h} style={st.th}>{h}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table></div>
  );
}

const st = {
  page: { maxWidth: 1120, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  crumbs: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--muted)', marginBottom: 14 } as CSSProperties,
  crumbLink: { color: 'var(--accent, #2563eb)', textDecoration: 'none' } as CSSProperties,
  crumbSep: { opacity: 0.5 } as CSSProperties,
  headRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' } as CSSProperties,
  h1: { fontSize: 26, margin: '0 0 4px', letterSpacing: -0.5 } as CSSProperties,
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
  rejected: { margin: '14px 0 0', padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,.1)', color: '#dc2626', fontSize: 13 } as CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20, marginTop: 20 } as CSSProperties,
  section: { marginTop: 20 } as CSSProperties,
  h2: { fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--muted)', margin: '0 0 8px' } as CSSProperties,
  paraMuted: { margin: 0, fontSize: 14, color: 'var(--muted)' } as CSSProperties,
  tableWrap: { overflowX: 'auto', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10 } as CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } as CSSProperties,
  th: { textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid var(--border, #e5e7eb)', color: 'var(--muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 } as CSSProperties,
  td: { padding: '8px 12px', borderBottom: '1px solid var(--border, #f1f5f9)' } as CSSProperties,
  tdCode: { padding: '8px 12px', borderBottom: '1px solid var(--border, #f1f5f9)', fontWeight: 600, fontFamily: 'var(--mono, ui-monospace, monospace)' } as CSSProperties,
  tdMuted: { padding: '8px 12px', borderBottom: '1px solid var(--border, #f1f5f9)', color: 'var(--muted)' } as CSSProperties,
  evidence: { margin: 0, paddingLeft: 18, lineHeight: 1.9, fontSize: 14 } as CSSProperties,
  evCat: { color: 'var(--muted)', fontSize: 12 } as CSSProperties,
  activity: { margin: 0, paddingLeft: 18, lineHeight: 1.8, fontSize: 14, color: 'var(--muted)' } as CSSProperties,
};
