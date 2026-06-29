import { apiBase, authHeader } from '@/lib/api';

// BFF: forward tender creation to the Nest Tendering API server-side.
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    title?: unknown;
    value?: unknown;
    accountId?: unknown;
    accountName?: unknown;
  };
  const title = typeof body.title === 'string' ? body.title : '';
  if (!title.trim()) {
    return Response.json({ error: 'title required' }, { status: 400 });
  }
  try {
    const res = await fetch(`${apiBase()}/api/v1/tendering/tenders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        title,
        value: typeof body.value === 'number' ? body.value : 0,
        accountId: typeof body.accountId === 'string' ? body.accountId : null,
        accountName: typeof body.accountName === 'string' ? body.accountName : null,
      }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Tendering API unreachable' }, { status: 502 });
  }
}
