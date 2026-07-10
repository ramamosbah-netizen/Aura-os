import { apiBase, authHeader } from '@/lib/api';

// BFF: per-user admin actions — activate/deactivate (POST {active}) and remove (DELETE).

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/admin/users/${encodeURIComponent(id)}/active`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Users API unreachable' }, { status: 502 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/admin/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Users API unreachable' }, { status: 502 });
  }
}
