import type { CSSProperties } from 'react';
import ProjectTeam from '@/components/project-team';

export const dynamic = 'force-dynamic';

/** The project's delivery team, inside the workspace shell (reuses the P1 Team surface). */
export default async function ProjectTeamPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <div>
      <h1 style={st.h1}>
        <span style={{ marginRight: 8 }}>👥</span>Team
      </h1>
      <ProjectTeam projectId={projectId} />
    </div>
  );
}

const st = {
  h1: { fontSize: 22, margin: '0 0 16px', color: 'var(--accent)', display: 'flex', alignItems: 'center' } as CSSProperties,
};
