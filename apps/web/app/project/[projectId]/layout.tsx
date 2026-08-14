import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getJson } from '@/lib/api';
import ProjectShell from '@/components/project-shell';

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
  const project = await getJson<ProjectHead>(`/api/projects/projects/${projectId}`);
  if (!project) notFound();

  return <ProjectShell project={project}>{children}</ProjectShell>;
}
