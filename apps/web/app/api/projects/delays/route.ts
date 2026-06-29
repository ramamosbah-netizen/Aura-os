import { type NextRequest } from 'next/server';
import { apiBase, authHeader } from '@/lib/api';

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const projectId = searchParams.get('projectId');
  const causeCategory = searchParams.get('causeCategory');

  const query = new URLSearchParams();
  if (projectId) query.append('projectId', projectId);
  if (causeCategory) query.append('causeCategory', causeCategory);

  try {
    const res = await fetch(`${apiBase()}/api/v1/projects/delays?${query.toString()}`, {
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
    causeCategory?: unknown;
    startDate?: unknown;
    endDate?: unknown;
    delayDays?: unknown;
    isConcurrent?: unknown;
    linkedActivityCode?: unknown;
    description?: unknown;
  };

  const projectId = typeof body.projectId === 'string' ? body.projectId : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const startDate = typeof body.startDate === 'string' ? body.startDate : '';

  if (!projectId) return Response.json({ error: 'projectId required' }, { status: 400 });
  if (!title) return Response.json({ error: 'title required' }, { status: 400 });
  if (!startDate) return Response.json({ error: 'startDate required' }, { status: 400 });

  try {
    const res = await fetch(`${apiBase()}/api/v1/projects/delays`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        projectId,
        title,
        startDate,
        causeCategory: typeof body.causeCategory === 'string' ? body.causeCategory : 'weather',
        endDate: typeof body.endDate === 'string' ? body.endDate : undefined,
        delayDays: typeof body.delayDays === 'number' ? body.delayDays : Number(body.delayDays) || undefined,
        isConcurrent: typeof body.isConcurrent === 'boolean' ? body.isConcurrent : false,
        linkedActivityCode: typeof body.linkedActivityCode === 'string' ? body.linkedActivityCode : undefined,
        description: typeof body.description === 'string' ? body.description : '',
      }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
