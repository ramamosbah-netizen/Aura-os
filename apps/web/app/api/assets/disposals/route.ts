import { apiBase, authHeader } from '@/lib/api';

// BFF: asset disposals — list + create (sale / scrap / write-off / trade-in / donation).

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/assets/disposals`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ([]));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Assets API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/assets/disposals`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Assets API unreachable' }, { status: 502 });
  }
}
