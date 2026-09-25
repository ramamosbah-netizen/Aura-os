import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import SystemChecklistClient, {
  type ItpTemplate, type ProjectOption, type SystemItp, type TemplateCoverage,
} from '../../../components/system-checklist-client';

export const dynamic = 'force-dynamic';

/**
 * Quality · System commissioning checklists (TC-08 / TC-09).
 *
 * Quality owns the checklist a system is commissioned against: the tenant's template for each
 * canonical system, its adaptation into a project, and the independent approval that freezes it.
 * Testing & Commissioning executes the approved revision and writes none of it.
 */
export default async function SystemChecklistsPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project = '' } = await searchParams;
  const [coverage, templates, projects, itps] = await Promise.all([
    getJson<TemplateCoverage[]>('/api/quality/itp-templates/coverage'),
    getJson<ItpTemplate[]>('/api/quality/itp-templates'),
    getJson<ProjectOption[]>('/api/projects/projects'),
    project ? getJson<SystemItp[]>(`/api/quality/itps?projectId=${encodeURIComponent(project)}`) : Promise.resolve([] as SystemItp[]),
  ]);
  // The installation-inspection plans share the register; they are not commissioning checklists
  // and are never shown as one (their own page is /quality/itps).
  const checklists = itps === null ? null : itps.filter((i) => i.kind === 'system_commissioning' && i.projectId === project);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Quality · System commissioning checklists</h1>
      <p style={st.sub}>
        The checklist each ELV system is commissioned against. Quality writes the template, adapts it to the project, and a
        second QA/QC person approves it; the approved revision is frozen, and Testing &amp; Commissioning executes exactly
        its points. Installation inspection plans stay on <a href="/quality/itps" style={st.link}>Inspection &amp; Test Plans</a>.
      </p>
      <SystemChecklistClient
        coverage={coverage}
        templates={templates}
        projects={(projects ?? []).map((p) => ({ id: p.id, title: p.title }))}
        selectedProject={project}
        checklists={checklists}
      />
    </div>
  );
}

const st = {
  page: { maxWidth: 1180, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 12px', maxWidth: 820, lineHeight: 1.5 } as CSSProperties,
  link: { color: 'var(--accent)' } as CSSProperties,
};
