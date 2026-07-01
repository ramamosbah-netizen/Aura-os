import { apiBase, authHeader } from '@/lib/api';

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/notifications/${id}/read`, {
      method: 'PATCH',
      headers: { ...(await authHeader()) },
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'API unreachable' }, { status: 502 });
  }
}
