import { type NextRequest } from 'next/server';
import { apiBase, authHeader } from '@/lib/api';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    status?: unknown;
  };

  const status = typeof body.status === 'string' ? body.status : '';
  if (!status) return Response.json({ error: 'status required' }, { status: 400 });

  try {
    const res = await fetch(`${apiBase()}/api/projects/delays/${id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ status }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
