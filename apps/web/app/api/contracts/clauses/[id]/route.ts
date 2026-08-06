import { apiBase, authHeader } from '@/lib/api';

// BFF: revise a clause (bumps its revision) or retire/restore it.

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body.tags === 'string') {
      body.tags = body.tags.split(',').map((t: string) => t.trim()).filter(Boolean);
    }
    const res = await fetch(`${apiBase()}/api/v1/contracts/clauses/${id}`, {
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
