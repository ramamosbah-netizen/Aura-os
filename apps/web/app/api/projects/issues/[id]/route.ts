import { forwardToProjects, issueReferences, text } from '@/lib/projects-proxy';

/** §21 — one issue: read and edit. Status moves live at `[id]/status`. */

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return forwardToProjects(`issues/${id}`);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  // Neither `status` nor `originRiskId` is forwarded. The first has its own route; the second is
  // provenance, written once at materialisation. An issue that could change which risk it came
  // from would make the risk register unauditable.
  return forwardToProjects(`issues/${id}`, {
    method: 'PATCH',
    body: {
      title: text(body.title),
      reference: text(body.reference),
      description: text(body.description),
      area: text(body.area),
      severity: text(body.severity),
      owner: text(body.owner),
      raisedAt: text(body.raisedAt),
      dueDate: text(body.dueDate),
      references: issueReferences(body.references),
    },
  });
}
