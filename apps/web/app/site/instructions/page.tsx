import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import SiteInstructionsClient from '../../../components/site-instructions-client';

export const dynamic = 'force-dynamic';

interface SiteInstruction {
  id: string;
  projectId: string;
  projectName: string | null;
  reference: string;
  issuedBy: string;
  date: string;
  instruction: string;
  costImplication: boolean;
  timeImplication: boolean;
  status: string;
}

interface Project {
  id: string;
  title: string;
  reference?: string | null;
  status?: string | null;
}

export default async function SiteInstructionsPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  // The project is CARRIED to the API. An unscoped read is refused for a project member, so
  // narrowing afterwards never had anything to narrow; and the project list is refused too, which
  // is why the one in context is read by id instead.
  const { projectId } = await searchParams;
  const scope = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  const [instructions, projects, current] = await Promise.all([
    getJson<SiteInstruction[]>(`/api/site/instructions${scope}`),
    projectId ? Promise.resolve(null) : getJson<Project[]>('/api/projects/projects'),
    projectId ? getJson<Project>(`/api/projects/projects/${encodeURIComponent(projectId)}`) : Promise.resolve(null),
  ]);
  const rows = projectId ? (instructions ?? []).filter((item) => item.projectId === projectId) : instructions;
  const projectOptions = current ? [current] : (projects ?? []);

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Site · Instructions</h1>
      <p style={st.sub}>
        Formal site instructions (SI) issued by the consultant/engineer — tracked open → acknowledged →
        closed. Flag cost and/or time implications so they can be escalated to a variation or EOT claim.
      </p>
      <section style={{ marginTop: 10 }}>
        {instructions === null ? <p style={st.muted}>Site instructions could not be loaded. Retry when the Site service is available.</p> : <SiteInstructionsClient initialInstructions={rows ?? []} initialProjectId={projectId} projects={projectOptions} projectsUnavailable={!projectId && projects === null} />}
      </section>
    </div>
  );
}

const st = {
  page: { maxWidth: 1040, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 28, margin: '0 0 6px', letterSpacing: -0.5 } as CSSProperties,
  sub: { color: 'var(--muted)', margin: '0 0 22px', maxWidth: 720, lineHeight: 1.5 } as CSSProperties,
  muted: { color: 'var(--muted)', padding: '14px 12px', margin: 0 } as CSSProperties,
};
