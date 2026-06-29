import { apiBase, authHeader } from '@/lib/api';

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  try {
    const res = await fetch(`${apiBase()}/api/v1/amc/contracts?${searchParams.toString()}`, {
      method: 'GET',
      headers: await authHeader(),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ([]));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'AMC Contract API unreachable' }, { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const res = await fetch(`${apiBase()}/api/v1/amc/contracts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'AMC Contract API unreachable' }, { status: 502 });
  }
}
