import { apiBase, authHeader, replayHeaders } from '@/lib/api';

async function forward(request: Request, method: 'PATCH' | 'DELETE', source: string, id: string): Promise<Response> {
  try {
    const body = method === 'PATCH' ? await request.json().catch(() => ({})) : null;
    const res = await fetch(`${apiBase()}/api/v1/work-items/${encodeURIComponent(source)}/${encodeURIComponent(id)}`, {
      method,
      headers: { 'content-type': 'application/json', ...(await authHeader()), ...replayHeaders(request) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Work items API unreachable' }, { status: 502 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ source: string; id: string }> }): Promise<Response> {
  const { source, id } = await params;
  return forward(request, 'PATCH', source, id);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ source: string; id: string }> }): Promise<Response> {
  const { source, id } = await params;
  return forward(request, 'DELETE', source, id);
}
