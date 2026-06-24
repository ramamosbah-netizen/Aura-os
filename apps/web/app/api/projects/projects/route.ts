import { apiBase } from '../../../../lib/api';

// BFF: forward project creation to the Nest Projects API server-side.
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    title?: unknown;
    value?: unknown;
    contractId?: unknown;
    contractTitle?: unknown;
    accountId?: unknown;
    accountName?: unknown;
  };
  const title = typeof body.title === 'string' ? body.title : '';
  if (!title.trim()) {
    return Response.json({ error: 'title required' }, { status: 400 });
  }
  try {
    const res = await fetch(`${apiBase()}/api/projects/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title,
        value: typeof body.value === 'number' ? body.value : 0,
        contractId: typeof body.contractId === 'string' ? body.contractId : null,
        contractTitle: typeof body.contractTitle === 'string' ? body.contractTitle : null,
        accountId: typeof body.accountId === 'string' ? body.accountId : null,
        accountName: typeof body.accountName === 'string' ? body.accountName : null,
      }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Projects API unreachable' }, { status: 502 });
  }
}
