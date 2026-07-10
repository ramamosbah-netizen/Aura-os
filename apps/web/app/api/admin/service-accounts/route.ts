import { apiBase, authHeader } from '@/lib/api';

// BFF: service accounts / API keys (Vol 15 §2.5) — list + create (key returned once).

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/admin/service-accounts`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Service-accounts API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/admin/service-accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Service-accounts API unreachable' }, { status: 502 });
  }
}
