import { apiBase, authHeader } from '@/lib/api';

export async function GET(): Promise<Response> {
  try {
    const res = await fetch(`${apiBase()}/api/v1/quality/itps`, { headers: await authHeader(), cache: 'no-store' });
    return Response.json(res.ok ? await res.json() : [], { status: res.ok ? 200 : res.status });
  } catch {
    return Response.json([], { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/quality/itps`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Quality API unreachable' }, { status: 502 });
  }
}
