import { apiBase, authHeader } from '@/lib/api';

// BFF: Form Designer — one schema's fields + overrides; save / reset the patch.

async function proxy(method: 'GET' | 'PUT' | 'DELETE', id: string, body?: unknown): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/admin/forms/${encodeURIComponent(id)}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(await authHeader()),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Forms API unreachable' }, { status: 502 });
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxy('GET', id);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxy('PUT', id, await req.json().catch(() => ({})));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return proxy('DELETE', id);
}
