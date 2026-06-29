import { apiBase, authHeader } from '@/lib/api';

const ALLOWED = new Set(['assign', 'dispute', 'pay']);

export async function PUT(request: Request, props: { params: Promise<{ id: string; action: string }> }): Promise<Response> {
  const { id, action } = await props.params;
  if (!ALLOWED.has(action)) return Response.json({ error: 'unknown action' }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/fleet/fines/${id}/${action}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Fleet API unreachable' }, { status: 502 });
  }
}
