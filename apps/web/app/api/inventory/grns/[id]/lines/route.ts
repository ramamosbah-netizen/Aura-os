import { apiFetch, apiBase, authHeader } from '@/lib/api';

const base = (id: string) => `${apiBase()}/api/v1/inventory/grns/${encodeURIComponent(id)}/lines`;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(base(id), { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => []), { status: res.status });
  } catch {
    return Response.json({ error: 'Receipt lines API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(base(id), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: (await request.text()) || '{}',
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Receipt lines API unreachable' }, { status: 502 });
  }
}
