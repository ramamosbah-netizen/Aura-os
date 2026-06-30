import { apiBase, authHeader } from '@/lib/api';

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/finance/fx/rates`, { headers: { ...(await authHeader()) }, cache: 'no-store' });
    return Response.json(await res.json().catch(() => []), { status: res.status });
  } catch {
    return Response.json({ error: 'Finance API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/finance/fx/rates`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    return Response.json(await res.json().catch(() => ({})), { status: res.status });
  } catch {
    return Response.json({ error: 'Finance API unreachable' }, { status: 502 });
  }
}
