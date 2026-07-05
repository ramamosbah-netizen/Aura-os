import { apiBase, authHeader } from '@/lib/api';

// BFF: forward account creation to the Nest CRM API server-side.
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    name?: unknown;
    status?: unknown;
    industry?: unknown;
    website?: unknown;
  };
  const name = typeof body.name === 'string' ? body.name : '';
  if (!name.trim()) {
    return Response.json({ error: 'name required' }, { status: 400 });
  }
  try {
    const res = await fetch(`${apiBase()}/api/v1/crm/accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        name,
        status: typeof body.status === 'string' ? body.status : undefined,
        industry: typeof body.industry === 'string' ? body.industry : undefined,
        website: typeof body.website === 'string' ? body.website : undefined,
      }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
