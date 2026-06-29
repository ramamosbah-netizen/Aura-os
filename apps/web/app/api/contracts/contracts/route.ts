import { apiBase, authHeader } from '@/lib/api';

// BFF: forward contract creation to the Nest Contracts API server-side.
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    title?: unknown;
    value?: unknown;
    tenderId?: unknown;
    tenderTitle?: unknown;
    accountId?: unknown;
    accountName?: unknown;
  };
  const title = typeof body.title === 'string' ? body.title : '';
  if (!title.trim()) {
    return Response.json({ error: 'title required' }, { status: 400 });
  }
  try {
    const res = await fetch(`${apiBase()}/api/v1/contracts/contracts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        title,
        value: typeof body.value === 'number' ? body.value : 0,
        tenderId: typeof body.tenderId === 'string' ? body.tenderId : null,
        tenderTitle: typeof body.tenderTitle === 'string' ? body.tenderTitle : null,
        accountId: typeof body.accountId === 'string' ? body.accountId : null,
        accountName: typeof body.accountName === 'string' ? body.accountName : null,
      }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Contracts API unreachable' }, { status: 502 });
  }
}
