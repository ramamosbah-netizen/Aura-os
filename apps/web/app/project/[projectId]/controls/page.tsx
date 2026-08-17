import { notFound } from 'next/navigation';
import { fetchJson } from '@/lib/api';
import DataStateNotice from '@/components/ui/data-state';
import RecordChrome from '@/components/record-chrome';
import Project360Client, { type Project360Project } from '@/components/project-360-client';

export const dynamic = 'force-dynamic';

/**
 * Canonical commercial/control view inside Project 360. Domain APIs remain owned
 * by Projects, Contracts and Finance; this page only composes their project context.
 */
export default async function ProjectControlsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const result = await fetchJson<Project360Project>(`/api/projects/projects/${projectId}`);
  if (!result.ok) {
    if (result.error.kind === 'not-found') notFound();
    return <DataStateNotice error={result.error} subject="project controls" />;
  }

  return (
    <main data-testid="project-controls" style={{ maxWidth: 1320, margin: '0 auto' }}>
      <RecordChrome type="Project" title={result.data.title} />
      <Project360Client project={result.data} />
    </main>
  );
}
