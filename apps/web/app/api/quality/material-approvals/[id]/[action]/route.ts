import { apiBase, authHeader } from '@/lib/api';

const ALLOWED = new Set(['submit', 'review', 'revise']);

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; action: string }> }): Promise<Response> {
  const { id, action } = await params;
  if (!ALLOWED.has(action)) return Response.json({ error: 'unknown action' }, { status: 404 });
  const body = action === 'review' ? await request.json().catch(() => ({})) : undefined;
  try {
    const res = await fetch(`${apiBase()}/api/v1/quality/material-approvals/${id}/${action}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Quality API unreachable' }, { status: 502 });
  }
}
