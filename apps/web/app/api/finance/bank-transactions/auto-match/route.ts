import { apiBase, authHeader } from '@/lib/api';

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    bankAccountId?: unknown;
  };

  const bankAccountId = typeof body.bankAccountId === 'string' ? body.bankAccountId : '';
  if (!bankAccountId) return Response.json({ error: 'bankAccountId required' }, { status: 400 });

  try {
    const res = await fetch(`${apiBase()}/api/finance/bank-transactions/auto-match`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ bankAccountId }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Bank transactions auto-match API unreachable' }, { status: 502 });
  }
}
