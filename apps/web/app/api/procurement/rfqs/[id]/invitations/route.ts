import { apiFetch, apiBase, authHeader } from '@/lib/api';

// BFF: ask a supplier from the register to quote on this enquiry (BUY-03).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { supplierId?: unknown };
  try {
    const res = await apiFetch(`${apiBase()}/api/v1/procurement/rfqs/${id}/invitations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ supplierId: typeof body.supplierId === 'string' ? body.supplierId : undefined }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Procurement API unreachable' }, { status: 502 });
  }
}
