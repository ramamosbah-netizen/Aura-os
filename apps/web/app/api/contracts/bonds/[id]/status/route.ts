import { apiBase, authHeader } from '@/lib/api';

// BFF: bond lifecycle — release / call / expire.

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const res = await fetch(`${apiBase()}/api/v1/contracts/bonds/${id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Contracts API unreachable' }, { status: 502 });
  }
}
