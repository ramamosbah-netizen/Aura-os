import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { fetchJson } from '@/lib/api';
import ProjectShell from '@/components/project-shell';
import DataStateNotice from '@/components/ui/data-state';
import { ProjectContextProvider } from '@/lib/project-context';

export const dynamic = 'force-dynamic';

interface ProjectHead {
  id: string;
  title: string;
  reference: string | null;
  status: string;
}

/**
 * Project Delivery Workspace (slice P3) — the shell every `/project/[id]/…` page renders inside.
 * Loads the project once and frames it; the child page provides the area content.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const result = await fetchJson<ProjectHead>(`/api/projects/projects/${projectId}`);
  if (!result.ok) {
    if (result.error.kind === 'not-found') notFound();
    return <main style={{ maxWidth: 760, margin: '0 auto', padding: 32 }}><DataStateNotice error={result.error} subject="this project" /></main>;
  }
  const project = result.data;

  return (
    <ProjectContextProvider project={project}>
      <ProjectShell project={project}>{children}</ProjectShell>
    </ProjectContextProvider>
  );
}
