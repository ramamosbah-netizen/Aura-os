import { type NextRequest } from 'next/server';
import { apiBase, authHeader } from '@/lib/api';

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const projectId = searchParams.get('projectId');
  const parentId = searchParams.get('parentId');

  const query = new URLSearchParams();
  if (projectId) query.append('projectId', projectId);
  if (parentId) query.append('parentId', parentId);

  try {
    const res = await fetch(`${apiBase()}/api/v1/projects/wbs?${query.toString()}`, {
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
    parentId?: unknown;
    code?: unknown;
    title?: unknown;
    plannedValue?: unknown;
  };

  const projectId = typeof body.projectId === 'string' ? body.projectId : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';

  if (!projectId) return Response.json({ error: 'projectId required' }, { status: 400 });
  if (!code) return Response.json({ error: 'code required' }, { status: 400 });
  if (!title) return Response.json({ error: 'title required' }, { status: 400 });

  try {
    const res = await fetch(`${apiBase()}/api/v1/projects/wbs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        projectId,
        parentId: typeof body.parentId === 'string' ? body.parentId : null,
        code,
        title,
        plannedValue: typeof body.plannedValue === 'number' ? body.plannedValue : Number(body.plannedValue) || 0,
      }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
