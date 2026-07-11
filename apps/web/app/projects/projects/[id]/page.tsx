import type { CSSProperties } from 'react';
import { getJson } from '@/lib/api';
import RecordChrome from '../../../../components/record-chrome';
import Project360Client from '../../../../components/project-360-client';

export const dynamic = 'force-dynamic';

interface Project {
  id: string;
  title: string;
  reference: string | null;
  contractId: string | null;
  contractTitle: string | null;
  accountId: string | null;
  accountName: string | null;
  status: string;
  value: number;
  createdAt: string;
}

/**
 * Project 360 — delivery + commercial control: inherited budget vs variations vs
 * certification vs EVM, execution lifecycle, and the closeout that closes the
 * deal chain (completing the project completes the source contract).
 */
export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getJson<Project>(`/api/projects/projects/${id}`);

  if (!project) {
    return (
      <div style={st.container}>
        <h1 style={st.h1}>Project Not Found</h1>
        <a href="/projects/projects" style={st.link}>← Back to Projects</a>
      </div>
    );
  }

  return (
    <div style={st.container}>
      <RecordChrome type="Project" title={project.title} />
      <div style={st.navRow}>
        <a href="/projects/projects" style={st.link}>← Back to Projects</a>
      </div>
      <Project360Client project={project} />
    </div>
  );
}

const st = {
  container: { maxWidth: 1180, margin: '0 auto', padding: '28px 28px 64px' } as CSSProperties,
  h1: { fontSize: 24, margin: '0 0 10px', color: 'var(--accent)' } as CSSProperties,
  navRow: { marginBottom: 14 } as CSSProperties,
  link: { color: 'var(--accent)', textDecoration: 'none', fontSize: 14, fontWeight: 500 } as CSSProperties,
};
