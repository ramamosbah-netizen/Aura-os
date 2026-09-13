import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import DailyReportClient, { type DailyReport, type LabourAllocation } from '../../../components/daily-report-client';

export const dynamic = 'force-dynamic';

interface Project {
  id: string;
  title: string;
  reference?: string | null;
  status?: string | null;
}

export default async function DailyReportsPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const { projectId } = await searchParams;
  /**
   * SCOPED AT THE API when a project is named.
   *
   * This asked for every report in the tenant and narrowed the result here. For an org-wide
   * identity that was merely wasteful; for a project MEMBER it was fatal — the unscoped read names
   * no project, so a project-scoped grant has nothing to match and the whole page showed "could
   * not be loaded". The page took a `projectId` and then did not use it where it counts.
   *
   * The project list is likewise refused to a member, so when a project is named it is read BY ID
   * — the shape a project-scoped grant can authorise. Without a project we are in the global
   * register, where an org grant is the only thing that reaches it anyway.
   */
  const scope = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  const [reports, labour, projects, current] = await Promise.all([
    getJson<DailyReport[]>(`/api/site/daily-reports${scope}`),
    getJson<LabourAllocation[]>(`/api/site/labour${scope}`),
    projectId ? Promise.resolve(null) : getJson<Project[]>('/api/projects/projects'),
    projectId ? getJson<Project>(`/api/projects/projects/${encodeURIComponent(projectId)}`) : Promise.resolve(null),
  ]);
  // The local narrowing stays as a belt — it now removes nothing, and anything it did remove would
  // be the API answering a question it was not asked.
  const scopedReports = projectId ? (reports ?? []).filter((report) => report.projectId === projectId) : reports;
  const scopedLabour = projectId ? (labour ?? []).filter((entry) => entry.projectId === projectId) : labour;
  const projectOptions = current ? [current] : (projects ?? []);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Site · Daily Reports &amp; Labour</h1>
      <p style={st.sub}>
        The foreman&rsquo;s daily diary — the day&rsquo;s work, manpower and plant on site, submitted as the
        record that backs progress claims and delay evidence. Log the labour return by trade below;
        man-hours roll up for productivity and payment.
      </p>
      <section style={{ marginTop: 10 }}>
        {reports === null ? <p style={st.muted}>Daily reports could not be loaded. Retry when the Site service is available.</p> : <DailyReportClient reports={scopedReports ?? []} labour={scopedLabour ?? []} initialProjectId={projectId} projects={projectOptions} projectsUnavailable={!projectId && projects === null} />}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1080, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 780, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
