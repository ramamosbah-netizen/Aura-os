import { forwardToProjects, issueReferences, text } from '@/lib/projects-proxy';

/**
 * §21 — the risk OCCURRED: create the live issue and retire the risk, in one transaction.
 *
 * The project id is in the PATH, not the body. The API checks it against the risk rather than
 * trusting it, so a request naming one project while addressing a risk in another is refused
 * instead of quietly succeeding and creating the issue somewhere the caller did not expect.
 *
 * Severity is NOT carried over from the risk. The risk's was computed from a likelihood that no
 * longer exists — it happened — so someone states what this is doing to delivery now.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; riskId: string }> },
): Promise<Response> {
  const { id, riskId } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  return forwardToProjects(`projects/${id}/risks/${riskId}/materialise`, {
    method: 'POST',
    body: {
      title: text(body.title),
      description: text(body.description),
      severity: text(body.severity),
      owner: text(body.owner),
      dueDate: text(body.dueDate),
      raisedAt: text(body.raisedAt),
      references: issueReferences(body.references),
    },
  });
}
