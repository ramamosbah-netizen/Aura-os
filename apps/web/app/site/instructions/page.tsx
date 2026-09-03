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
  const [{ projectId }, instructions, projects] = await Promise.all([
    searchParams,
    getJson<SiteInstruction[]>('/api/site/instructions'),
    getJson<Project[]>('/api/projects/projects'),
  ]);
  const rows = projectId ? (instructions ?? []).filter((item) => item.projectId === projectId) : instructions;

  return (
    <div style={st.page}>
      <h1 style={st.h1}>Site · Instructions</h1>
      <p style={st.sub}>
        Formal site instructions (SI) issued by the consultant/engineer — tracked open → acknowledged →
        closed. Flag cost and/or time implications so they can be escalated to a variation or EOT claim.
      </p>
      <section style={{ marginTop: 10 }}>
        {instructions === null ? <p style={st.muted}>Site instructions could not be loaded. Retry when the Site service is available.</p> : <SiteInstructionsClient initialInstructions={rows ?? []} initialProjectId={projectId} projects={projects ?? []} projectsUnavailable={projects === null} />}
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
