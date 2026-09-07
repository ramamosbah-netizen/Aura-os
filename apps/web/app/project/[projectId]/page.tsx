import { notFound } from 'next/navigation';
import { fetchJson } from '@/lib/api';
import DataStateNotice from '@/components/ui/data-state';
import Project360Client, { type Project360Project } from '@/components/project-360-client';

export const dynamic = 'force-dynamic';

/**
 * Project 360.
 *
 * This route used to render a second, hand-written dashboard: its own header, its own health
 * cards, its own attention list, with the thresholds computed inline in the route file. The
 * record itself lived one click away under /controls. So a project had TWO overviews that
 * answered the same questions from different code, and a reader had no way to know which was
 * current — the failure mode this codebase spent the navigation work removing everywhere else.
 *
 * Both routes now render the same record. `/controls` keeps working and keeps its `?tab=` deep
 * links, because things across the app point at it.
 *
 * The `project-command-center` test id stays on this route deliberately. It is what the project
 * shell keys its launcher off (`showFullLauncher = isOverview`), and what the browser suite uses
 * to assert that a delivery area was reached through the shell rather than by typing a URL.
 */
export default async function ProjectOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const result = await fetchJson<Project360Project>(`/api/projects/projects/${encodeURIComponent(projectId)}`);
  if (!result.ok) {
    if (result.error.kind === 'not-found') notFound();
    return <DataStateNotice error={result.error} subject="this project" />;
  }

  return (
    <main data-testid="project-command-center" style={{ maxWidth: 1320, margin: '0 auto' }}>
      <Project360Client project={result.data} initialTab={query.tab} />
    </main>
  );
}
