import { apiBase, authHeader } from '@/lib/api';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { amount?: unknown };
  const amount = typeof body.amount === 'number' ? body.amount : Number(body.amount) || 0;
  if (!(amount > 0)) return Response.json({ error: 'amount must be positive' }, { status: 400 });

  try {
    const res = await fetch(`${apiBase()}/api/v1/subcontracts/back-charges/${id}/recover`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ amount }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Subcontracts API unreachable' }, { status: 502 });
  }
}
