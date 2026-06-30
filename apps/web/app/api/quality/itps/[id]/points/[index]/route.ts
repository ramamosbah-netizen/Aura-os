import { apiBase, authHeader } from '@/lib/api';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; index: string }> }): Promise<Response> {
  const { id, index } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/quality/itps/${id}/points/${index}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Quality API unreachable' }, { status: 502 });
  }
}
