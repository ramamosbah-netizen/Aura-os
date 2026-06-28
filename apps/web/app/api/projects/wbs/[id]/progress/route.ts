import { apiBase, authHeader } from '@/lib/api';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    progress?: unknown;
    status?: unknown;
  };

  if (body.progress === undefined) {
    return Response.json({ error: 'progress is required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${apiBase()}/api/projects/wbs/${id}/progress`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        progress: Number(body.progress),
        status: typeof body.status === 'string' ? body.status : undefined,
      }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
