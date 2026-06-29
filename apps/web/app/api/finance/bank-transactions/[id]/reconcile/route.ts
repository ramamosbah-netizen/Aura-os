import { apiBase, authHeader } from '@/lib/api';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    paymentId?: unknown;
  };

  const paymentId = typeof body.paymentId === 'string' ? body.paymentId : '';
  if (!paymentId) return Response.json({ error: 'paymentId required' }, { status: 400 });

  try {
    const res = await fetch(`${apiBase()}/api/v1/finance/bank-transactions/${id}/reconcile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ paymentId }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Bank transaction manual reconcile API unreachable' }, { status: 502 });
  }
}
