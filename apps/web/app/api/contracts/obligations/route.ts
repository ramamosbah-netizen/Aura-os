import { apiBase, authHeader } from '@/lib/api';

// BFF: contract obligations — list (?contractId=) + create.

export async function GET(req: Request): Promise<Response> {
  const qs = new URL(req.url).search;
  try {
    const res = await fetch(`${apiBase()}/api/v1/contracts/obligations${qs}`, { headers: await authHeader(), cache: 'no-store' });
    const data = await res.json().catch(() => []);
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Contracts API unreachable' }, { status: 502 });
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => ({}));
    const res = await fetch(`${apiBase()}/api/v1/contracts/obligations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Contracts API unreachable' }, { status: 502 });
  }
}
