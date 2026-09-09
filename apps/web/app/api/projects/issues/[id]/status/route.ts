import { forwardToProjects, text } from '@/lib/projects-proxy';

/**
 * §21 — move an issue's lifecycle.
 *
 * `resolved` and `withdrawn` both require a note, and the check is repeated here rather than left
 * to the API so the person gets the refusal without a round trip. The two endings are kept apart:
 * `resolved` means the condition is gone, `withdrawn` means it ended without being solved.
 */
const MOVES = ['open', 'in_progress', 'resolved', 'withdrawn'];
const ENDINGS = ['resolved', 'withdrawn'];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const status = text(body.status);
  const note = text(body.note);

  if (!status) return Response.json({ error: 'status required' }, { status: 400 });
  if (!MOVES.includes(status)) {
    return Response.json({ error: `status must be one of: ${MOVES.join(', ')}` }, { status: 400 });
  }
  if (ENDINGS.includes(status) && !note) {
    return Response.json(
      { error: `${status === 'resolved' ? 'resolving' : 'withdrawing'} an issue requires a note` },
      { status: 400 },
    );
  }

  return forwardToProjects(`issues/${id}/status`, { method: 'PATCH', body: { status, note } });
}
