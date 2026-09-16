import { apiFetch, apiBase, authHeader } from '@/lib/api';

const base = (id: string) => `${apiBase()}/api/v1/procurement/purchase-orders/${encodeURIComponent(id)}/lines`;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(base(id), { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => []), { status: res.status });
  } catch {
    return Response.json({ error: 'Order lines API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await apiFetch(base(id), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      // `|| '{}'`: a body-less request declaring a JSON content-type is rejected by the parser
      // before any rule is reached — found twice during Wave 3, on two different routes.
      body: (await request.text()) || '{}',
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Order lines API unreachable' }, { status: 502 });
  }
}
