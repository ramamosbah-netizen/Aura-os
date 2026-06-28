import { apiBase, authHeader } from '@/lib/api';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
): Promise<Response> {
  const { id, itemId } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const res = await fetch(`${apiBase()}/api/tendering/tenders/${id}/boq/items/${itemId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Tendering API unreachable' }, { status: 502 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
): Promise<Response> {
  const { id, itemId } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/tendering/tenders/${id}/boq/items/${itemId}`, {
      method: 'DELETE',
      headers: await authHeader(),
      cache: 'no-store',
    });
    if (res.status === 204 || res.status === 200) {
      return new Response(null, { status: 204 });
    }
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Tendering API unreachable' }, { status: 502 });
  }
}
