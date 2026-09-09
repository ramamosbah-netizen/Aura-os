import { type NextRequest } from 'next/server';
import { forwardToProjects, projectsQuery, text } from '@/lib/projects-proxy';

/** §21 risk register — list and raise. */

export async function GET(request: NextRequest): Promise<Response> {
  const query = projectsQuery(request.nextUrl.searchParams, ['projectId', 'status', 'area', 'openOnly']);
  return forwardToProjects(`risks${query}`);
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const projectId = text(body.projectId);
  const title = text(body.title);
  if (!projectId) return Response.json({ error: 'projectId required' }, { status: 400 });
  if (!title) return Response.json({ error: 'title required' }, { status: 400 });

  return forwardToProjects('risks', {
    method: 'POST',
    body: {
      projectId,
      title,
      reference: text(body.reference),
      description: text(body.description),
      area: text(body.area),
      // Likelihood and impact are forwarded; SEVERITY is not, and must never be. It is derived
      // from the two by the domain, and accepting it here would let a caller state a severity the
      // matrix did not produce.
      likelihood: text(body.likelihood),
      impact: text(body.impact),
      mitigation: text(body.mitigation),
      owner: text(body.owner),
      targetDate: text(body.targetDate),
    },
  });
}
