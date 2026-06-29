import { type NextRequest } from 'next/server';
import { apiBase, authHeader } from '@/lib/api';

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get('status');
  const projectId = searchParams.get('projectId');

  const query = new URLSearchParams();
  if (status) query.append('status', status);
  if (projectId) query.append('projectId', projectId);

  try {
    const res = await fetch(`${apiBase()}/api/v1/procurement/purchase-requests?${query.toString()}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ([]));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Procurement PR API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    title?: unknown;
    reference?: unknown;
    projectId?: unknown;
    projectName?: unknown;
    value?: unknown;
  };

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return Response.json({ error: 'title is required' }, { status: 400 });

  try {
    const res = await fetch(`${apiBase()}/api/v1/procurement/purchase-requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        title,
        reference: typeof body.reference === 'string' ? body.reference.trim() : undefined,
        projectId: typeof body.projectId === 'string' ? body.projectId : null,
        projectName: typeof body.projectName === 'string' ? body.projectName : null,
        value: typeof body.value === 'number' ? body.value : Number(body.value) || 0,
      }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Procurement PR API unreachable' }, { status: 502 });
  }
}
