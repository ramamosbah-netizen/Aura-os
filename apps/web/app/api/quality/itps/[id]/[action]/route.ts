import { apiBase, authHeader } from '@/lib/api';

const ALLOWED = new Set(['activate', 'close']);

export async function PUT(_req: Request, { params }: { params: Promise<{ id: string; action: string }> }): Promise<Response> {
  const { id, action } = await params;
  if (!ALLOWED.has(action)) return Response.json({ error: 'unknown action' }, { status: 404 });
  try {
    const res = await fetch(`${apiBase()}/api/v1/quality/itps/${id}/${action}`, {
      method: 'PUT',
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Quality API unreachable' }, { status: 502 });
  }
}
