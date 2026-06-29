import { type NextRequest } from 'next/server';
import { apiBase, authHeader } from '@/lib/api';

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const invoiceId = searchParams.get('invoiceId');
  const query = invoiceId ? `?invoiceId=${invoiceId}` : '';

  try {
    const res = await fetch(`${apiBase()}/api/v1/finance/payments${query}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ([]));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Finance Payments API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    invoiceId?: unknown;
    bankAccountId?: unknown;
    amount?: unknown;
    reference?: unknown;
  };

  const invoiceId = typeof body.invoiceId === 'string' ? body.invoiceId : '';
  const bankAccountId = typeof body.bankAccountId === 'string' ? body.bankAccountId : '';
  const amount = typeof body.amount === 'number' ? body.amount : Number(body.amount) || 0;

  if (!invoiceId) return Response.json({ error: 'invoiceId required' }, { status: 400 });
  if (!bankAccountId) return Response.json({ error: 'bankAccountId required' }, { status: 400 });
  if (amount <= 0) return Response.json({ error: 'amount must be positive' }, { status: 400 });

  try {
    const res = await fetch(`${apiBase()}/api/v1/finance/payments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        invoiceId,
        bankAccountId,
        amount,
        reference: typeof body.reference === 'string' ? body.reference : undefined,
      }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Finance Payments API unreachable' }, { status: 502 });
  }
}
