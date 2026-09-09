import { forwardToProjects, text } from '@/lib/projects-proxy';

/**
 * §21 — move a risk's lifecycle.
 *
 * MATERIALISED is not reachable here, and is refused before the request is even made. A risk is
 * marked as having occurred only by materialising it into an issue, in one transaction — so that a
 * risk can never read as landed with no live problem to point at. The API and the domain both
 * refuse it too; this is the outermost of three.
 */
const MOVES = ['OPEN', 'MITIGATING', 'ACCEPTED', 'RESOLVED'];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const status = text(body.status);

  if (!status) return Response.json({ error: 'status required' }, { status: 400 });
  if (status === 'MATERIALISED') {
    return Response.json(
      { error: 'a risk is marked materialised by materialising it into an issue, not by a status change' },
      { status: 409 },
    );
  }
  if (!MOVES.includes(status)) {
    return Response.json({ error: `status must be one of: ${MOVES.join(', ')}` }, { status: 400 });
  }

  // `note` carries the acceptance reason. The domain refuses ACCEPTED without one.
  return forwardToProjects(`risks/${id}/status`, {
    method: 'PATCH',
    body: { status, note: text(body.note) },
  });
}
