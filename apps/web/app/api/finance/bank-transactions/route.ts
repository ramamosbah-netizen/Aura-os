import { type NextRequest } from 'next/server';
import { apiBase, authHeader } from '@/lib/api';

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl;
  const bankAccountId = searchParams.get('bankAccountId');
  const status = searchParams.get('status');
  if (!bankAccountId) {
    return Response.json({ error: 'bankAccountId required' }, { status: 400 });
  }

  const query = `?bankAccountId=${bankAccountId}` + (status ? `&status=${status}` : '');

  try {
    const res = await fetch(`${apiBase()}/api/v1/finance/bank-transactions${query}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ([]));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Bank transactions API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    bankAccountId?: unknown;
    transactions?: unknown;
  };

  const bankAccountId = typeof body.bankAccountId === 'string' ? body.bankAccountId : '';
  const transactions = Array.isArray(body.transactions) ? body.transactions : null;

  if (!bankAccountId) return Response.json({ error: 'bankAccountId required' }, { status: 400 });
  if (!transactions) return Response.json({ error: 'transactions list required' }, { status: 400 });

  try {
    const res = await fetch(`${apiBase()}/api/v1/finance/bank-transactions/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ bankAccountId, transactions }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Bank transactions import API unreachable' }, { status: 502 });
  }
}
