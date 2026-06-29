import { type NextRequest } from 'next/server';
import { apiBase, authHeader } from '@/lib/api';

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const projectId = searchParams.get('projectId');

  const query = new URLSearchParams();
  if (projectId) query.append('projectId', projectId);

  try {
    const res = await fetch(`${apiBase()}/api/v1/projects/eot-claims?${query.toString()}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ([]));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    projectId?: unknown;
    title?: unknown;
    submittedDays?: unknown;
    justification?: unknown;
    originalCompletionDate?: unknown;
    delayEventIds?: unknown;
  };

  const projectId = typeof body.projectId === 'string' ? body.projectId : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const submittedDays = typeof body.submittedDays === 'number' ? body.submittedDays : Number(body.submittedDays) || 0;

  if (!projectId) return Response.json({ error: 'projectId required' }, { status: 400 });
  if (!title) return Response.json({ error: 'title required' }, { status: 400 });
  if (!submittedDays) return Response.json({ error: 'submittedDays required' }, { status: 400 });

  try {
    const res = await fetch(`${apiBase()}/api/v1/projects/eot-claims`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        projectId,
        title,
        submittedDays,
        justification: typeof body.justification === 'string' ? body.justification : '',
        originalCompletionDate: typeof body.originalCompletionDate === 'string' ? body.originalCompletionDate : undefined,
        delayEventIds: Array.isArray(body.delayEventIds) ? body.delayEventIds : [],
      }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
