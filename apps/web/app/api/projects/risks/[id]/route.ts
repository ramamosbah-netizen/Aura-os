import { forwardToProjects, text } from '@/lib/projects-proxy';

/** §21 — one risk: read and edit. Status moves live at `[id]/status`. */

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return forwardToProjects(`risks/${id}`);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  // `status` is absent on purpose. A lifecycle move is not a field edit — it has its own route,
  // its own guards and its own event. Forwarding it here would let a status change ride in on a
  // title edit, unlogged.
  return forwardToProjects(`risks/${id}`, {
    method: 'PATCH',
    body: {
      title: text(body.title),
      reference: text(body.reference),
      description: text(body.description),
      area: text(body.area),
      likelihood: text(body.likelihood),
      impact: text(body.impact),
      mitigation: text(body.mitigation),
      owner: text(body.owner),
      targetDate: text(body.targetDate),
    },
  });
}
