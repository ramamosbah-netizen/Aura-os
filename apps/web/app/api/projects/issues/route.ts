import { type NextRequest } from 'next/server';
import { forwardToProjects, issueReferences, projectsQuery, text } from '@/lib/projects-proxy';

/** §21 issue register — list and raise. */

export async function GET(request: NextRequest): Promise<Response> {
  const query = projectsQuery(request.nextUrl.searchParams, [
    'projectId', 'status', 'area', 'severity', 'openOnly', 'fromRiskOnly',
  ]);
  return forwardToProjects(`issues${query}`);
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const projectId = text(body.projectId);
  const title = text(body.title);
  if (!projectId) return Response.json({ error: 'projectId required' }, { status: 400 });
  if (!title) return Response.json({ error: 'title required' }, { status: 400 });

  // `originRiskId` is not forwarded, and the API refuses it on this path anyway. An issue that
  // came from a risk is created only by materialising that risk, so that provenance has exactly
  // one writer and cannot claim a risk landed while it sits OPEN on the register.
  return forwardToProjects('issues', {
    method: 'POST',
    body: {
      projectId,
      title,
      reference: text(body.reference),
      description: text(body.description),
      area: text(body.area),
      severity: text(body.severity),
      owner: text(body.owner),
      // When the condition was OBSERVED — distinct from when this row is being typed.
      raisedAt: text(body.raisedAt),
      dueDate: text(body.dueDate),
      references: issueReferences(body.references),
    },
  });
}
