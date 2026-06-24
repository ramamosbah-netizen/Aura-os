import { apiBase } from '../../../../lib/api';

// BFF: forward account creation to the Nest CRM API server-side.
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === 'string' ? body.name : '';
  if (!name.trim()) {
    return Response.json({ error: 'name required' }, { status: 400 });
  }
  try {
    const res = await fetch(`${apiBase()}/api/crm/accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'CRM API unreachable' }, { status: 502 });
  }
}
