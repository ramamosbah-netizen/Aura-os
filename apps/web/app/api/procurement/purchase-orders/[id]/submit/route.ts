import { apiBase, authHeader } from '@/lib/api';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  try {
    const res = await fetch(`${apiBase()}/api/v1/procurement/purchase-orders/${id}/submit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Procurement API unreachable' }, { status: 502 });
  }
}
