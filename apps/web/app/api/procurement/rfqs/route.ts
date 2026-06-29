import { apiBase, authHeader } from '@/lib/api';

// BFF: list + create RFQs via the Nest procurement API.
export async function GET(request: Request): Promise<Response> {
  const status = new URL(request.url).searchParams.get('status');
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  try {
    const res = await fetch(`${apiBase()}/api/v1/procurement/rfqs${qs}`, {
      headers: await authHeader(),
      cache: 'no-store',
    });
    return Response.json(res.ok ? await res.json() : [], { status: res.ok ? 200 : res.status });
  } catch {
    return Response.json([], { status: 502 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  try {
    const res = await fetch(`${apiBase()}/api/v1/procurement/rfqs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'Procurement API unreachable' }, { status: 502 });
  }
}
