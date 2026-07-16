import { apiBase, authHeader } from '@/lib/api';

// BFF: §26 installed base — edit / remove one recorded system.

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; itemId: string }> }): Promise<Response> {
  const { id, itemId } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/accounts/${id}/installed-base/${itemId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; itemId: string }> }): Promise<Response> {
  const { id, itemId } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/accounts/${id}/installed-base/${itemId}`, {
      method: 'DELETE',
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
