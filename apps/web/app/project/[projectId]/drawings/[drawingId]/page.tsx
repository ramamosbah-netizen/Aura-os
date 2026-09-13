import { notFound } from 'next/navigation';
import { getJson } from '@/lib/api';
import Drawing360, { type Drawing, type Submission, type Review } from '@/components/drawing-360';

export const dynamic = 'force-dynamic';

/**
 * A drawing, reached inside the project that owns it — the canonical route.
 *
 * ## Why the project is in the path
 *
 * The permission guard (`core/src/identity/permissions.guard.ts`) stamps `resource: project:<id>`
 * onto the access target only when the project is knowable WITHOUT loading the record: a
 * `:projectId` route param, or `projectId` in the body or query. A route that addresses a drawing
 * by its own id alone gives the guard nothing, so it falls back to an org-wide grant — which is
 * why `/engineering/drawings/{id}` could be opened by anyone in the tenant. Putting the project in
 * the path is not decoration: it is what lets an existing, already-built enforcement path run.
 *
 * ## Why that is not sufficient on its own
 *
 * Exactly BECAUSE the guard now authorises against the project in the URL, the URL must not be
 * allowed to lie. A member of project A who learns a drawing id belonging to project B could ask
 * for `/project/A/drawings/{B's drawing}`; the guard would see project A, find a valid grant, and
 * allow it. So after the record is loaded it is checked against the path, and a mismatch is a 404 —
 * not a redirect to the right project, which would confirm the drawing exists and say where.
 *
 * Two checks, in this order:
 *   1. may this actor act on the project in the path?   (the guard, before the fetch)
 *   2. does the record actually belong to that project?  (here, after it)
 *
 * Neither replaces the other. The first without the second lets the URL assert a false
 * relationship; the second without the first is not an authorisation check at all.
 */
export default async function ProjectDrawingPage({
  params,
}: {
  params: Promise<{ projectId: string; drawingId: string }>;
}) {
  const { projectId, drawingId } = await params;

  // `projectId` on the query is what lets the guard authorise a project MEMBER at all: without it
  // the access target carries no resource, a project-scoped grant has nothing to match, and the
  // member is refused their own project's drawing. Proven, not assumed — the same request without
  // it returns 403 for a member of the project the drawing belongs to.
  const scope = `?projectId=${encodeURIComponent(projectId)}`;
  const drawing = await getJson<Drawing>(`/api/engineering/drawings/${drawingId}${scope}`);
  if (!drawing) notFound();

  // THE MISMATCH GUARD. Same response as a drawing that does not exist, deliberately: a distinct
  // "wrong project" message would tell an unauthorised caller that the id is real.
  if (drawing.projectId !== projectId) notFound();

  const [revisions, submissions, reviews] = await Promise.all([
    getJson<Drawing[]>(
      `/api/engineering/drawings/revisions?projectId=${encodeURIComponent(drawing.projectId)}&code=${encodeURIComponent(drawing.code)}`,
    ),
    getJson<Submission[]>(`/api/engineering/drawings/${drawingId}/submissions${scope}`),
    getJson<Review[]>(`/api/engineering/drawings/${drawingId}/reviews${scope}`),
  ]);

  return (
    <Drawing360
      drawing={drawing}
      revisions={revisions}
      submissions={submissions}
      reviews={reviews}
      crumbs={[
        { label: drawing.projectName ?? 'Project', href: `/project/${projectId}` },
        { label: 'Drawings', href: `/project/${projectId}/drawings` },
        { label: drawing.code },
      ]}
    />
  );
}
