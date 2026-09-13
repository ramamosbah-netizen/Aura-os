import { notFound, redirect } from 'next/navigation';
import { getJson } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * The old, project-less drawing URL. Kept working, and kept as the ONLY thing it can safely be:
 * a lookup that sends you to the canonical project-scoped route.
 *
 * It cannot render the drawing itself. A route addressed by drawing id alone gives the permission
 * guard no project to check a project-scoped grant against, so rendering here would be the hole
 * this slice exists to close. Redirecting instead means the enforced route decides.
 *
 * Known limit, recorded rather than glossed: resolving the redirect target reads the drawing, so a
 * caller who is not a member of its project can still learn that the id exists and which project it
 * belongs to. Closing that needs the API's own `GET drawings/:id` to resolve entity→project and
 * refuse — the "later slice" the guard's comment names. This route is narrower than what it
 * replaced, not yet airtight.
 */
export default async function LegacyDrawingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const drawing = await getJson<{ projectId: string }>(`/api/engineering/drawings/${id}`);
  if (!drawing?.projectId) notFound();
  redirect(`/project/${drawing.projectId}/drawings/${id}`);
}
