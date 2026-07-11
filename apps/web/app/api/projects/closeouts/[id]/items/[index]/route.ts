import { apiBase, authHeader } from '@/lib/api';

// BFF: toggle one closeout checklist item.

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; index: string }> }): Promise<Response> {
  const { id, index } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const res = await fetch(`${apiBase()}/api/v1/projects/closeouts/${id}/items/${index}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
