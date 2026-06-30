import { apiBase, authHeader } from '@/lib/api';

const ALLOWED = new Set(['approve', 'reject']);

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string; action: string }> }): Promise<Response> {
  const { id, action } = await params;
  if (!ALLOWED.has(action)) return Response.json({ error: 'unknown action' }, { status: 404 });
  try {
    const res = await fetch(`${apiBase()}/api/v1/subcontracts/variations/${id}/${action}`, {
      method: 'PATCH',
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Subcontracts API unreachable' }, { status: 502 });
  }
}
